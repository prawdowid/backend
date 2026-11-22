import { randomUUID } from "node:crypto";
import { runPipeline, type CacheStore } from ".";
import { FileCacheStore } from "./filestore";
import { MySQLCacheStore } from "./mysqlstore";
import { aggregateVerdicts } from "./aggregate";
import { researchClaims } from "../research";
import { DeepSeekOCRExtract, ReadableText } from "../modules/utils";
import { OpenRouterWrapper } from "../modules/openrouter";
import {
    DISCLAIMER_PL,
    type ClaimVerdict,
    type Evidence,
    type VerifyRequest,
    type VerifyResponse,
    type Verdict,
} from "./types";

const MAX_TEXT = 100_000;

/** Max decoded image size. The API schema caps the base64 string at 12M chars (~9 MB). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_LIMITATION =
    "Treść odczytana OCR. Obraz nie jest niezależnie weryfikowany; data i metadane mogą być nieaktualne.";

/** Strips a data URI prefix; tolerant of raw base64 input. */
function decodeImage(image: string): Buffer {
    return Buffer.from(image.replace(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, ""), "base64");
}

/** Short technical reason safe to show to the user: no URLs, no secrets, bounded length. */
function technicalReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const cleaned = message.replace(/https?:\/\/\S+/gi, "[adres]").trim();
    return (cleaned || "nieznany błąd").slice(0, 200);
}

