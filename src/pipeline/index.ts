import { createHash } from "node:crypto";
import { OpenRouterWrapper, cosineSimilarity } from "../modules/openrouter";
import { createStatementCacheQuestions, type StatementCandidate } from "../modules/questions";
import type { DecisionsChoiceQuestion, DecisionsNoulQuestion } from "@openrouter/sdk/models";

export type Verdict = "true" | "false" | "mixed" | "unverified";

/** One atomic subject-predicate-object relation, as extracted by DeepSeek. */
export type ClaimFact = {
    s: string;
    p: string;
    o: string | number;
    t?: string;
    by?: string;
    m?: string;
    neg?: boolean;
};

export type Claim = {
    id: string;
    /** Exact-match key for repeat claims. */
    key: string;
    /** Canonical sentence used for embeddings and Jev matching. */
    text: string;
    /** Verbatim quote the claim came from. */
    quote: string;
    /** t / by / m / neg, rendered for the matcher. */
    details: string;
    fact: ClaimFact;
};

export type CachedClaim = StatementCandidate & {
    key: string;
    verdict: Verdict;
    sources: string[];
    checkedAt: string;
    embedding: number[];
};

/** Swap the in-memory implementation for Redis later; the pipeline only needs this. */
export interface CacheStore {
    all(): Promise<CachedClaim[]>;
    getByKey(key: string): Promise<CachedClaim | undefined>;
    put(entry: CachedClaim): Promise<void>;
}

export type CacheHit = {
    claim: Claim;
    cached: CachedClaim;
    probability: number;
};

export type PipelineResult = {
    status: "done" | "needs_research" | "skipped";
    political: number;
    lang: string;
    date: string | null;
    claims: Claim[];
    hits: CacheHit[];
    misses: Claim[];
};

const POLITICAL_THRESHOLD = 0.75;
const MATCH_THRESHOLD = 0.8;
const SHORTLIST_SIZE = 10;

const DEBUG = process.env["PIPELINE_DEBUG"] === "1";

function mark(label: string, startedAt: number): void {
    if (DEBUG) console.log(`[pipeline] ${label}: ${Date.now() - startedAt} ms`);
}

export const MASTERPROMPT = `You extract atomic, checkable claims from user message (any language) for a fact-checking pipeline. Reply with raw JSON only.

SCHEMA
{
  "lang": "pl",
  "date": "YYYY-MM-DD or null",
  "facts": [
    {
      "q": "verbatim contiguous quote from <ARTICLE>",
      "tr": "Polish translation - only when lang is not pl",
      "c": [
        {"s": "subject", "p": "snake_case_relation", "o": "object",
         "t": "ISO date - omit if unknown", "by": "source of the claim - omit if the article's own voice",
         "m": "reported|alleged|planned|hypothetical - omit if asserted",
         "neg": true - omit if affirmed}
      ]
    }
  ]
}

RULES
1. "q" is copied character-for-character, one contiguous passage. Never paraphrase, never translate inside it.
2. One entry per quote. Several claims per quote are fine.
3. One claim = one subject-predicate-object relation. Split conjunctions and counts.
4. Only what the text says. No outside knowledge, no corrections, no invented dates.
5. Keep hedging: source goes to "by", stance to "m". A reported claim belongs to the source, not the outlet.
6. Resolve relative dates ("w piątek", "w sobotę", "w czwartym kwartale") to absolute "t" using "date". If impossible, omit "t".
7. Canonical entity names in "s"/"o"; spelling variants are the same entity.
RELEVANCE GATE - run this before emitting any claim:
Ask: if this claim were false, would the story change or would a reader be misled? If no - drop it.

KEEP: who did what, where, when, how many, casualties, official statements,
numbers and dates, surprising or disputed details, named attributions.

DROP: history and encyclopedic background, technical specs, production provenance,
procedures and paperwork, unit names and ranks, routine actions, colour, restatements.

MAX 8 claims per article. If more survive, keep the ones closest to the headline.
Never drop: locations, dates, counts, who did what, quoted statements, contradictions.
9. Omit every null/empty field. No ids, no type fields, no aliases, no entity list.
10. "tr" only when the quote is not Polish.
11. Predicates: short English snake_case; reuse the same word for the same relation.

EXAMPLE
{"lang":"pl","date":"2026-11-21","facts":[
 {"q":"Były to dwie rakiety i jeden dron.","c":[
   {"s":"rakiety","p":"count","o":2},
   {"s":"dron","p":"count","o":1}]}]}

CHECK BEFORE REPLYING: every "q" is an exact substring; every claim has s/p/o; no nulls; valid JSON; only the three top-level keys.`;

type RawFact = {
    q: string;
    tr?: string;
    c: ClaimFact[];
};

type Summarize = {
    lang: string;
    date: string | null;
    facts: RawFact[];
};

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function claimKey(fact: ClaimFact): string {
    return createHash("sha256")
        .update([
            normalize(fact.s),
            fact.p,
            normalize(String(fact.o)),
            fact.t ?? "",
            fact.by ?? "",
            fact.m ?? "",
            fact.neg ? "1" : "0",
        ].join("|"))
        .digest("hex");
}

function claimText(fact: ClaimFact): string {
    return `${fact.neg ? "NIE: " : ""}${fact.s} — ${fact.p.replace(/_/g, " ")} — ${fact.o}`;
}

function claimDetails(fact: ClaimFact): string {
    return [
        fact.neg ? "negacja" : "",
        fact.m ?? "",
        fact.by ? `źródło: ${fact.by}` : "",
        fact.t ? `data: ${fact.t}` : "",
    ].filter(Boolean).join(", ");
}

