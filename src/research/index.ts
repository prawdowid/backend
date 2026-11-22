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
import type { DecisionsNoulQuestion } from "@openrouter/sdk/models";
import { Markdown } from "../modules/utils";
import { OpenRouterWrapper } from "../modules/openrouter";
import { searchSources } from "../sources";
import { searchDisinfoCases } from "./euvsdisinfo";
import { searchWeb } from "./search";
import { wikidataEvidence } from "./wikidata";
import { searchCorpusDocuments } from "./corpus-docs";
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
/** Only hits this good are worth the cost of reading the actual page. */
const CORPUS_MIN_SCORE = 0.45;
/** Reading pages is slow and rate-limited: three per claim, in parallel. */
const CONTENT_FETCH_LIMIT = 3;
/** Markdown() has no AbortSignal, so we race it against this budget. */
const CONTENT_FETCH_TIMEOUT_MS = 4000;
/** Total wall-clock budget for page fetches across one request. */
const RESEARCH_FETCH_BUDGET_MS = 12_000;
/** A page can be a book; the matcher only needs the beginning. */
const CONTENT_MAX_CHARS = 20_000;
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
 * A page may become "supports" only when ONE readable sentence names the subject
 * and enough of the object. Matching across a whole 20k-char homepage is how you
 * get "supports" from a navigation menu, so the match is sentence-scoped.
 * Polarity is decided by the caller: a match against a negated claim is evidence
 * *against*.
 */
function matchingSentence(content: string, claim: ClaimInput): string | null {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = keywordsOf(fact.s ?? "");
    const object = keywordsOf(String(fact.o ?? ""));
    if (subject.length === 0 || object.length === 0) return null;

    const needed = Math.max(1, Math.ceil(object.length * 0.5));
    const body = readableText(bodyOf(content));
    const sentences = body.split(/(?<=[.!?])\s+|\n+/);

    for (const raw of sentences) {
        const sentence = raw.trim();
        // Too short = menu crumbs; too long = a whole paragraph, not a claim.
        if (sentence.length < 40 || sentence.length > 600) continue;
        const normalized = normalizeText(sentence);
        if (mentions(normalized, subject) === 0) continue;
        if (mentions(normalized, object) < needed) continue;
        return sentence;
    }

    return null;
}

function corpusMentionsClaim(haystack: string, claim: ClaimInput): boolean {
    return matchingSentence(haystack, claim) !== null;
}

/**
 * Loose relevance check for a *claim sentence* (e.g. a Google fact-check claim).
 * No sentence-length window: the text is already one claim.
 */
function textNamesClaim(text: string, claim: ClaimInput): boolean {
    const fact = claim.fact;
    if (!fact) return false;

    const subject = keywordsOf(fact.s ?? "");
    const object = keywordsOf(String(fact.o ?? ""));
    if (subject.length === 0 || object.length === 0) return false;

    const normalized = normalizeText(text);
    if (mentions(normalized, subject) === 0) return false;
    return mentions(normalized, object) >= Math.max(1, Math.ceil(object.length * 0.5));
}

