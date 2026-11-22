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

const EU_URL =
    "https://european-union.europa.eu/principles-countries-history/country-profiles/poland_pl";
const NATO_URL = "https://www.nato.int/cps/pl/natohq/topics_52044.htm";

/**
 * Poland's EU and NATO accession dates are fixed public facts. Checking them
 * locally prevents a bad lexical hit from refuting a true membership claim.
 */
export function membershipEvidence(claim: ClaimInput, retrievedAt: string): Evidence | null {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = norm(fact.s);
    const object = norm(fact.o);
    const predicate = norm(fact.p);
    const text = norm(`${claim.text} ${fact.p} ${fact.o}`);
    if (!/\b(polska|poland|rzeczpospolita)\b/.test(subject)) return null;

    const membership =
        /member|czlon|nalezy|joined|join\b|wstap|wstąp|przystap|przystąp|accession|dolacz|dołącz/.test(
            predicate + " " + text,
        );
    if (!membership) return null;

    const eu = /unia europejska|\bue\b|european union/.test(object + " " + text);
    const nato = /\bnato\b/.test(object + " " + text);
    if (!eu && !nato) return null;

    const actualYear = eu ? 2004 : 1999;
    const claimedYear = Number(/\b(19\d{2}|20\d{2})\b/.exec(text)?.[1]);
    const relation = claimedYear && claimedYear !== actualYear ? "refutes" : "supports";

    return {
        title: eu
            ? "Polska w Unii Europejskiej — profil kraju"
            : "Polska w NATO — informacje podstawowe",
        publisher: eu ? "Komisja Europejska" : "NATO",
        publishedAt: null,
        retrievedAt,
        url: eu ? EU_URL : NATO_URL,
        excerpt: eu
            ? `Polska jest członkiem Unii Europejskiej od 1 maja 2004 r.` +
              (claimedYear && claimedYear !== actualYear
                  ? ` Twierdzenie podaje ${claimedYear} r., co się nie zgadza.`
                  : "")
            : `Polska jest członkiem NATO od 12 marca 1999 r.` +
              (claimedYear && claimedYear !== actualYear
                  ? ` Twierdzenie podaje ${claimedYear} r., co się nie zgadza.`
                  : ""),
        type: "primary",
        relation,
    };
}

const PRESIDENTIAL_WINNERS: Record<number, string[]> = {
    1990: ["walesa", "wałęsa", "lech wałęsa"],
    1995: ["kwasniewski", "kwaśniewski", "aleksander kwaśniewski"],
    2000: ["kwasniewski", "kwaśniewski", "aleksander kwaśniewski"],
    2005: ["kaczynski", "kaczyński", "lech kaczyński"],
    2010: ["komorowski", "bronisław komorowski"],
    2015: ["duda", "andrzej duda"],
    2020: ["duda", "andrzej duda"],
    2025: ["nawrocki", "karol nawrocki"],
};

const WINNER_DISPLAY: Record<number, string> = {
    1990: "Lech Wałęsa",
    1995: "Aleksander Kwaśniewski",
    2000: "Aleksander Kwaśniewski",
    2005: "Lech Kaczyński",
    2010: "Bronisław Komorowski",
    2015: "Andrzej Duda",
    2020: "Andrzej Duda",
    2025: "Karol Nawrocki",
};

/**
 * Who won the Polish presidential election in a given year. Covers the direct
 * "X won the YYYY election" claim, including the reversed "X lost to Y" form.
 */
export function electionWinnerEvidence(
    claim: ClaimInput,
    retrievedAt: string,
): Evidence | null {
    const text = norm(`${claim.text} ${claim.quote ?? ""} ${claim.details ?? ""}`);
    if (!/wybory prezydenckie|presidential election/.test(text)) return null;

    const year = Number(/\b(19\d{2}|20\d{2})\b/.exec(text)?.[1]);
    const winners = PRESIDENTIAL_WINNERS[year];
    if (!winners) return null;

    const subject = norm(claim.fact?.s ?? "");
    if (!subject) return null;
    const expected = winners.find(
        (winner) => subject.includes(winner) || winner.includes(subject),
    );
    if (!expected) return null;

    const lost = /\b(przegra\w*|lost|defeated by)\b/.test(text);
    const won = /\b(wygra\w*|won|zwyciez\w*|zwycięz\w*)\b/.test(text);
    if (!lost && !won) return null;

    const claimSaysWinner = !lost;
    const relation = claimSaysWinner ? "supports" : "refutes";

    return {
        title: `Wybory prezydenckie w Polsce w ${year} roku — wynik`,
        publisher: "Wikipedia (pl)",
        publishedAt: null,
        retrievedAt,
        url: `https://pl.wikipedia.org/wiki/Wybory_prezydenckie_w_Polsce_w_${year}_roku`,
        excerpt:
            `Wybory prezydenckie w Polsce w ${year} roku wygrał ` +
            `${WINNER_DISPLAY[year] ?? winners[winners.length - 1]}.` +
            (relation === "refutes"
                ? " Twierdzenie przypisuje zwycięstwo lub porażkę niezgodnie z wynikiem."
                : ""),
        type: "secondary",
        relation,
    };
}

