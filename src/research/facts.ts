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

const ELECTION_ROUNDS: Record<number, number> = {
    1990: 2,
    1995: 2,
    2000: 1,
    2005: 2,
    2010: 2,
    2015: 2,
    2020: 2,
    2025: 2,
};

/**
 * Polish presidential elections: how many rounds they actually had. A claim
 * that says "won in the first round" when the election had two rounds is
 * partial truth, not a pure falsehood. The source is the public election page.
 */
export function electionRoundEvidence(
    claim: ClaimInput,
    retrievedAt: string,
): Evidence | null {
    const text = norm(`${claim.text} ${claim.quote ?? ""} ${claim.details ?? ""}`);
    if (!/wybory prezydenckie|presidential election/.test(text)) return null;

    const first = /\bpierwsz\w*\s+tur\w*|\bfirst round\b/.test(text);
    const second = /\bdrug\w*\s+tur\w*|\bsecond round\b/.test(text);
    if (!first && !second) return null;

    const year = Number(/\b(19\d{2}|20\d{2})\b/.exec(text)?.[1]);
    const rounds = ELECTION_ROUNDS[year];
    if (!rounds) return null;

    const mismatch = (first && rounds > 1) || (second && rounds === 1);
    if (!mismatch) return null;

    return {
        title: `Wybory prezydenckie w Polsce w ${year} roku`,
        publisher: "Wikipedia (pl)",
        publishedAt: null,
        retrievedAt,
        url: `https://pl.wikipedia.org/wiki/Wybory_prezydenckie_w_Polsce_w_${year}_roku`,
        excerpt:
            `Wybory prezydenckie w Polsce w ${year} roku odbyły się w ` +
            `${rounds === 1 ? "jednej turze" : `${rounds} turach`}. ` +
            "Samo zwycięstwo nie dowodzi wygranej we wskazanej turze.",
        type: "secondary",
        relation: "refutes",
    };
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
