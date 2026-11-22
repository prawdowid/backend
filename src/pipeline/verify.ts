import { randomUUID } from "node:crypto";
import { runPipeline, type CacheStore } from ".";
import { FileCacheStore } from "./filestore";
import { researchClaims } from "../research";
import { Markdown } from "../modules/utils";
import {
    DISCLAIMER_PL,
    type ClaimVerdict,
    type Evidence,
    type VerifyRequest,
    type VerifyResponse,
    type Verdict,
} from "./types";

const MAX_TEXT = 100_000;

/** Persisted between runs; swap for Redis via the same CacheStore interface. */
export const defaultCache: CacheStore = new FileCacheStore();

function cacheVerdict(verdict: string): Verdict {
    switch (verdict) {
        case "true":
            return "confirmed";
        case "false":
            return "false";
        case "mixed":
            return "misleading";
        default:
            return "insufficient_evidence";
    }
}

function safePublisher(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "źródło";
    }
}

function cachedEvidence(text: string, sources: string[], verdict: Verdict, checkedAt: string): Evidence[] {
    const relation = verdict === "false" ? "refutes" : verdict === "confirmed" ? "supports" : "context";
    return sources.map((url) => ({
        title: text,
        publisher: safePublisher(url),
        publishedAt: checkedAt.slice(0, 10),
        retrievedAt: new Date().toISOString(),
        url,
        excerpt: text,
        type: "fact_check" as const,
        relation,
    }));
}

function pluralPl(n: number, one: string, few: string, many: string): string {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs === 1) return one;
    if (last >= 2 && last <= 4 && (abs < 12 || abs > 14)) return few;
    return many;
}

function countSummary(claims: ClaimVerdict[]): string {
    if (claims.length === 0) return "Nie znaleziono twierdzeń, które dałoby się sprawdzić.";
    const counts = new Map<string, number>();
    for (const claim of claims) counts.set(claim.verdict, (counts.get(claim.verdict) ?? 0) + 1);

    const parts: string[] = [];
    const labels: Array<[Verdict, string]> = [
        ["confirmed", "potwierdzonych"],
        ["false", "fałszywych"],
        ["misleading", "wprowadzających w błąd"],
        ["insufficient_evidence", "bez wystarczających dowodów"],
        ["not_verifiable", "niepodlegających weryfikacji"],
    ];
    for (const [verdict, label] of labels) {
        const n = counts.get(verdict);
        if (n) parts.push(`${n} ${label}`);
    }
    const noun = pluralPl(claims.length, "twierdzenie", "twierdzenia", "twierdzeń");
    return `Sprawdzono ${claims.length} ${noun}: ${parts.join(", ")}.`;
}

export async function verifyInput(
    request: VerifyRequest,
    options: { cache?: CacheStore; asOf?: string } = {},
): Promise<VerifyResponse> {
    const started = Date.now();
    const cache = options.cache ?? defaultCache;

    const text = typeof request.text === "string" ? request.text.trim() : "";
    const url = typeof request.url === "string" ? request.url.trim() : "";

    if (!text && !url) {
        return {
            status: "needs_clarification",
            language: "pl",
            input: { kind: "text", preview: "" },
            summary: "Podaj treść doniesienia albo link do niego.",
            claims: [],
            limitations: ["Brak treści do sprawdzenia."],
            timingMs: Date.now() - started,
            costUsd: 0,
            models: [],
            sourcesUsed: [],
            sessionId: randomUUID(),
            disclaimer: DISCLAIMER_PL,
        };
    }

    if (text.length > MAX_TEXT) {
        return {
            status: "error",
            language: "pl",
            input: { kind: "text", preview: text.slice(0, 200) },
            summary: "Treść jest zbyt długa.",
            claims: [],
            limitations: [`Limit to ${MAX_TEXT} znaków.`],
            timingMs: Date.now() - started,
            costUsd: 0,
            models: [],
            sourcesUsed: [],
            sessionId: randomUUID(),
            disclaimer: DISCLAIMER_PL,
        };
    }

    const bareUrl = /^https?:\/\/\S+$/i.test(text);
    const targetUrl = url || (bareUrl ? text : "");

    try {
        // An explicit url always wins over surrounding text ("sprawdź to: https://...").
        const content = targetUrl ? await Markdown(targetUrl) : text;
        const pipeline = await runPipeline(content, cache, { asOf: options.asOf });
        const claims: ClaimVerdict[] = [];
        const covered = new Set<string>();

        for (const hit of pipeline.hits) {
            covered.add(hit.claim.id);
            const verdict = cacheVerdict(hit.cached.verdict);
            claims.push({
                id: hit.claim.id,
                claim: hit.claim.text,
                verdict,
                confidence: Math.max(0, Math.min(1, hit.probability)),
                strength: hit.probability >= 0.85 ? "high" : "medium",
                reasoning:
                    verdict === "confirmed"
                        ? "Twierdzenie jest zgodne z wpisem w bazie zweryfikowanych informacji."
                        : verdict === "false"
                          ? "Twierdzenie jest sprzeczne z wpisem w bazie zweryfikowanych informacji."
                          : verdict === "misleading"
                            ? "Twierdzenie częściowo pokrywa się z wpisem w bazie; wymaga ostrożności."
                            : "Wpis w bazie nie rozstrzyga tego twierdzenia.",
                evidence: cachedEvidence(hit.claim.text, hit.cached.sources, verdict, hit.cached.checkedAt),
                limitations: verdict === "insufficient_evidence" ? ["Wpis w bazie nie rozstrzyga twierdzenia."] : [],
                asOf: pipeline.date ?? options.asOf ?? new Date().toISOString().slice(0, 10),
                cached: true,
            });
        }

        const pending = pipeline.claims.filter((claim) => !covered.has(claim.id));
        let researchCost = 0;
        const researchModels: string[] = [];
        if (pending.length > 0) {
            const researched = await researchClaims(pending, {
                asOf: pipeline.date ?? options.asOf,
            });
            claims.push(...researched.claims);
            researchCost = researched.costUsd;
            researchModels.push(...researched.models);
        }

        const sourcesUsed = [...new Set(claims.flatMap((claim) => claim.evidence.map((e) => e.url)))];
        const limitations = [...new Set(claims.flatMap((claim) => claim.limitations))];
        if (pipeline.injectionSuspected) {
            limitations.push(
                "W treści wykryto próbę wpływu na instrukcje systemu. Potraktowano ją wyłącznie jako dane do sprawdzenia.",
            );
        }

        return {
            status: "ok",
            language: "pl",
            input: {
                kind: targetUrl ? "url" : "text",
                preview: (url || text).slice(0, 240),
            },
            summary: countSummary(claims),
            claims,
            limitations,
            timingMs: Date.now() - started,
            costUsd: (pipeline.costUsd ?? 0) + researchCost,
            models: [...new Set([...(pipeline.models ?? []), ...researchModels])],
            sourcesUsed,
            sessionId: randomUUID(),
            disclaimer: DISCLAIMER_PL,
        };
    } catch (error) {
        console.error("[verify] technical failure:", (error as Error).message);
        return {
            status: "error",
            language: "pl",
            input: { kind: targetUrl ? "url" : "text", preview: (targetUrl || text).slice(0, 200) },
            summary: "Nie udało się wykonać sprawdzenia. To nie jest werdykt.",
            claims: [],
            limitations: ["Błąd techniczny po stronie serwera. Spróbuj ponownie później."],
            timingMs: Date.now() - started,
            costUsd: 0,
            models: [],
            sourcesUsed: [],
            sessionId: randomUUID(),
            disclaimer: DISCLAIMER_PL,
        };
    }
}
