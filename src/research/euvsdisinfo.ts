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
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((token) => token.length >= 4)
            .map((token) => (token.length > 5 ? token.slice(0, 5) : token)),
    );
}

function score(query: Set<string>, candidate: string): number {
    if (query.size === 0) return 0;
    const candidateTokens = tokens(candidate);
    let hits = 0;
    for (const token of query) if (candidateTokens.has(token)) hits++;
    return hits / query.size;
}

async function sameClaim(claimText: string, candidate: string): Promise<boolean> {
    const questions: Record<string, DecisionsNoulQuestion> = {
        same: {
            type: "noul",
            instructions: {
                question:
                    "Do `candidate` and `claim` assert the same proposition? " +
                    "Same subject, relation, object and polarity. Related topic is false.",
                claim: claimText,
                candidate,
            },
        },
    };

    try {
        const result = await OpenRouterWrapper.Jev({ claim: claimText, candidate }, questions);
        const answer = result.answers["same"];
        return answer?.type === "noul" && answer.noul >= 0.8;
    } catch {
        return false;
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
    limit = 6,
): Promise<Evidence[]> {
    const cases = await load();
    if (cases.length === 0) return [];

    const fact = claim.fact;
    const query = tokens(
        `${claim.text} ${claim.quote ?? ""} ${fact?.s ?? ""} ${fact?.o ?? ""}`.slice(0, 600),
    );

    const ranked = cases
        .map((item) => ({ item, score: score(query, `${item.title} ${item.claim}`) }))
        .filter((entry) => entry.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    const evidence: Evidence[] = [];
    for (const { item } of ranked) {
        if (!(await sameClaim(claim.text, item.claim))) continue;

        evidence.push({
            title: item.title.slice(0, 300),
            publisher: "EUvsDisinfo",
            publishedAt: isoDate(item.date),
            retrievedAt,
            url: item.url,
            excerpt: (item.fact || item.claim).slice(0, 400),
            type: "fact_check",
            relation: "refutes",
        });

        if (evidence.length >= 2) break;
    }

    return evidence;
}

export async function disinfoStats(): Promise<{ total: number }> {
    return { total: (await load()).length };
}