/** Persisted between runs; MySQL when MYSQL_URL is set, JSON file otherwise. */
export const defaultCache: CacheStore = (() => {
    const mysqlUrl = process.env["MYSQL_URL"] ?? process.env["DATABASE_URL"];
    return mysqlUrl ? new MySQLCacheStore(mysqlUrl) : new FileCacheStore();
})();

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
    const image = typeof request.image === "string" ? request.image.trim() : "";
    const hasImage = image.length > 0;

    if (!text && !url && !hasImage) {
        return {
            status: "needs_clarification",
            language: "pl",
            input: { kind: "text", preview: "" },
            summary: "Podaj treść doniesienia, link do niego albo zdjęcie z tekstem.",
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

    let imageText = "";
    let imagePreview = "";

    if (hasImage) {
        const bytes = decodeImage(image);

        if (bytes.length === 0) {
            return {
                status: "error",
                language: "pl",
                input: { kind: "image", preview: "" },
                summary: "Nie udało się odczytać obrazu. To nie jest werdykt.",
                claims: [],
                limitations: [IMAGE_LIMITATION, "Powód techniczny: pusty lub niepoprawny obraz."],
                timingMs: Date.now() - started,
                costUsd: 0,
                models: [],
                sourcesUsed: [],
                sessionId: randomUUID(),
                disclaimer: DISCLAIMER_PL,
            };
        }

        if (bytes.length > MAX_IMAGE_BYTES) {
            return {
                status: "error",
                language: "pl",
                input: { kind: "image", preview: "" },
                summary: "Obraz jest zbyt duży. To nie jest werdykt.",
                claims: [],
                limitations: [
                    `Limit obrazu to ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB po zdekodowaniu.`,
                ],
                timingMs: Date.now() - started,
                costUsd: 0,
                models: [],
                sourcesUsed: [],
                sessionId: randomUUID(),
                disclaimer: DISCLAIMER_PL,
            };
        }

        try {
            const ocr = await DeepSeekOCRExtract(image);
            imageText = (Array.isArray(ocr.text) ? ocr.text : []).join("\n").trim();

            if (!imageText) {
                return {
                    status: "error",
                    language: "pl",
                    input: { kind: "image", preview: "" },
                    summary: "Nie udało się odczytać obrazu. To nie jest werdykt.",
                    claims: [],
                    limitations: [
                        IMAGE_LIMITATION,
                        `Powód techniczny: OCR nie zwrócił tekstu (status: ${ocr.status || "brak"}).`,
                    ],
                    timingMs: Date.now() - started,
                    costUsd: 0,
                    models: [],
                    sourcesUsed: [],
                    sessionId: randomUUID(),
                    disclaimer: DISCLAIMER_PL,
                };
            }

            imagePreview = imageText.slice(0, 200);
        } catch (error) {
            console.error("[verify] OCR failure:", technicalReason(error));
            return {
                status: "error",
                language: "pl",
                input: { kind: "image", preview: "" },
                summary: "Nie udało się odczytać obrazu. To nie jest werdykt.",
                claims: [],
                limitations: [IMAGE_LIMITATION, `Powód techniczny: ${technicalReason(error)}`],
                timingMs: Date.now() - started,
                costUsd: 0,
                models: [],
                sourcesUsed: [],
                sessionId: randomUUID(),
                disclaimer: DISCLAIMER_PL,
            };
        }
    }

    const bareUrl = /^https?:\/\/\S+$/i.test(text);
    const targetUrl = url || (bareUrl ? text : "");
    const inputKind: VerifyResponse["input"]["kind"] = hasImage ? "image" : targetUrl ? "url" : "text";
    const inputPreview = hasImage ? imagePreview : (url || text).slice(0, 240);

    try {
        // An explicit url always wins over surrounding text ("sprawdź to: https://...").
        const parts: string[] = [];
        if (imageText) parts.push(imageText);
        parts.push(targetUrl ? await ReadableText(targetUrl) : text);
        const content = parts.filter((part) => part.length > 0).join("\n\n");
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
        // researchUsd is research.costUsd; research does not report a finer split yet.
        let researchUsd = 0;
        const researchModels: string[] = [];
        if (pending.length > 0) {
            const researched = await researchClaims(pending, {
                asOf: pipeline.date ?? options.asOf,
            });
            claims.push(...researched.claims);
            researchUsd = researched.costUsd;
            researchModels.push(...researched.models);

            // Close the loop: verified research becomes cache, so the next identical
            // claim is an exact hit instead of another network round-trip.
            try {
                const cacheable = researched.claims.filter(
                    (claim) =>
                        claim.evidence.length > 0 &&
                        (claim.verdict === "confirmed" || claim.verdict === "false" || claim.verdict === "misleading"),
                );
                if (cacheable.length > 0) {
                    const checkedAt = new Date().toISOString();
                    const vectors = await OpenRouterWrapper.Embed(cacheable.map((claim) => claim.claim));

                    for (let i = 0; i < cacheable.length; i++) {
                        const result = cacheable[i]!;
                        const source = pending.find((claim) => claim.id === result.id);
                        if (!source) continue;

                        const cacheVerdict =
                            result.verdict === "confirmed"
                                ? "true"
                                : result.verdict === "false"
                                  ? "false"
                                  : "mixed";

                        await cache.put({
                            id: source.id,
                            key: source.key,
                            text: source.text,
                            details: source.details,
                            verdict: cacheVerdict,
                            sources: result.evidence.map((item) => item.url),
                            checkedAt,
                            embedding: vectors[i]!,
                            validFrom: source.fact.t ?? null,
                            validUntil: null,
                        });
                    }
                }
            } catch (error) {
                console.error("[verify] cache write failed:", (error as Error).message);
            }
        }

        const sourcesUsed = [...new Set(claims.flatMap((claim) => claim.evidence.map((e) => e.url)))];
        const limitations = [...new Set(claims.flatMap((claim) => claim.limitations))];
        if (hasImage) limitations.unshift(IMAGE_LIMITATION);
        if (pipeline.injectionSuspected) {
            limitations.push(
                "W treści wykryto próbę wpływu na instrukcje systemu. Potraktowano ją wyłącznie jako dane do sprawdzenia.",
            );
        }

        return {
            status: "ok",
            language: "pl",
            input: {
                kind: inputKind,
                preview: inputPreview,
            },
            summary: countSummary(claims),
            claims,
            overallVerdict: aggregateVerdicts(claims.map((claim) => claim.verdict)),
            limitations,
            timingMs: Date.now() - started,
            costUsd: (pipeline.costUsd ?? 0) + researchUsd,
            costBreakdown: {
                extractionUsd: pipeline.costBreakdown?.extractionUsd ?? 0,
                jevUsd: pipeline.costBreakdown?.jevUsd ?? 0,
                embeddingUsd: pipeline.costBreakdown?.embeddingUsd ?? 0,
                researchUsd,
            },
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
            input: {
                kind: inputKind,
                preview: (hasImage ? imagePreview : targetUrl || text).slice(0, 200),
            },
            summary: "Nie udało się wykonać sprawdzenia. To nie jest werdykt.",
            claims: [],
            limitations: [
                ...(hasImage ? [IMAGE_LIMITATION] : []),
                "Błąd techniczny po stronie serwera. Spróbuj ponownie później.",
            ],
            timingMs: Date.now() - started,
            costUsd: 0,
            models: [],
            sourcesUsed: [],
            sessionId: randomUUID(),
            disclaimer: DISCLAIMER_PL,
        };
    }
}
