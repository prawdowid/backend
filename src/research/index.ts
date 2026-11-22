/**
 * Evidence / research layer.
 *
 * Takes atomic claims from the pipeline and attaches evidence from:
 *   a) the local verified corpus (`../sources`),
 *   b) Google Fact Check Tools (unless `options.offline`).
 *
 * Design rule: be boring. A claim is only "confirmed" when a source actually
 * states the subject and the object — never because a vector score looked good.
 */

import { GoogleFactCheck } from "../modules/google";
import type { FactCheckClaim, FactCheckReview } from "../modules/google";
import { searchSources } from "../sources";
import type {
    ClaimInput,
    ClaimVerdict,
    Evidence,
    EvidenceRelation,
    ResearchOptions,
    ResearchResult,
    SourceHit,
    Strength,
    Verdict,
} from "../pipeline/types";

const CORPUS_LIMIT = 8;
const EXCERPT_MAX = 400;
const GOOGLE_PAGE_SIZE = 5;
const MODEL_ID = "deepseek/deepseek-v4.1-flash";
const COST_PER_CLAIM_USD = 0.0002;
const ARCHIVAL_DAYS = 1095; // ~3 lata
const MS_PER_DAY = 86_400_000;

const searchCorpus = searchSources;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 1): number {
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
}

/** Confidence is a UI number, not a measurement: keep it at two decimals. */
function roundConfidence(value: number): number {
    return Number(clamp(value).toFixed(2));
}