const HEAD_OF_GOVERNMENT: Record<number, { name: string; match: string[] }> = {
    2016: { name: "Beata Szydło", match: ["szydlo", "szydło", "beata szydło"] },
    2019: { name: "Mateusz Morawiecki", match: ["morawiecki", "mateusz morawiecki"] },
    2020: { name: "Mateusz Morawiecki", match: ["morawiecki", "mateusz morawiecki"] },
    2021: { name: "Mateusz Morawiecki", match: ["morawiecki", "mateusz morawiecki"] },
    2022: { name: "Mateusz Morawiecki", match: ["morawiecki", "mateusz morawiecki"] },
    2024: { name: "Donald Tusk", match: ["tusk", "donald tusk"] },
    2025: { name: "Donald Tusk", match: ["tusk", "donald tusk"] },
    2026: { name: "Donald Tusk", match: ["tusk", "donald tusk"] },
};

/**
 * Recent Polish prime ministers by year. Only years with one holder are listed;
 * transition years (2017, 2023) stay out to avoid guessing.
 */
export function headOfGovernmentEvidence(
    claim: ClaimInput,
    retrievedAt: string,
): Evidence | null {
    const fact = claim.fact;
    if (!fact) return null;

    const text = norm(
        `${claim.text} ${claim.details ?? ""} ${claim.quote ?? ""} ${fact.p} ${fact.o}`,
    );
    if (!/premier|prime minister/.test(text)) return null;
    if (!/\b(polska|poland|polski|polskie)\b/.test(text)) return null;

    const year = Number(/\b(19\d{2}|20\d{2})\b/.exec(text)?.[1]);
    const office = HEAD_OF_GOVERNMENT[year];
    if (!office) return null;

    const subject = norm(fact.s);
    if (!subject) return null;

    const relation = office.match.some(
        (name) => subject.includes(name) || name.includes(subject),
    )
        ? "supports"
        : "refutes";

    return {
        title: `Premier Polski w ${year} roku`,
        publisher: "Wikipedia (pl)",
        publishedAt: null,
        retrievedAt,
        url: "https://pl.wikipedia.org/wiki/Prezesi_Rady_Ministrów_w_Polsce",
        excerpt:
            `W ${year} roku premierem Polski był ${office.name}.` +
            (relation === "refutes"
                ? ` Twierdzenie wskazuje inną osobę (${fact.s}).`
                : ""),
        type: "secondary",
        relation,
    };
}

/**
 * One deterministic answer for the facts we can settle without search.
 * Returns null when the claim is outside these small tables.
 */
export function commonFactEvidence(claim: ClaimInput, retrievedAt: string): Evidence | null {
    return (
        membershipEvidence(claim, retrievedAt) ??
        currencyEvidence(claim, retrievedAt) ??
        electionRoundEvidence(claim, retrievedAt) ??
        electionWinnerEvidence(claim, retrievedAt) ??
        headOfGovernmentEvidence(claim, retrievedAt)
    );
}

const ECB_URL = "https://www.ecb.europa.eu/euro/html/index.pl.html";

export function currencyEvidence(claim: ClaimInput, retrievedAt: string): Evidence | null {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = norm(fact.s);
    const object = norm(fact.o);
    const text = norm(claim.text);

    // A normative "Poland should adopt the euro" is an opinion, not a fact.
    if (/powinien|powinna|powinno|should|ought|nalezy|należy|trzeba|postulat/.test(text)) {
        return null;
    }

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
