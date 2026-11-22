import type { ClaimInput, Evidence } from "../pipeline/types";

/**
 * Small deterministic checks that do not depend on an LLM or a flaky API.
 * These complement Wikidata for very common factual pairs.
 */
const NON_EURO = new Set([
    "polska",
    "czechy",
    "wegry",
    "węgry",
    "rumunia",
    "bulgaria",
    "bułgaria",
    "szwecja",
    "dania",
]);

const EUROZONE = new Set([
    "niemcy",
    "francja",
    "hiszpania",
    "wlochy",
    "włochy",
    "holandia",
    "belgia",
    "austria",
    "portugalia",
    "irlandia",
    "finlandia",
    "grecja",
    "slowacja",
    "słowacja",
    "slowenia",
    "słowenia",
    "chorwacja",
    "litwa",
    "lotwa",
    "łotwa",
    "estonia",
    "luksemburg",
    "malta",
    "cypr",
]);

function norm(value: unknown): string {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const ECB_URL = "https://www.ecb.europa.eu/euro/html/index.pl.html";

export function currencyEvidence(claim: ClaimInput, retrievedAt: string): Evidence | null {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = norm(fact.s);
    const object = norm(fact.o);
    const text = norm(claim.text);
    const mentionsEuro = object.includes("euro") || text.includes("euro");
    const currencyClaim = /currency|waluta|walut/.test(norm(fact.p)) || mentionsEuro;

    if (!currencyClaim || !mentionsEuro || !subject) return null;

    const base = {
        title: "Strefa euro — wykaz państw",
        publisher: "Europejski Bank Centralny",
        publishedAt: null,
        retrievedAt,
        url: ECB_URL,
        type: "primary" as const,
    };

    if (NON_EURO.has(subject)) {
        return {
            ...base,
            excerpt: `${fact.s} nie należy do strefy euro, więc nie posługuje się walutą euro.`,
            relation: "refutes",
        };
    }

    if (EUROZONE.has(subject)) {
        return {
            ...base,
            excerpt: `${fact.s} należy do strefy euro i posługuje się walutą euro.`,
            relation: "supports",
        };
    }

    return null;
}