function truncate(value: string, max = EXCERPT_MAX): string {
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normalizeAsOf(value: string | undefined): string {
    if (value) {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

function strengthOf(confidence: number): Strength {
    if (confidence >= 0.85) return "high";
    if (confidence >= 0.6) return "medium";
    return "low";
}

function isArchival(publishedAt: string | null, asOf: string): boolean {
    if (!publishedAt) return false;
    const published = Date.parse(publishedAt);
    const reference = Date.parse(asOf);
    if (Number.isNaN(published) || Number.isNaN(reference)) return false;
    return reference - published > ARCHIVAL_DAYS * MS_PER_DAY;
}

function claimTextFor(claim: ClaimInput): string {
    const text = claim.text?.trim();
    if (text) return text;

    const fact = claim.fact;
    if (!fact) return claim.quote ?? "";
    const neg = fact.neg ? "NIE: " : "";
    return `${neg}${fact.s} — ${fact.p.replace(/_/g, " ")} — ${fact.o}`;
}

// ---------------------------------------------------------------------------
// subject / object matching (deliberately dumb, deliberately conservative)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
    "jest", "byl", "byla", "bylo", "byly", "będzie", "bedzie", "będą", "beda",
    "sie", "się", "tego", "tej", "tych", "jego", "jej", "ich", "jako", "przez",
    "który", "ktora", "która", "które", "ktore", "dla", "oraz", "albo", "lub",
    "nie", "tak", "the", "and", "with", "from", "that", "this", "have", "has",
]);

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Meaningful tokens only; digits count even when short (counts matter). */
function keywordsOf(value: string): string[] {
    return normalizeText(value)
        .split(" ")
        .filter((token) => token.length > 0)
        .filter((token) => (/^\d+$/.test(token) ? true : token.length >= 4 && !STOPWORDS.has(token)));
}

/** Crude Polish stemming: 5-char prefix handles inflacja/inflacji. */
function stemOf(token: string): string {
    return token.length > 5 ? token.slice(0, 5) : token;
}

function mentions(haystack: string, tokens: string[]): number {
    return tokens.filter((token) => haystack.includes(stemOf(token))).length;
}

/**
 * A corpus hit may become "supports" only when its summary names the subject
 * and enough of the object. A similarity score alone never upgrades a hit.
 */
function corpusMentionsClaim(haystack: string, claim: ClaimInput): boolean {
    const fact = claim.fact;
    if (!fact) return false;
    if (fact.neg) return false; // polarity unknown from a summary — stay at context

    const subject = keywordsOf(fact.s ?? "");
    const object = keywordsOf(String(fact.o ?? ""));
    if (subject.length === 0 || object.length === 0) return false;

    if (mentions(haystack, subject) === 0) return false;
    const needed = Math.max(1, Math.ceil(object.length * 0.5));
    return mentions(haystack, object) >= needed;
}

// ---------------------------------------------------------------------------
// rating -> verdict
// ---------------------------------------------------------------------------

type MappedRating = { verdict: Verdict; relation: EvidenceRelation };

// Order matters: "częściowo fałszywe" is misleading, not false; "nieprawda" is
// false, not true. Partial is checked first, then false, then true.
const PARTIAL_RE =
    /(cz[eę][sś]ciow|partly|partially|half[-\s]?(true|false)|p[oó][lł]praw|misleading|wprowadza(?:j[aą]c)?\s+w\s+b[łl][aą]d|zmanipulowan|manipulacj)/iu;
const FALSE_RE =
    /(fa[łl]sz|falsz|false|nieprawda|nieprawdziw|fake|incorrect|b[łl][eę]dn|untrue|wrong|hoax)/iu;
const TRUE_RE = /(prawda|prawdziw|true|correct|accurate|potwierdzon)/iu;

function mapRating(raw: string | undefined): MappedRating | null {
    const rating = (raw ?? "").trim();
    if (!rating) return null;

    if (PARTIAL_RE.test(rating)) return { verdict: "misleading", relation: "refutes" };
    if (FALSE_RE.test(rating)) return { verdict: "false", relation: "refutes" };
    if (TRUE_RE.test(rating)) return { verdict: "confirmed", relation: "supports" };
    return null; // unknown rating -> context only
}

// ---------------------------------------------------------------------------
// evidence builders
// ---------------------------------------------------------------------------

type EvidenceDraft = { evidence: Evidence; mapped: Verdict | null };

function evidenceFromHit(hit: SourceHit, claim: ClaimInput, retrievedAt: string): Evidence | null {
    const doc = hit?.doc;
    if (!doc || !doc.url) return null;

    const summary = doc.summary ?? "";
    const relation: EvidenceRelation = corpusMentionsClaim(normalizeText(summary), claim)
        ? "supports"
        : "context";

    return {
        title: truncate(doc.title || doc.publisher || doc.url, 200),
        publisher: doc.publisher || hostOf(doc.url),
        publishedAt: doc.publishedAt ?? null,
        retrievedAt,
        url: doc.url,
        excerpt: truncate(summary),
        type: doc.type,
        relation,
    };
}

function evidenceFromReview(
    review: FactCheckReview,
    parent: FactCheckClaim,
    retrievedAt: string,
): EvidenceDraft | null {
    if (!review || !review.url) return null;

    const mapped = mapRating(review.textualRating);
    const rating = (review.textualRating ?? "").trim();
    const checkedText = (parent.text ?? "").trim();
    const excerptParts = [
        rating ? `Ocena: ${rating}.` : "",
        checkedText ? `Sprawdzane zdanie: ${checkedText}` : "",
    ].filter(Boolean);

    return {
        mapped: mapped?.verdict ?? null,
        evidence: {
            title: truncate(review.title || checkedText || review.url, 200),
            publisher: review.publisher?.name || review.publisher?.site || hostOf(review.url),
            publishedAt: review.reviewDate ?? parent.claimDate ?? null,
            retrievedAt,
            url: review.url,
            excerpt: truncate(excerptParts.join(" ")),
            type: "fact_check",
            relation: mapped?.relation ?? "context",
        },
    };
}

// ---------------------------------------------------------------------------
// verdict decision
// ---------------------------------------------------------------------------

type Decision = { verdict: Verdict; confidence: number; reasoning: string };

function decide(params: {
    factCheckVerdict: Verdict | null;
    independentSupports: number;
    hasPrimarySupport: boolean;
    supports: Evidence[];
    refutes: Evidence[];
    hasAnyEvidence: boolean;
    notVerifiable: boolean;
}): Decision {
    const { factCheckVerdict, supports, refutes, hasAnyEvidence, hasPrimarySupport } = params;

    // 1. A fact-check review wins.
    if (factCheckVerdict) {
        const confidence = clamp(0.9 + (params.independentSupports > 0 ? 0.05 : 0), 0, 0.96);
        const reasoning =
            factCheckVerdict === "confirmed"
                ? "Znaleziono ocenę fact-checkingową, która potwierdza to twierdzenie."
                : factCheckVerdict === "false"
                  ? "Znaleziono ocenę fact-checkingową, która wskazuje, że twierdzenie jest fałszywe."
                  : "Znaleziono ocenę fact-checkingową, która wskazuje, że twierdzenie wprowadza w błąd.";
        return { verdict: factCheckVerdict, confidence, reasoning };
    }

    // 2. Planned / hypothetical statements without a date cannot be checked.
    if (params.notVerifiable) {
        return {
            verdict: "not_verifiable",
            confidence: 0.2,
            reasoning:
                "Twierdzenie opisuje plan lub hipotezę, a nie ustalony fakt. Brak daty, do której można je odnieść.",
        };
    }

    // 3. Two independent sources that actually state it.
    if (params.independentSupports >= 2) {
        return {
            verdict: "confirmed",
            confidence: clamp(0.75 + (hasPrimarySupport ? 0.07 : 0), 0.7, 0.85),
            reasoning: "Co najmniej dwa niezależne źródła potwierdzają to twierdzenie.",
        };
    }

    // 4. Exactly one source: only a primary source can carry a weak confirmation.
    if (supports.length === 1 && refutes.length === 0) {
        const single = supports[0]!;
        if (single.type === "primary") {
            return {
                verdict: "confirmed",
                confidence: 0.5,
                reasoning:
                    "Jedno źródło pierwotne potwierdza to twierdzenie. To wciąż za mało, aby mówić o pewności.",
            };
        }
        return {
            verdict: "insufficient_evidence",
            confidence: 0.3,
            reasoning:
                "Jest tylko jedno źródło, które nie jest pierwotne. Nie wystarcza to do potwierdzenia twierdzenia.",
        };
    }

    // 5. Sources against, nothing for.
    if (refutes.length > 0 && supports.length === 0) {
        return {
            verdict: "false",
            confidence: clamp(0.6 + (refutes.length >= 2 ? 0.1 : 0), 0.5, 0.8),
            reasoning:
                "Źródła przeczą temu twierdzeniu, a nie znaleziono źródła, które by je potwierdzało.",
        };
    }

    // 6. Nothing decisive.
    return {
        verdict: "insufficient_evidence",
        confidence: hasAnyEvidence ? 0.3 : 0.2,
        reasoning: hasAnyEvidence
            ? "Zebrane materiały dotyczą tematu, ale nie potwierdzają wprost tego twierdzenia."
            : "Nie znaleziono wiarygodnego źródła, które potwierdza to twierdzenie.",
    };
}

// ---------------------------------------------------------------------------
// per-claim research
// ---------------------------------------------------------------------------

type OneClaimResult = { verdict: ClaimVerdict; googleUsed: boolean };

function fallbackVerdict(claim: ClaimInput, asOf: string, limitation: string): ClaimVerdict {
    const limitations = [limitation];
    if (!limitations.includes("Brak źródła pierwotnego.")) limitations.push("Brak źródła pierwotnego.");

    return {
        id: claim.id,
        claim: claimTextFor(claim),
        verdict: "insufficient_evidence",
        confidence: 0.2,
        strength: "low",
        reasoning: "Nie udało się zebrać źródeł, które odnoszą się do tego twierdzenia.",
        evidence: [],
        limitations,
        asOf,
        cached: false,
    };
}

async function researchOne(
    claim: ClaimInput,
    ctx: { offline: boolean; asOf: string },
): Promise<OneClaimResult> {
    const limitations: string[] = [];
    const evidence: Evidence[] = [];
    const seenUrls = new Set<string>();
    const retrievedAt = new Date().toISOString();

    // --- a) local corpus ---------------------------------------------------
    let hits: SourceHit[] = [];
    try {
        const found = await searchCorpus(claim.text, CORPUS_LIMIT);
        hits = Array.isArray(found) ? found.slice(0, CORPUS_LIMIT) : [];
    } catch {
        limitations.push("Lokalny korpus źródeł był niedostępny.");
    }
    if (hits.length === 0) limitations.push("Brak źródeł w lokalnym korpusie.");

    for (const hit of hits) {
        const item = evidenceFromHit(hit, claim, retrievedAt);
        if (!item) continue;
        const key = item.url.toLowerCase();
        if (seenUrls.has(key)) continue;
        seenUrls.add(key);
        evidence.push(item);
    }

    // --- b) Google Fact Check ---------------------------------------------
    let googleUsed = false;
    const reviewVerdicts: Verdict[] = [];

    if (ctx.offline) {
        limitations.push("Tryb offline — pominięto Google Fact Check.");
    } else {
        try {
            const response = await GoogleFactCheck.Search(claim.text, {
                languageCode: "pl",
                pageSize: GOOGLE_PAGE_SIZE,
            });
            googleUsed = true;

            for (const parent of response.claims ?? []) {
                for (const review of parent.claimReview ?? []) {
                    const draft = evidenceFromReview(review, parent, retrievedAt);
                    if (!draft) continue;

                    const key = draft.evidence.url.toLowerCase();
                    if (seenUrls.has(key)) continue;
                    seenUrls.add(key);

                    evidence.push(draft.evidence);
                    if (draft.mapped) reviewVerdicts.push(draft.mapped);
                }
            }

            if (reviewVerdicts.length === 0) {
                limitations.push("Brak oceny fact-checkingowej dla tego zdania.");
            }
        } catch {
            limitations.push("Dostęp do Google Fact Check był ograniczony.");
        }
    }

    // --- classify ----------------------------------------------------------
    const supports = evidence.filter((item) => item.relation === "supports");
    const refutes = evidence.filter((item) => item.relation === "refutes");

    const supportHosts = new Set(supports.map((item) => hostOf(item.url)));
    const hasPrimarySupport = supports.some((item) => item.type === "primary");

    // Conflicting reviews: keep the strictest, but say so.
    let factCheckVerdict: Verdict | null = null;
    if (reviewVerdicts.length > 0) {
        const priority: Verdict[] = ["false", "misleading", "confirmed"];
        factCheckVerdict = priority.find((value) => reviewVerdicts.includes(value)) ?? null;
        if (new Set(reviewVerdicts).size > 1) {
            limitations.push("Źródła fact-checkingowe różnią się w ocenie.");
        }
    }

    // Planned / hypothetical claims need a date to be checkable at all.
    const mode = (claim.fact?.m ?? "").toLowerCase();
    const isPlanned = mode === "planned" || mode === "hypothetical";
    const hasDateEvidence =
        Boolean(claim.fact?.t) ||
        evidence.some((item) => item.publishedAt !== null && item.relation !== "context");

    const decision = decide({
        factCheckVerdict,
        independentSupports: supportHosts.size,
        hasPrimarySupport,
        supports,
        refutes,
        hasAnyEvidence: evidence.length > 0,
        notVerifiable: isPlanned && !hasDateEvidence,
    });

    // Rule: a lone non-primary support does not confirm — demote it to context.
    let finalEvidence = evidence;
    if (decision.verdict === "insufficient_evidence" && supports.length === 1 && refutes.length === 0) {
        const lone = supports[0]!;
        if (lone.type !== "primary") {
            finalEvidence = evidence.map((item) =>
                item === lone ? { ...item, relation: "context" as EvidenceRelation } : item,
            );
        }
    }

    // --- limitations -------------------------------------------------------
    if (!finalEvidence.some((item) => item.type === "primary")) {
        if (!limitations.includes("Brak źródła pierwotnego.")) {
            limitations.push("Brak źródła pierwotnego.");
        }
    }
    if (finalEvidence.some((item) => isArchival(item.publishedAt, ctx.asOf))) {
        limitations.push("Źródło jest archiwalne.");
    }

    const verdict: ClaimVerdict = {
        id: claim.id,
        claim: claimTextFor(claim),
        verdict: decision.verdict,
        confidence: roundConfidence(decision.confidence),
        strength: strengthOf(roundConfidence(decision.confidence)),
        reasoning: decision.reasoning,
        evidence: finalEvidence,
        limitations: [...new Set(limitations)],
        asOf: ctx.asOf,
        cached: false,
    };

    return { verdict, googleUsed };
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export async function researchClaims(
    claims: ClaimInput[],
    options: ResearchOptions = {},
): Promise<ResearchResult> {
    if (!Array.isArray(claims) || claims.length === 0) {
        return { claims: [], sourcesUsed: [], models: [], costUsd: 0 };
    }

    const offline = options.offline === true;
    const asOf = normalizeAsOf(options.asOf);
    const cap =
        typeof options.maxClaims === "number" && options.maxClaims >= 0
            ? Math.floor(options.maxClaims)
            : claims.length;

    const verdicts: ClaimVerdict[] = [];
    let googleUsed = false;

    for (let i = 0; i < claims.length; i++) {
        const claim = claims[i]!;

        if (i >= cap) {
            verdicts.push(
                fallbackVerdict(claim, asOf, "Limit liczby twierdzeń — tego twierdzenia nie sprawdzono."),
            );
            continue;
        }

        try {
            const result = await researchOne(claim, { offline, asOf });
            if (result.googleUsed) googleUsed = true;
            verdicts.push(result.verdict);
        } catch {
            // One broken claim must never sink the whole batch.
            verdicts.push(fallbackVerdict(claim, asOf, "Wystąpił błąd wewnętrzny podczas sprawdzania."));
        }
    }

    const sourcesUsed: string[] = [];
    const seenSources = new Set<string>();
    for (const verdict of verdicts) {
        for (const item of verdict.evidence) {
            const key = item.url.toLowerCase();
            if (seenSources.has(key)) continue;
            seenSources.add(key);
            sourcesUsed.push(item.url);
        }
    }

    const costUsd = offline ? 0 : Number((claims.length * COST_PER_CLAIM_USD).toFixed(6));

    return {
        claims: verdicts,
        sourcesUsed,
        models: googleUsed ? [MODEL_ID] : [],
        costUsd,
    };
}