function stripFence(value: string): string {
    return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

async function extractClaims(text: string): Promise<{ lang: string; date: string | null; claims: Claim[] }> {
    const user = `<ARTICLE>\n${text}\n</ARTICLE>`;
    let parsed: Summarize | undefined;

    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const raw = await OpenRouterWrapper.Chat(user, {
            system: MASTERPROMPT,
            reasoning: false,
            maxTokens: 8000,
        });

        try {
            parsed = JSON.parse(stripFence(raw ?? "")) as Summarize;
        } catch {
            if (attempt === 1) {
                throw new Error(`Extraction failed: no JSON in response (${raw.slice(0, 160)}...)`);
            }
            if (process.env["PIPELINE_DEBUG"] === "1") {
                console.log("[pipeline] extraction returned no JSON, retrying once");
            }
        }
    }

    if (!parsed) throw new Error("Extraction failed");

    const claims: Claim[] = [];
    const seen = new Set<string>();

    for (const fact of parsed.facts ?? []) {
        for (const relation of fact.c ?? []) {
            if (!relation.s || !relation.p || relation.o === undefined) continue;

            const key = claimKey(relation);
            if (seen.has(key)) continue;
            seen.add(key);

            claims.push({
                id: key.slice(0, 16),
                key,
                text: claimText(relation),
                quote: fact.q,
                details: claimDetails(relation),
                fact: relation,
            });
        }
    }

    return { lang: parsed.lang ?? "pl", date: parsed.date ?? null, claims };
}

function shortlist(candidates: CachedClaim[], query: number[]): CachedClaim[] {
    return candidates
        .filter((c) => c.embedding.length > 0)
        .map((c) => ({ c, score: cosineSimilarity(query, c.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, SHORTLIST_SIZE)
        .map(({ c }) => c);
}

export async function runPipeline(text: string, cache: CacheStore): Promise<PipelineResult> {
    let stage = Date.now();

    // Stage 1: gate on the raw text.
    const gate = await OpenRouterWrapper.Jev({ text }, {
        political: {
            type: "noul",
            instructions: "Does this text contain political or propaganda statements?",
        } satisfies DecisionsNoulQuestion,
    });
    mark("gate", stage);

    const politicalAnswer = gate.answers["political"];
    const political = politicalAnswer?.type === "noul" ? politicalAnswer.noul : 0;

    if (political < POLITICAL_THRESHOLD) {
        return { status: "skipped", political, lang: "", date: null, claims: [], hits: [], misses: [] };
    }

    // Stage 2: master prompt -> facts -> atomic claims.
    stage = Date.now();
    const { lang, date, claims } = await extractClaims(text);
    mark(`extract (${claims.length} claims)`, stage);

    if (claims.length === 0) {
        return { status: "done", political, lang, date, claims, hits: [], misses: [] };
    }

    // Stage 3: embed only incoming claims; cached vectors live in the store.
    stage = Date.now();
    const vectors = await OpenRouterWrapper.Embed(claims.map((c) => c.text));
    const candidates = await cache.all();
    mark(`embed + cache.all (${candidates.length} cached)`, stage);

    // Stage 4: exact key hit first, otherwise shortlist + one batched Jev request.
    const hits: CacheHit[] = [];
    const misses: Claim[] = [];
    const questions: Record<string, DecisionsNoulQuestion | DecisionsChoiceQuestion> = {};
    const shortlists = new Map<string, CachedClaim[]>();

    for (let i = 0; i < claims.length; i++) {
        const claim = claims[i]!;
        const exact = await cache.getByKey(claim.key);

        if (exact) {
            hits.push({ claim, cached: exact, probability: 1 });
            continue;
        }

        const list = shortlist(candidates, vectors[i]!);
        if (list.length === 0) {
            misses.push(claim);
            continue;
        }

        shortlists.set(claim.id, list);
        const pair = createStatementCacheQuestions(list);
        questions[`${claim.id}_exists`] = pair.statementMatchExists;
        questions[`${claim.id}_match`] = pair.statementMatch;
    }

    if (Object.keys(questions).length > 0) {
        stage = Date.now();
        const result = await OpenRouterWrapper.Jev(
            { claims: claims.map((c) => ({ text: c.text, details: c.details })) },
            questions,
        );
        mark(`jev match (${Object.keys(questions).length / 2} claims)`, stage);

        for (const claim of claims) {
            if (hits.some((h) => h.claim.id === claim.id)) continue;

            const list = shortlists.get(claim.id);
            if (!list) continue;

            const exists = result.answers[`${claim.id}_exists`];
            const match = result.answers[`${claim.id}_match`];

            if (exists?.type === "noul" && exists.noul >= MATCH_THRESHOLD && match?.type === "choice") {
                const cached = list.find((c) => c.id === match.choice);
                if (cached) {
                    hits.push({ claim, cached, probability: exists.noul });
                    continue;
                }
            }

            misses.push(claim);
        }
    }

    return {
        status: misses.length > 0 ? "needs_research" : "done",
        political,
        lang,
        date,
        claims,
        hits,
        misses,
    };
}

/** Dev-only store. Replace with Redis (same interface). */
export class MemoryCacheStore implements CacheStore {
    private readonly entries = new Map<string, CachedClaim>();

    async all(): Promise<CachedClaim[]> {
        return [...this.entries.values()];
    }

    async getByKey(key: string): Promise<CachedClaim | undefined> {
        return this.entries.get(key);
    }

    async put(entry: CachedClaim): Promise<void> {
        this.entries.set(entry.key, entry);
    }
}