/** Jev gate: a search hit must assert the same proposition, not just the topic. */async function sameProposition(claimText: string, candidates: string[]): Promise<boolean[]> {
    if (candidates.length === 0) return [];

    const questions: Record<string, DecisionsNoulQuestion> = {};
    candidates.forEach((candidate, index) => {
        questions[`p${index}`] = {
            type: "noul",
            instructions: {
                question:
                    "Does `candidate` assert exactly the same proposition as `claim`? " +
                    "Same subject, same relation, same object, same polarity, same date. " +
                    "A related topic, a broader statement, or the opposite claim is NOT a match.",
                claim: claimText,
                candidate,
            },
        };
    });

    try {
        const result = await OpenRouterWrapper.Jev({ claim: claimText, candidates }, questions);
        return candidates.map((_candidate, index) => {
            const answer = result.answers[`p${index}`];
            return answer?.type === "noul" && answer.noul >= 0.8;
        });
    } catch {
        return candidates.map(() => false);
    }
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
// page text (the actual document, not the manifest blurb)
// ---------------------------------------------------------------------------

/** Markdown() takes no AbortSignal; race it and abandon the slow call. */
async function fetchPageText(url: string): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error(`timeout after ${CONTENT_FETCH_TIMEOUT_MS} ms`)),
            CONTENT_FETCH_TIMEOUT_MS,
        );
    });

    try {
        const text = await Promise.race([Markdown(url), timeout]);
        return text.slice(0, CONTENT_MAX_CHARS);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Jina Reader prefixes the page with metadata; the document starts after it. */
function bodyOf(content: string): string {
    const marker = "Markdown Content:";
    const index = content.indexOf(marker);
    const body = index >= 0 ? content.slice(index + marker.length) : content;
    return body.trim();
}

/** Links and markdown noise make a useless excerpt; keep the words. */
function readableText(content: string): string {
    return content
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[#*_>|`]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** The sentence that actually names the claim, or the page opening. */
function excerptFromContent(content: string, claim: ClaimInput): string {
    const fact = claim.fact;
    const tokens = fact
        ? [...keywordsOf(fact.s ?? ""), ...keywordsOf(String(fact.o ?? ""))]
        : keywordsOf(claim.text ?? "");

    const body = readableText(bodyOf(content));
    const sentences = body.split(/(?<=[.!?])\s+/);
    let best: string | null = null;
    let bestScore = 0;

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;
        const score = mentions(normalizeText(trimmed), tokens);
        if (score > bestScore) {
            best = trimmed;
            bestScore = score;
        }
    }

    return truncate(best ?? body);
}

function sentenceNegated(sentence: string): boolean {
    return /\b(nie|nigdy|brak)\b/.test(normalizeText(sentence));
}

function relationForMatch(claim: ClaimInput, sentence: string): EvidenceRelation {
    const claimNegated = claim.fact?.neg === true;
    const pageNegated = sentenceNegated(sentence);
    // Same polarity = supports; opposite = refutes. This is what stops
    // "Polska nie przyjęła euro" from confirming "Polska przyjęła euro".
    return claimNegated === pageNegated ? "supports" : "refutes";
}

// ---------------------------------------------------------------------------
// evidence builders
// ---------------------------------------------------------------------------

type WikipediaSearch = { query?: { search?: Array<{ title: string }> } };
type WikipediaPages = {
    query?: { pages?: Record<string, { title?: string; extract?: string }> };
};

/**
 * Wikipedia is strict about bursts. Serialize requests, space them, cache
 * responses and enter a cooldown after a 429 instead of hammering per claim.
 */
const WIKI_MIN_INTERVAL_MS = 300;
const WIKI_JINA_INTERVAL_MS = 3000;
const WIKI_COOLDOWN_MS = 5 * 60_000;
const wikiCache = new Map<string, unknown>();
let wikiQueue: Promise<void> = Promise.resolve();
let wikiCooldownUntil = 0;
/** After the first 429 we proxy everything through r.jina.ai for this process. */
let wikiUseJina = false;

function wikiGate(): Promise<void> {
    const interval = wikiUseJina ? WIKI_JINA_INTERVAL_MS : WIKI_MIN_INTERVAL_MS;
    const next = wikiQueue.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, interval)),
    );
    wikiQueue = next.then(
        () => undefined,
        () => undefined,
    );
    return next.then(() => undefined);
}

async function wikipediaViaJina(url: string): Promise<string> {
    const response = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
            accept: "text/plain",
        },
        signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) throw new Error(`Jina ${response.status}`);
    const text = await response.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Jina: no JSON in response");
    return text.slice(start, end + 1);
}

