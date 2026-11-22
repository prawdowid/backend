/**
 * EUvsDisinfo case base (local snapshot).
 *
 * The MCP server only exposes paginated lists, not search, so we ingest a
 * snapshot with `scripts/ingest-euvsdisinfo.ts` and search it locally.
 * Runtime never needs the token: it reads `data/euvsdisinfo/cases.ndjson`.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { OpenRouterWrapper } from "../modules/openrouter";
import type { Evidence, ClaimInput } from "../pipeline/types";
import type { DecisionsNoulQuestion } from "@openrouter/sdk/models";

export const EUVD_CASES_FILE = process.env["EUVD_CASES_FILE"] ??
    fileURLToPath(new URL("../../data/euvsdisinfo/cases.ndjson", import.meta.url));

export type DisinfoCase = {
    id: string;
    title: string;
    claim: string;
    fact: string;
    date: number | null;
    url: string;
};

let cache: DisinfoCase[] | null = null;
let idfCache: Map<string, number> | null = null;
let inflight: Promise<DisinfoCase[]> | null = null;
let warned = false;

function load(): Promise<DisinfoCase[]> {
    if (cache) return Promise.resolve(cache);
    inflight ??= (async () => {
        try {
            const raw = await readFile(EUVD_CASES_FILE, "utf8");
            const cases: DisinfoCase[] = [];
            for (const line of raw.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const item = JSON.parse(trimmed) as Partial<DisinfoCase>;
                    const claim = typeof item.claim === "string" ? item.claim.trim() : "";
                    const url = typeof item.url === "string" ? item.url.trim() : "";
                    // Without the correction ("fact") we could only quote the false
                    // claim back at the user, so such rows are not evidence.
                    const fact = typeof item.fact === "string" ? item.fact.trim() : "";
                    if (!claim || !url || !fact) continue;

                    cases.push({
                        id: typeof item.id === "string" && item.id ? item.id : url,
                        title: (typeof item.title === "string" && item.title.trim()) || claim.slice(0, 200),
                        claim,
                        fact,
                        date: typeof item.date === "number" ? item.date : null,
                        url,
                    });
                } catch {
                    // Skip one broken line, keep the rest.
                }
            }
            cache = cases;
            return cases;
        } catch {
            if (!warned) {
                warned = true;
                console.warn(
                    `[euvsdisinfo] brak lokalnego zbioru (${EUVD_CASES_FILE}). Uruchom scripts/ingest-euvsdisinfo.ts`,
                );
            }
            cache = [];
            return cache;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

function tokens(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .normalize("NFKC")
            // Fold Polish diacritics so "Kraków" and "Krakowie" share a stem.
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((token) => token.length >= 4)
            .map((token) => (token.length > 5 ? token.slice(0, 5) : token)),
    );
}

function score(query: Set<string>, candidate: string, idf: Map<string, number>): number {
    if (query.size === 0) return 0;
    const candidateTokens = tokens(candidate);
    let hits = 0;
    for (const token of query) {
        if (candidateTokens.has(token)) hits += idf.get(token) ?? 1;
    }
    return hits;
}

/**
 * Inverse document frequency makes rare names ("Kraków") matter more than
 * generic words ("Ukraine", "Russia"), so the right case lands in the shortlist.
 */
function buildIdf(cases: DisinfoCase[]): Map<string, number> {
    const df = new Map<string, number>();
    for (const item of cases) {
        for (const token of tokens(`${item.title} ${item.claim} ${item.fact}`)) {
            df.set(token, (df.get(token) ?? 0) + 1);
        }
    }
    const idf = new Map<string, number>();
    for (const [token, count] of df) {
        idf.set(token, Math.log(1 + cases.length / (1 + count)));
    }
    return idf;
}

const SHOOTER_NOUN =
    "(?:shoot(?:er)?|gunman|attacker|perpetrator|suspect|strzel\\w*|sprawc\\w*|napastnik\\w*|zamachowiec\\w*)";
const NATIONALITY_ADJECTIVE =
    "(polish|ukrainian|german|russian|belarusian|lithuanian|french|british|american|polak|ukrainiec|niemiec|rosjanin|białorusin|litwin|francuz|brytyjczyk|amerykanin)";