async function wikipediaJson<T>(url: string): Promise<T> {
    const cached = wikiCache.get(url);
    if (cached !== undefined) return cached as T;

    await wikiGate();

    if (wikiUseJina || Date.now() < wikiCooldownUntil) {
        const data = JSON.parse(await wikipediaViaJina(url)) as T;
        wikiCache.set(url, data);
        return data;
    }

    const response = await fetch(url, {
        headers: {
            "user-agent": "PrawdowidBot/1.0 (fact-checking prototype; contact: local)",
            accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
        // Our IP is rate-limited: switch to the Jina reader proxy instead.
        wikiUseJina = true;
        wikiCooldownUntil = Date.now() + WIKI_COOLDOWN_MS;
        const data = JSON.parse(await wikipediaViaJina(url)) as T;
        wikiCache.set(url, data);
        return data;
    }
    if (!response.ok) throw new Error(`Wikipedia ${response.status}`);

    const data = (await response.json()) as T;
    wikiCache.set(url, data);
    return data;
}

async function classifySentences(
    claimText: string,
    sentences: string[],
): Promise<Array<"supports" | "refutes" | null>> {
    if (sentences.length === 0) return [];

    const questions: Record<string, DecisionsNoulQuestion> = {};
    sentences.forEach((sentence, index) => {
        questions[`s${index}_yes`] = {
            type: "noul",
            instructions: {
                question:
                    "Does `sentence` confirm `claim`? Only when it asserts the same proposition. " +
                    "A related statement, a partial statement, or a mere mention is false.",
                claim: claimText,
                sentence,
            },
        };
        questions[`s${index}_no`] = {
            type: "noul",
            instructions: {
                question:
                    "Does `sentence` contradict `claim`? Only when it asserts the opposite. " +
                    "A related statement, a partial statement, or a mere mention is false.",
                claim: claimText,
                sentence,
            },
        };
    });

    try {
        const result = await OpenRouterWrapper.Jev({ claim: claimText, sentences }, questions);
        return sentences.map((_sentence, index) => {
            const yes = result.answers[`s${index}_yes`];
            const no = result.answers[`s${index}_no`];
            const pYes = yes?.type === "noul" ? yes.noul : 0;
            const pNo = no?.type === "noul" ? no.noul : 0;
            if (pYes >= 0.8 && pYes > pNo) return "supports";
            if (pNo >= 0.8 && pNo > pYes) return "refutes";
            return null;
        });
    } catch {
        return sentences.map(() => null);
    }
}

/**
 * Secondary source: Polish Wikipedia. Only used when corpus + fact-checks gave
 * no supports/refutes, and only when a single sentence names subject and object
 * and Jev confirms that the sentence actually supports or refutes the claim.
 * Labelled `secondary` and surfaced as a limitation.
 */
async function wikipediaEvidence(claim: ClaimInput, retrievedAt: string): Promise<Evidence[]> {
    const fact = claim.fact;
    if (!fact) return [];

    const query = `${fact.s} ${fact.o}`.trim();
    if (query.length < 3) return [];

    const search = await wikipediaJson<WikipediaSearch>(
        `https://pl.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`,
    );
    const titles = (search.query?.search ?? []).map((item) => item.title).slice(0, 2);

    const candidates: Array<{ title: string; entryTitle: string; sentence: string }> = [];
    for (const title of titles) {
        const page = await wikipediaJson<WikipediaPages>(
            `https://pl.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`,
        );
        const entry = Object.values(page.query?.pages ?? {})[0];
        const text = entry?.extract ?? "";
        if (text.length === 0) continue;

        const match = matchingSentence(text, claim);
        if (!match) continue;
        candidates.push({ title, entryTitle: entry?.title ?? title, sentence: match });
        if (candidates.length >= 2) break;
    }

    if (candidates.length === 0) return [];

    const relations = await classifySentences(
        claim.text,
        candidates.map((candidate) => candidate.sentence),
    );

    const found: Evidence[] = [];
    for (let index = 0; index < candidates.length; index++) {
        const relation = relations[index];
        const candidate = candidates[index]!;
        if (!relation) continue;

        found.push({
            title: `Wikipedia: ${candidate.entryTitle}`,
            publisher: "Wikipedia (pl)",
            publishedAt: null,
            retrievedAt,
            url: `https://pl.wikipedia.org/wiki/${encodeURIComponent(candidate.title.replace(/ /g, "_"))}`,
            excerpt: candidate.sentence.slice(0, 400),
            type: "secondary",
            relation,
        });
    }

    return found;
}

type EvidenceDraft = { evidence: Evidence; mapped: Verdict | null };

function evidenceFromHit(hit: SourceHit, claim: ClaimInput, retrievedAt: string): Evidence | null {
    const doc = hit?.doc;
    if (!doc || !doc.url) return null;

    const summary = doc.summary ?? "";
    // A manifest summary describes what the page is, not what it asserts.
    // It can point the user to a source, but it is never proof of the claim.
    const relation: EvidenceRelation = "context";

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

/** Same evidence, but judged on the fetched document text instead of the blurb. */
function evidenceFromContent(
    hit: SourceHit,
    claim: ClaimInput,
    content: string,
    retrievedAt: string,
): Evidence | null {
    const base = evidenceFromHit(hit, claim, retrievedAt);
    if (!base) return null;

    const match = matchingSentence(content, claim);

    return {
        ...base,
        excerpt: match ? match.slice(0, 400) : excerptFromContent(content, claim),
        relation: match ? relationForMatch(claim, match) : "context",
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
    forecast?: boolean;
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

    // 2b. A forecast with no evidence is not a checkable fact today.
    if (params.forecast && supports.length === 0 && refutes.length === 0) {
        return {
            verdict: "not_verifiable",
            confidence: 0.25,
            reasoning:
                "To prognoza lub zapowiedź przyszłości, a nie ustalony fakt. Nie da się jej potwierdzić na dzień sprawdzenia.",
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

    // 4. One or more matching sources without any refute.
    if (supports.length >= 1 && refutes.length === 0) {
        const hasPrimary = supports.some((item) => item.type === "primary");
        if (hasPrimary) {
            return {
                verdict: "confirmed",
                confidence: 0.5,
                reasoning:
                    "Jedno źródło pierwotne potwierdza to twierdzenie. To wciąż za mało, aby mówić o pewności.",
            };
        }
        if (supports.every((item) => item.type === "secondary")) {
            return {
                verdict: "confirmed",
                confidence: 0.55,
                reasoning:
                    "Potwierdza to źródło wtórne, a Jev uznał fragment za zgodny z twierdzeniem. Siła dowodu jest ograniczona.",
            };
        }
    }

    if (supports.length === 1 && refutes.length === 0) {
        return {
            verdict: "insufficient_evidence",
            confidence: 0.3,
            reasoning:
                "Jest tylko jedno źródło, które nie jest pierwotne. Nie wystarcza to do potwierdzenia twierdzenia.",
        };
    }

    // 5. Sources against, nothing for.
    if (refutes.length > 0 && supports.length === 0) {
        // A lone secondary refute is not enough for a `false` verdict — unless it
        // comes from a structured knowledge base (Wikidata), which is deterministic.
        if (
            refutes.length === 1 &&
            refutes[0]!.type === "secondary" &&
            !/wikidata/i.test(refutes[0]!.publisher)
        ) {
            return {
                verdict: "insufficient_evidence",
                confidence: 0.3,
                reasoning:
                    "Jedno źródło wtórne przeczy temu twierdzeniu, ale to za mało, aby rozstrzygnąć.",
            };
        }

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
    ctx: { offline: boolean; asOf: string; deadline: number },
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

    const eligible = hits.filter(
        (hit) => Number.isFinite(hit.score) && hit.score >= CORPUS_MIN_SCORE,
    );

    // Read the actual pages for the best hits; only verified docs, only online,
    // and only while the request-wide fetch budget is not exhausted.
    const pages = new Map<string, string>();
    const withinBudget = Date.now() < ctx.deadline;
    const toFetch =
        ctx.offline || !withinBudget
            ? []
            : eligible.filter((hit) => hit.doc.verified === true).slice(0, CONTENT_FETCH_LIMIT);

    if (!ctx.offline && !withinBudget) {
        limitations.push("Przekroczono limit czasu pobierania treści źródeł; użyto metadanych.");
    }

    if (toFetch.length > 0) {
        const fetched = await Promise.allSettled(toFetch.map((hit) => fetchPageText(hit.doc.url)));
        for (let i = 0; i < toFetch.length; i++) {
            const hit = toFetch[i];
            if (!hit) continue;
            const result = fetched[i];
            const text = result?.status === "fulfilled" ? result.value : "";
            if (text.trim().length > 0) {
                pages.set(hit.doc.url.toLowerCase(), text);
            } else {
                limitations.push(`Nie udało się pobrać treści źródła: ${hostOf(hit.doc.url)}.`);
            }
        }
    }

    for (const hit of eligible) {
        const key = hit.doc.url.toLowerCase();
        if (seenUrls.has(key)) continue;
        const content = pages.get(key);
        const item =
            content !== undefined
                ? evidenceFromContent(hit, claim, content, retrievedAt)
                : evidenceFromHit(hit, claim, retrievedAt);
        if (!item) continue;
        seenUrls.add(key);
        evidence.push(item);
    }

    // --- a2) real document corpus (gov.pl, Policja, CERT, RSO) --------------
    try {
        const docHits = await searchCorpusDocuments(claim, 3);
        if (docHits.length > 0) {
            const relations = await classifySentences(
                claim.text,
                docHits.map((hit) => hit.sentence),
            );

            for (let index = 0; index < docHits.length; index++) {
                const relation = relations[index];
                if (!relation) continue;

                const hit = docHits[index]!;
                const key = hit.doc.url.toLowerCase();
                if (seenUrls.has(key)) continue;
                seenUrls.add(key);

                const isOfficial = /^(govpl|policja|cert|rso)/i.test(hit.doc.source);
                evidence.push({
                    title: hit.doc.title.slice(0, 300),
                    publisher: hit.doc.source,
                    publishedAt: hit.doc.publishedAt,
                    retrievedAt,
                    url: hit.doc.url,
                    excerpt: hit.sentence.slice(0, 400),
                    type: isOfficial ? "primary" : "secondary",
                    relation,
                });
            }

            if (evidence.some((item) => item.relation !== "context")) {
                limitations.push("Wykorzystano lokalny korpus dokumentów.");
            }
        }
    } catch {
        limitations.push("Lokalny korpus dokumentów był niedostępny.");
    }

    // --- b) Google Fact Check ---------------------------------------------
    let googleUsed = false;
    const reviewVerdicts: Verdict[] = [];

    if (ctx.offline) {
        limitations.push("Tryb offline — pominięto Google Fact Check.");
    } else {
        const fact = claim.fact;
        const queries = [
            claim.text,
            fact ? `${fact.s} ${fact.o}` : "",
            fact ? `${fact.s} ${fact.p.replace(/_/g, " ")} ${fact.o}` : "",
        ]
            .map((query) => query.trim())
            .filter((query, index, all) => query.length > 0 && all.indexOf(query) === index)
            .slice(0, 3);

        const parents: FactCheckClaim[] = [];
        const seenTexts = new Set<string>();

        try {
            for (const query of queries) {
                const response = await GoogleFactCheck.Search(query, {
                    languageCode: "pl",
                    pageSize: GOOGLE_PAGE_SIZE,
                });
                googleUsed = true;

                for (const parent of response.claims ?? []) {
                    if (!parent.text || (parent.claimReview?.length ?? 0) === 0) continue;
                    const key = normalizeText(parent.text);
                    if (!key || seenTexts.has(key)) continue;
                    seenTexts.add(key);
                    parents.push(parent);
                }

                if (parents.length >= 8) break;
            }

            // A search hit is not a review of *this* claim. Keep only reviews whose
            // claim asserts the same proposition (Jev gate, same idea as cache match).
            let accepted = parents;
            if (parents.length > 0) {
                const flags = await sameProposition(
                    claim.text,
                    parents.map((parent) => parent.text),
                );
                accepted = parents.filter((_parent, index) => flags[index] === true);
                if (process.env["PIPELINE_DEBUG"] === "1") {
                    console.log(
                        `[research] fact-check candidates=${parents.length} accepted=${accepted.length}`,
                        accepted.map((parent) => parent.text.slice(0, 90)),
                    );
                }
            }

            for (const parent of accepted) {
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

    // Wikidata: deterministic value lookup for factual relations.
    if (
        !ctx.offline &&
        !evidence.some((item) => item.relation === "supports" || item.relation === "refutes")
    ) {
        try {
            // Extraction may leave the year only in the text. Wikidata needs it to
            // compare membership dates instead of just "is a member".
            const year = (
                `${claim.text} ${claim.quote ?? ""} ${claim.details ?? ""}`.match(
                    /\b(1[89]\d{2}|20\d{2})\b/,
                ) ?? []
            )[1];
            const lookupClaim =
                claim.fact && !claim.fact.t && year
                    ? { ...claim, fact: { ...claim.fact, t: year } }
                    : claim;

            const item = await wikidataEvidence(lookupClaim, retrievedAt);
            if (item) {
                seenUrls.add(item.url.toLowerCase());
                evidence.push(item);
                limitations.push("Wykorzystano Wikidata.");
            }
        } catch {
            limitations.push("Wikidata była niedostępna.");
        }
    }

    // EUvsDisinfo case base: a matching disinformation case refutes the claim.
    if (
        !ctx.offline &&
        !evidence.some((item) => item.relation === "supports" || item.relation === "refutes")
    ) {
        try {
            const disinfo = await searchDisinfoCases(claim, retrievedAt);
            for (const item of disinfo) {
                const key = item.url.toLowerCase();
                if (seenUrls.has(key)) continue;
                seenUrls.add(key);
                evidence.push(item);
            }
            if (disinfo.length > 0) limitations.push("Wykorzystano bazę EUvsDisinfo.");
        } catch {
            limitations.push("Baza EUvsDisinfo była niedostępna.");
        }
    }

    // Secondary fallback: Wikipedia, only when nothing supports/refutes the claim.
    if (!ctx.offline && !evidence.some((item) => item.relation === "supports" || item.relation === "refutes")) {
        try {
            const wiki = await wikipediaEvidence(claim, retrievedAt);
            for (const item of wiki) {
                const key = item.url.toLowerCase();
                if (seenUrls.has(key)) continue;
                seenUrls.add(key);
                evidence.push(item);
            }
            if (wiki.length > 0) limitations.push("Wykorzystano źródło wtórne (Wikipedia).");
        } catch {
            limitations.push("Wikipedia była niedostępna.");
        }
    }

    // Web search: discovery only. A result must be fetched, quoted and gated by Jev.
    const hasSearchKey = Boolean(process.env["BRAVE_SEARCH_API_KEY"] ?? process.env["TAVILY_API_KEY"]);
    if (
        !ctx.offline &&
        hasSearchKey &&
        !evidence.some((item) => item.relation === "supports" || item.relation === "refutes")
    ) {
        const fact = claim.fact;
        const query = fact
            ? `${fact.s} ${fact.p.replace(/_/g, " ")} ${fact.o}`.trim()
            : claim.text;

        try {
            const results = await searchWeb(query, 5);
            const candidates = results.filter((item) => item.tier !== "D").slice(0, 2);
            const pages = await Promise.allSettled(candidates.map((item) => fetchPageText(item.url)));

            for (let index = 0; index < candidates.length; index++) {
                const candidate = candidates[index]!;
                if (seenUrls.has(candidate.url.toLowerCase())) continue;

                const page = pages[index];
                if (page?.status !== "fulfilled" || page.value.trim().length === 0) continue;

                const match = matchingSentence(page.value, claim);
                if (!match) continue;

                const relation = (await classifySentences(claim.text, [match]))[0] ?? null;
                if (!relation) continue;

                seenUrls.add(candidate.url.toLowerCase());
                evidence.push({
                    title: candidate.title || candidate.url,
                    publisher: new URL(candidate.url).hostname.replace(/^www\./, ""),
                    publishedAt: null,
                    retrievedAt,
                    url: candidate.url,
                    excerpt: match.slice(0, 400),
                    type: candidate.tier === "A" ? "primary" : candidate.tier === "B" ? "fact_check" : "secondary",
                    relation,
                });
            }

            if (candidates.length > 0) limitations.push("Wykorzystano wyszukiwarkę internetową (Brave/Tavily).");
        } catch {
            limitations.push("Wyszukiwarka internetowa była niedostępna.");
        }
    }

    // Citation fallback: even when nothing proves or refutes the claim, show the
    // closest source as context so the user can judge it. Never upgraded to proof.
    if (evidence.length === 0 && hits.length > 0) {
        const best = hits[0]!;
        const item = evidenceFromHit(best, claim, retrievedAt);
        if (item) {
            evidence.push(item);
            limitations.push("Dostępne źródła dotyczą tematu, ale nie potwierdzają wprost twierdzenia.");
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
    const plannedDate = claim.fact?.t ?? null;
    const plannedInFuture = isPlanned && plannedDate !== null && plannedDate > ctx.asOf;
    const hasDateEvidence =
        Boolean(claim.fact?.t) ||
        evidence.some((item) => item.publishedAt !== null && item.relation !== "context");

    if (plannedInFuture) {
        limitations.push("To zdarzenie zaplanowane na przyszłość — nie można go potwierdzić na dzień sprawdzenia.");
    }

    const isForecast =
        /\b(zast[ąa]pi|wejdzie|wejd[ąa]|zostanie|b[ęe]dzie|planuj[ea]|prognoz\w*|przewiduj\w*)\b/iu.test(
            `${claim.text} ${claim.quote ?? ""}`,
        );

    const decision = decide({
        factCheckVerdict,
        independentSupports: supportHosts.size,
        hasPrimarySupport,
        supports,
        refutes,
        hasAnyEvidence: evidence.length > 0,
        notVerifiable: (isPlanned && !hasDateEvidence) || plannedInFuture,
        forecast: isForecast,
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
    const deadline = Date.now() + RESEARCH_FETCH_BUDGET_MS;
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
            const result = await researchOne(claim, { offline, asOf, deadline });
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