const NATIONALITY_PATTERNS = [
    new RegExp(
        `\\b${SHOOTER_NOUN}\\b[^.]{0,160}?\\b(?:was|is|jest|by[łl]|okaza[łl] si[ęe])\\b[^.]{0,80}?\\b${NATIONALITY_ADJECTIVE}\\b`,
        "iu",
    ),
    new RegExp(`\\b${NATIONALITY_ADJECTIVE}\\b[^.]{0,40}?\\b(?:citizen|national|obywatel)\\b`, "iu"),
];

const NATIONALITY_KEYS: Record<string, string> = {
    polish: "polish",
    polak: "polish",
    polka: "polish",
    ukrainian: "ukrainian",
    ukrainiec: "ukrainian",
    ukrainka: "ukrainian",
    german: "german",
    niemiec: "german",
    russian: "russian",
    rosjanin: "russian",
    belarusian: "belarusian",
    białorusin: "belarusian",
    lithuanian: "lithuanian",
    litwin: "lithuanian",
    french: "french",
    francuz: "french",
    british: "british",
    brytyjczyk: "british",
    american: "american",
    amerykanin: "american",
};

function nationalityOf(text: string): string | null {
    const plain = text
        .replace(/<[^>]+>/g, " ")
        .replace(/&quot;|&#39;|&amp;/g, " ");
    for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
        if (!new RegExp(`\\b${SHOOTER_NOUN}\\b`, "iu").test(sentence)) continue;
        for (const pattern of NATIONALITY_PATTERNS) {
            const match = pattern.exec(sentence);
            if (match?.[1]) return NATIONALITY_KEYS[match[1].toLowerCase()] ?? null;
            if (match?.[2]) return NATIONALITY_KEYS[match[2].toLowerCase()] ?? null;
        }
    }
    return null;
}

function objectNationality(object: string): string | null {
    const plain = object.toLowerCase();
    for (const [word, key] of Object.entries(NATIONALITY_KEYS)) {
        if (plain.includes(word)) return key;
    }
    return null;
}

function isNationalityRelation(relation: string | undefined): boolean {
    return /nation|obywatel|citizen|narodow|country/i.test(relation ?? "");
}

async function classifyCandidates(
    claimText: string,
    candidates: Array<{ claim: string; fact: string }>,
    relationHint?: string,
    objectHint?: string,
): Promise<Array<"supports" | "refutes" | null>> {
    if (candidates.length === 0) return [];

    const relation = relationHint?.replace(/_/g, " ") ?? "the asserted relation";
    const object = objectHint?.trim() || "the claimed value";
    const questions: Record<string, DecisionsNoulQuestion> = {};
    candidates.forEach((candidate, index) => {
        questions[`s${index}`] = {
            type: "noul",
            instructions: {
                question:
                    "Do `candidate` and `claim` assert the same proposition? " +
                    "Same subject, relation, object and polarity. Related topic is false.",
                claim: claimText,
                candidate: candidate.claim,
            },
        };
        if (candidate.fact.trim().length > 0) {
            const context =
                `CORRECTION: ${candidate.fact}\n\n` +
                `(This corrects the disinformation claim: ${candidate.claim.slice(0, 300)})`;
            questions[`f${index}`] = {
                type: "noul",
                instructions: {
                    question:
                        `Does CORRECTION confirm that the ${relation} of the subject is "${object}"? ` +
                        "Yes only when it states that exact value, even with extra context. " +
                        "A related topic or a different value is false.",
                    claim: claimText,
                    candidate: context,
                },
            };
            questions[`x${index}`] = {
                type: "noul",
                instructions: {
                    question:
                        `Does CORRECTION state a ${relation} for the subject that is different ` +
                        `from "${object}" (or explicitly denies "${object}")? ` +
                        "Yes only when it gives another value or denies that value. " +
                        "Refuting only another detail of the disinformation claim, or not " +
                        `stating any ${relation} at all, is false.`,
                    claim: claimText,
                    candidate: context,
                },
            };
        }
    });

    try {
        const result = await OpenRouterWrapper.Jev(
            { claim: claimText, candidates },
            questions,
        );

        return candidates.map((_candidate, index) => {
            const same = result.answers[`s${index}`];
            const confirms = result.answers[`f${index}`];
            const contradicts = result.answers[`x${index}`];
            const pSame = same?.type === "noul" ? same.noul : 0;
            const pConfirms = confirms?.type === "noul" ? confirms.noul : 0;
            const pContradicts = contradicts?.type === "noul" ? contradicts.noul : 0;

            // Contradiction of the correction is the strongest signal.
            if (pContradicts >= 0.9) return "refutes";
            if (pConfirms >= 0.85) return "supports";
            if (pSame >= 0.8) return "refutes";
            return null;
        });
    } catch {
        return candidates.map(() => null);
    }
}

function isoDate(seconds: number | null): string | null {
    if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
    const ms = seconds * 1000;
    // Guard against millisecond timestamps or garbage: never throw in here.
    if (ms > Date.now() + 366 * 24 * 3600 * 1000) return null;
    return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Returns evidence refuting the claim when it matches a known disinformation
 * case. EUvsDisinfo stores the false claim and its correction, so a match means
 * our claim is the disinformation one.
 */
export async function searchDisinfoCases(
    claim: ClaimInput,
    retrievedAt: string,
    limit = 12,
): Promise<Evidence[]> {
    const cases = await load();
    if (cases.length === 0) return [];

    const fact = claim.fact;
    const query = tokens(
        `${claim.text} ${claim.quote ?? ""} ${fact?.s ?? ""} ${fact?.o ?? ""}`.slice(0, 600),
    );

    const idf = idfCache ??= buildIdf(cases);

    const ranked = cases
        .map((item) => ({
            item,
            score: score(query, `${item.title} ${item.claim} ${item.fact}`, idf),
        }))
        .filter((entry) => entry.score >= 2.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    const nationalObject = fact ? objectNationality(String(fact.o)) : null;
    const relations: Array<"supports" | "refutes" | null> =
        nationalObject && isNationalityRelation(fact?.p)
            ? ranked.map(({ item }) => {
                  const detected = nationalityOf(item.fact);
                  if (!detected) return null;
                  return detected === nationalObject ? "supports" : "refutes";
              })
            : await classifyCandidates(
                  claim.text,
                  ranked.map(({ item }) => ({ claim: item.claim, fact: item.fact })),
                  fact?.p,
                  fact ? String(fact.o) : undefined,
              );

    if (process.env["PIPELINE_DEBUG"] === "1") {
        console.log(
            "[euvd] ranked",
            ranked.map((entry) => `${entry.score.toFixed(2)}:${entry.item.title.slice(0, 40)}`),
            "relations",
            relations,
            "query",
            [...query].join(","),
        );
    }

    const objectStems = [...tokens(String(fact?.o ?? ""))]
        .map((token) => token.slice(0, 3))
        .filter((stem) => stem.length === 3);

    const evidence: Evidence[] = [];
    for (let index = 0; index < ranked.length; index++) {
        const relation = relations[index];
        if (!relation) continue;

        const item = ranked[index]!.item;
        // A correction that never mentions the object (e.g. nationality) cannot
        // confirm or refute that specific value, even if it refutes the wider
        // disinformation claim around it.
        if (objectStems.length > 0) {
            const haystack = `${item.title} ${item.claim} ${item.fact}`
                .toLowerCase()
                .normalize("NFD")
                .replace(/\p{M}/gu, "");
            if (!objectStems.some((stem) => haystack.includes(stem))) continue;
        }

        evidence.push({
            title: item.title.slice(0, 300),
            publisher: "EUvsDisinfo",
            publishedAt: isoDate(item.date),
            retrievedAt,
            url: item.url,
            excerpt: (item.fact || item.claim).slice(0, 400),
            type: "fact_check",
            relation,
        });

        if (evidence.length >= 2) break;
    }

    return evidence;
}

export async function disinfoStats(): Promise<{ total: number }> {
    return { total: (await load()).length };
}
