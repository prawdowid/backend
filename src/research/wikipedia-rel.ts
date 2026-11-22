/**
 * Relation-aware Wikipedia lookup (prototype).
 *
 * The regular Wikipedia fallback in `./index.ts` asks "does some sentence name
 * the subject AND the object?". That finds supporting sentences but almost never
 * refutes a false claim: the page about Kraków does not contain the sentence
 * "Kraków is the capital of Poland", so a false claim ends as
 * `insufficient_evidence`.
 *
 * This module asks Wikipedia about the RELATION instead. For
 * `Kraków — capital_of — Polska` it searches "stolica Polska" and reads the
 * sentence "Stolicą Polski jest Warszawa". Jev then decides who the sentence
 * binds the object to: the claim subject (supports) or a different subject /
 * different value / different date (refutes).
 *
 * Only `fact` (s/p/o/t/neg) is used; there are no new dependencies.
 */

import type { DecisionsNoulQuestion } from "@openrouter/sdk/models";
import { OpenRouterWrapper } from "../modules/openrouter";
import type { ClaimInput } from "../pipeline/types";

const WIKI_API = "https://pl.wikipedia.org/w/api.php";
/**
 * Wikimedia rate-limits generic/empty user agents aggressively. A descriptive UA
 * with a project URL is required by the API etiquette policy.
 * For a production deployment replace the URL with the real project page.
 */
const USER_AGENT = "PrawdowidBot/1.0 (+https://github.com/hackathon/prawdowid; fact-checking prototype)";
const SEARCH_LIMIT = 5;
const MAX_SEARCH_QUERIES = 4;
const MAX_PAGES = 5;
const MAX_SENTENCES = 24;
const MIN_SENTENCE = 20;
const MAX_SENTENCE = 700;
const REQUEST_TIMEOUT_MS = 6000;
/** Two requests never leave closer together than this (Wikimedia etiquette). */
const MIN_REQUEST_GAP_MS = 200;
const JEV_THRESHOLD = 0.8;

export type RelationLookupResult = {
    relation: "supports" | "refutes" | null;
    sentence: string;
    url: string;
};

type WikiSearchResponse = {
    query?: { search?: Array<{ title?: string }> };
};

type WikiExtractsResponse = {
    query?: {
        pages?: Record<string, { title?: string; extract?: string }>;
    };
};

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const STOPWORDS = new Set([
    "jest", "byl", "byla", "bylo", "byly", "będzie", "bedzie", "będą", "beda",
    "sie", "się", "tego", "tej", "tych", "jego", "jej", "ich", "jako", "przez",
    "który", "ktora", "która", "które", "ktore", "dla", "oraz", "albo", "lub",
    "nie", "tak", "the", "and", "with", "from", "that", "this", "have", "has",
    "roku", "rok", "lat", "jest", "była", "był", "było", "były",
]);

/** Digits always count (values and dates matter); words need 3+ chars. */
function keywordsOf(value: string): string[] {
    return normalizeText(value)
        .split(" ")
        .filter((token) => token.length > 0)
        .filter((token) => (/^\d+$/.test(token) ? true : token.length >= 3 && !STOPWORDS.has(token)));
}

/** Crude Polish stemming: 5-char prefix handles stolica/stolicą/stolicy. */
function stemOf(token: string): string {
    return token.length > 5 ? token.slice(0, 5) : token;
}

function mentions(haystack: string, tokens: string[]): number {
    return tokens.filter((token) => haystack.includes(stemOf(token))).length;
}

function isNumeric(value: string): boolean {
    return /^\d+([.,]\d+)?$/.test(value.replace(/\s+/g, ""));
}

// ---------------------------------------------------------------------------
// predicate -> Polish relation phrase
// ---------------------------------------------------------------------------

/**
 * The extractor emits English snake_case predicates (`capital_of`,
 * `member_of`, `currency`), while Wikipedia is Polish. The table maps the
 * relations that matter for the eval set; unknown predicates degrade to a
 * space-separated form (still useful because the object carries the topic).
 */
const RELATION_RULES: Array<{ match: RegExp; phrases: string[]; usesSubject?: boolean }> = [
    { match: /capital|stolic/, phrases: ["stolica"] },
    { match: /currency|walut|euro/, phrases: ["waluta"] },
    { match: /seat|deput|number.*member|members|count|liczba.*pos|posł/, phrases: ["liczba posłów"], usesSubject: true },
    { match: /member|membership|accession|join|należ|nalez|przystąp|przystap/, phrases: ["członek", "członkostwo"] },
    { match: /winner|won|victory|wygra|zwycię/, phrases: ["zwycięzca", "zwycięstwo"] },
    { match: /lost|defeat|przegra/, phrases: ["przegrany", "przegrał"] },
    { match: /length|długo|dlugo/, phrases: ["długość"] },
    { match: /prime.?minister|premier/, phrases: ["premier", "prezes Rady Ministrów"] },
    { match: /president/, phrases: ["prezydent"] },
    { match: /population|ludno/, phrases: ["liczba ludności"] },
    { match: /area|powierzchn/, phrases: ["powierzchnia"] },
    { match: /height|wysoko/, phrases: ["wysokość"] },
    { match: /founded|establish|założ|zaloż/, phrases: ["założenie"] },
    { match: /border|granic/, phrases: ["granica"] },
    { match: /river|rzek/, phrases: ["rzeka"] },
    { match: /located|położ|poloz/, phrases: ["położenie"] },
    { match: /headquarters|siedzib/, phrases: ["siedziba"] },
    { match: /religion|wyznanie/, phrases: ["religia"] },
];

function relationPhrases(predicate: string, subject: string): string[] {
    const key = predicate.toLowerCase().replace(/[_-]+/g, " ").trim();

    for (const rule of RELATION_RULES) {
        if (!rule.match.test(key)) continue;
        // "liczba posłów" makes sense for a parliament, not for a random count.
        if (rule.usesSubject && !/sejm|senat|parlament|kongres|izb/i.test(subject)) continue;
        return rule.phrases;
    }

    // Unknown predicate: use the words themselves, the object disambiguates.
    const words = key.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    return words.length >= 3 ? [words] : [];
}

/** Drop a leading date phrase so Wikipedia search focuses on the proposition. */
function stripLeadingDate(text: string): string {
    return text
        .replace(/^\s*(w|we|od|dnia)\s+\d{4}\s*(roku|r\.)?\s*/iu, "")
        .replace(/^\s*\d{4}\s*(roku|r\.)?\s*/iu, "")
        .trim();
}

/**
 * Search queries, most specific first:
 *   1. relation + object      ("stolica Polska", "członek NATO")
 *   2. subject + object + year ("Polska Unia Europejska 2004") — the entity page
 *      is where the decisive sentence usually lives
 *   3. relation + subject     ("liczba posłów Sejm", "zwycięzca Andrzej Duda")
 *   4. the claim's own wording
 * For numeric objects the first query is relation + subject + number.
 */
export function buildRelationQueries(claim: ClaimInput): string[] {
    const fact = claim.fact;
    if (!fact) return [];

    const subject = (fact.s ?? "").trim();
    const object = String(fact.o ?? "").trim();
    const phrases = relationPhrases(fact.p ?? "", subject);
    const numeric = isNumeric(object);

    const claimText = claim.text?.trim() || `${subject} ${fact.p ?? ""} ${object}`;
    const year = (claimText.match(/\b(?:19|20)\d{2}\b/) ?? [])[0] ?? (fact.t ?? "").match(/\d{4}/)?.[0] ?? "";

    const queries: string[] = [];
    const push = (value: string) => {
        const clean = value.replace(/\s+/g, " ").trim();
        if (clean.length >= 3 && !queries.some((item) => item.toLowerCase() === clean.toLowerCase())) {
            queries.push(clean);
        }
    };

    for (const variant of phrases) {
        if (numeric) {
            push(`${variant} ${subject} ${object}`);
        } else {
            push(`${variant} ${object}`);
        }
        // Two relation phrasings help ("członek" vs "członkostwo").
        if (queries.length >= 2) break;
    }

    push([subject, object, year].filter((part) => part.length > 0).join(" "));

    for (const variant of phrases) {
        push(`${variant} ${subject}`);
    }
    push(stripLeadingDate(claimText));

    return queries.slice(0, MAX_SEARCH_QUERIES);
}

// ---------------------------------------------------------------------------
// network (fetch only, no dependencies)
// ---------------------------------------------------------------------------

let lastRequestAt = 0;

async function throttle(): Promise<void> {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
}

async function wikiJson<T>(url: string): Promise<T> {
    // Mirrors the core research client: one retry, 1.5 s pause, only for 429.
    for (let attempt = 0; attempt < 2; attempt++) {
        await throttle();
        const response = await fetch(url, {
            headers: { "user-agent": USER_AGENT, accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.status === 429 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
        }

        if (!response.ok) throw new Error(`Wikipedia ${response.status}`);
        return (await response.json()) as T;
    }

    throw new Error("Wikipedia 429");
}

async function searchTitles(query: string): Promise<string[]> {
    const url =
        `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}` +
        `&srlimit=${SEARCH_LIMIT}&format=json&origin=*`;
    const data = await wikiJson<WikiSearchResponse>(url);
    return (data.query?.search ?? [])
        .map((item) => item.title?.trim() ?? "")
        .filter((title) => title.length > 0);
}

async function pageExtract(title: string): Promise<{ title: string; text: string } | null> {
    const url =
        `${WIKI_API}?action=query&prop=extracts&explaintext=1&redirects=1` +
        `&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const data = await wikiJson<WikiExtractsResponse>(url);
    const entry = Object.values(data.query?.pages ?? {})[0];
    const text = entry?.extract ?? "";
    if (text.length === 0) return null;
    return { title: entry?.title ?? title, text };
}

function pageUrl(title: string): string {
    return `https://pl.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

// ---------------------------------------------------------------------------
// sentence candidates
// ---------------------------------------------------------------------------

function sentencesOf(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.replace(/\s+/g, " ").trim())
        .filter((sentence) => sentence.length >= MIN_SENTENCE && sentence.length <= MAX_SENTENCE);
}

/** A year matches directly or through a range ("2010–2015" contains 2014). */
function yearMatches(sentence: string, year: string): boolean {
    if (!year) return false;
    if (sentence.includes(year)) return true;
    const range = sentence.match(/((?:19|20)\d{2})\s*[–-]\s*((?:19|20)\d{2})/);
    if (!range) return false;
    const value = Number(year);
    return value >= Number(range[1]) && value <= Number(range[2]);
}

/**
 * Keep sentences that talk about the relation and at least one of
 * subject/object. The object itself must NOT be required: the whole point is to
 * catch "Wisła ma 1047 km" for a claim of 2047 km. Relation + subject is enough.
 */
function scoreSentence(
    sentence: string,
    context: string,
    claim: ClaimInput,
    phrases: string[],
): number {
    const fact = claim.fact;
    if (!fact) return 0;

    const normalized = normalizeText(sentence);
    const normalizedContext = normalizeText(context);
    const subject = keywordsOf(fact.s ?? "");
    const object = keywordsOf(String(fact.o ?? ""));
    const year = (`${fact.t ?? ""} ${claim.text ?? ""}`.match(/\b(?:19|20)\d{2}\b/) ?? [])[0] ?? "";

    let subjectHits = mentions(normalized, subject) * 2;
    let objectHits = mentions(normalized, object) * 3;
    // Context rescues elided subjects, but must not boost a neighbouring
    // sentence that already names the entities (that inflated unrelated lines).
    if (subjectHits === 0) subjectHits += Math.min(1, mentions(normalizedContext, subject));
    if (objectHits === 0) objectHits += Math.min(1, mentions(normalizedContext, object));
    const relationHit = phrases.some((phrase) => mentions(normalized, keywordsOf(phrase)) > 0);
    // Elided-subject sentences ("W latach 2017–2023 prezes Rady Ministrów…")
    // have neither subject nor object in the sentence. Relation + year is enough.
    if (subjectHits === 0 && objectHits === 0 && !relationHit) return 0;

    let score = subjectHits + objectHits;
    // A year only matters together with the relation or the subject; otherwise
    // every "in 2020 …" sentence on an election page looks relevant.
    if (relationHit || subjectHits > 0) {
        if (yearMatches(sentence, year)) score += 3;
        else if (year && sentence.match(/(?:19|20)\d{2}/)) {
            // A year within one year of the claim is still about the same period.
            const years = sentence.match(/(?:19|20)\d{2}/g) ?? [];
            if (years.some((value) => Math.abs(Number(value) - Number(year)) <= 1)) score += 2;
            // A range that ends just before the claim year ("2017–2023" vs 2024)
            // is the classic way Wikipedia says "no longer holds".
            const range = sentence.match(/((?:19|20)\d{2})\s*[–-]\s*((?:19|20)\d{2})/);
            if (range && Math.abs(Number(range[2]) - Number(year)) <= 1) score += 3;
        }
    }
    if (relationHit) score += 2;
    // Subject + relation in one sentence is the strongest signal of a binding.
    if (relationHit && subjectHits > 0) score += 5;
    // A section heading that names the object ("== Państwa poza strefą euro ==")
    // makes the following line decisive; extracts drop the heading otherwise.
    if (context.trimStart().startsWith("=") && mentions(normalizedContext, object) > 0) {
        score += 10;
    }
    return score;
}

/** A page title that names the claim's entities/relation is the better page. */
function scoreTitle(title: string, claim: ClaimInput): number {
    const fact = claim.fact;
    if (!fact) return 0;
    const normalized = normalizeText(title);
    const subject = keywordsOf(fact.s ?? "");
    const object = keywordsOf(String(fact.o ?? ""));
    const phrases = relationPhrases(fact.p ?? "", fact.s ?? "");
    const year = (`${fact.t ?? ""} ${claim.text ?? ""}`.match(/\b(?:19|20)\d{2}\b/) ?? [])[0] ?? "";

    let score = mentions(normalized, subject) * 2 + mentions(normalized, object) * 3;
    if (yearMatches(title, year)) score += 3;
    for (const phrase of phrases) {
        if (mentions(normalized, keywordsOf(phrase)) > 0) {
            score += 2;
            break;
        }
    }
    return score;
}

/**
 * The sentence plus the previous line/sentence as context. Wikipedia extracts
 * drop the subject in later sentences ("W latach 2017–2023 prezes Rady
 * Ministrów…") and rely on section headings ("== Państwa poza strefą euro ==").
 * Jev needs that context to resolve who/what the sentence is about.
 */
type Candidate = { sentence: string; context: string; article: string; url: string };

function pickCandidates(claim: ClaimInput, pages: Array<{ title: string; text: string }>): Candidate[] {
    const fact = claim.fact;
    if (!fact) return [];
    const phrases = relationPhrases(fact.p ?? "", fact.s ?? "");
    const perPage = 8;

    const scored: Array<Candidate & { score: number; signal: boolean; objectRelation: boolean }> = [];
    const seen = new Set<string>();

    for (const page of pages) {
        const sentences = sentencesOf(page.text);
        const pageCandidates: Array<Candidate & { score: number; signal: boolean; objectRelation: boolean }> = [];

        for (let index = 0; index < sentences.length; index++) {
            const sentence = sentences[index]!;
            const key = normalizeText(sentence);
            if (seen.has(key)) continue;

            const previous = index > 0 ? sentences[index - 1]! : "";
            const context = previous.length > 300 ? previous.slice(0, 300) : previous;
            const score = scoreSentence(sentence, context, claim, phrases);
            if (score <= 0) continue;

            const normalized = normalizeText(sentence);
            const relationHit = phrases.some((phrase) => mentions(normalized, keywordsOf(phrase)) > 0);
            const yearHit = /(?:19|20)\d{2}/.test(sentence);
            const objectHit = mentions(normalized, keywordsOf(String(fact.o ?? ""))) > 0;

            seen.add(key);
            pageCandidates.push({
                sentence,
                context,
                article: page.title,
                url: pageUrl(page.title),
                score,
                signal: relationHit && yearHit,
                objectRelation: objectHit && relationHit,
            });
        }

        // Quota per page: without it, one long article can crowd out the page
        // that actually holds the decisive sentence.
        pageCandidates.sort((a, b) => b.score - a.score);
        const pageSelected = pageCandidates.slice(0, perPage);

        // A sentence with both the relation and a year is exactly what decides
        // state claims ("prezes Rady Ministrów w latach 2017–2023"), so reserve
        // room for it even when subject mentions rank higher.
        const chosenKeys = new Set(pageSelected.map((entry) => entry.sentence));
        for (const entry of pageCandidates.filter((item) => item.signal && !chosenKeys.has(item.sentence)).slice(0, 2)) {
            pageSelected.push(entry);
        }

        scored.push(...pageSelected);
    }

    // Guarantee that each fetched page contributes at least two candidates;
    // one long article must not crowd out the page with the decisive sentence.
    const selected: Array<Candidate & { score: number }> = [];
    const byPage = new Map<string, Array<Candidate & { score: number; signal: boolean; objectRelation: boolean }>>();
    for (const entry of scored) {
        const list = byPage.get(entry.url) ?? [];
        list.push(entry);
        byPage.set(entry.url, list);
    }
    for (const list of byPage.values()) {
        list.sort((a, b) => b.score - a.score);
        selected.push(...list.slice(0, 2));
    }
    // Then keep the relation+year "signal" sentences, which are usually the
    // decisive ones for state claims with a date.
    const signalKeys = new Set(selected.map((entry) => `${entry.url}|${entry.sentence}`));
    for (const list of byPage.values()) {
        const signals = list.filter((entry) => entry.signal && !signalKeys.has(`${entry.url}|${entry.sentence}`));
        for (const entry of signals.slice(0, 2)) {
            if (selected.length >= MAX_SENTENCES) break;
            selected.push(entry);
            signalKeys.add(`${entry.url}|${entry.sentence}`);
        }
    }
    // Definitions ("X jest stolicą Y") contain the object and the relation; keep
    // one per page so a page full of historical trivia cannot hide it.
    for (const list of byPage.values()) {
        const definitions = list.filter(
            (entry) => entry.objectRelation && !signalKeys.has(`${entry.url}|${entry.sentence}`),
        );
        for (const entry of definitions.slice(0, 1)) {
            if (selected.length >= MAX_SENTENCES) break;
            selected.push(entry);
            signalKeys.add(`${entry.url}|${entry.sentence}`);
        }
    }

    const selectedKeys = new Set(selected.map((entry) => `${entry.url}|${entry.sentence}`));
    const remaining = scored
        .filter((entry) => !selectedKeys.has(`${entry.url}|${entry.sentence}`))
        .sort((a, b) => b.score - a.score);

    for (const entry of remaining) {
        if (selected.length >= MAX_SENTENCES) break;
        selected.push(entry);
    }

    return selected
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SENTENCES)
        .map(({ sentence, context, article, url }) => ({ sentence, context, article, url }));
}

// ---------------------------------------------------------------------------
// Jev: who does the sentence bind the object to?
// ---------------------------------------------------------------------------

type Binding = { relation: "supports" | "refutes" | null; confidence: number };

/**
 * Natural Polish wording for the relation. "Does the sentence assign `object`
 * to `subject` in relation prime minister of" is hard for a judge model;
 * "Did X serve as prime minister of Y" is not.
 */
function bindingQuestion(claim: ClaimInput): string {
    const predicate = (claim.fact?.p ?? "").toLowerCase();
    if (/capital|stolic/.test(predicate)) return "Czy zdanie mówi, że `subject` jest stolicą `object`?";
    if (/currency|walut|euro/.test(predicate)) return "Czy zdanie mówi, że `subject` używa waluty `object` lub ją przyjął?";
    if (/seat|deput|number.*member|members|count|posł/.test(predicate)) {
        return "Czy zdanie mówi, że `subject` liczy `object` (ma tyle członków/posłów)?";
    }
    if (/member|membership|accession|join|należ|nalez|przystąp|przystap/.test(predicate)) {
        return "Czy zdanie mówi, że `subject` jest członkiem `object` lub do niego przystąpił?";
    }
    if (/winner|won|victory|wygra|zwycię/.test(predicate)) return "Czy zdanie mówi, że `subject` wygrał `object`?";
    if (/lost|defeat|przegra/.test(predicate)) return "Czy zdanie mówi, że `subject` przegrał z `object`?";
    if (/length|długo|dlugo/.test(predicate)) return "Czy zdanie mówi, że `subject` ma długość `object`?";
    if (/prime.?minister|premier/.test(predicate)) return "Czy zdanie mówi, że `subject` był premierem `object`?";
    if (/president/.test(predicate)) return "Czy zdanie mówi, że `subject` był prezydentem `object`?";
    return "Czy zdanie przypisuje `object` do `subject` w relacji `relation`?";
}

/**
 * Two questions per sentence:
 *  - `same`: the sentence binds the claim's object to the claim's subject
 *    (and, when the claim has a date, in that date).
 *  - `other`: the sentence binds the object to a different subject, gives the
 *    relation a different value/time for the same subject, or negates it.
 * If neither is confident, the sentence is not evidence.
 */
async function classifyBindings(claim: ClaimInput, candidates: Candidate[]): Promise<Binding[]> {
    if (candidates.length === 0) return [];
    const fact = claim.fact;
    if (!fact) return candidates.map(() => ({ relation: null, confidence: 0 }));

    const subject = fact.s ?? "";
    const object = String(fact.o ?? "");
    const relationLabel = relationPhrases(fact.p ?? "", subject).join(" / ");
    const relation = relationLabel || (fact.p ?? "").replace(/[_]+/g, " ");
    const predicate = fact.p ?? "";
    const date = fact.t ?? "";
    const negated = fact.neg === true ? " Twierdzenie jest zaprzeczone (NIE)." : "";
    const recurring = /won|lost|wygra|przegra|election|wybory/i.test(fact.p ?? "");
    const timeRule =
        " Uwzględnij czas: zdanie o przeszłości nie przeczy twierdzeniu o teraźniejszości, " +
        "chyba że wprost mówi, jaki jest stan obecny.";    const eventRule = recurring
        ? " Inny rok tej samej cyklicznej relacji (np. inne wybory) nie jest sprzecznością."
        : "";
    const presentRule = date
        ? ""
        : " Twierdzenie bez daty dotyczy teraźniejszości: zdanie o przeszłości " +
          "(np. „w 1040 roku…”, „dawniej…”) NIE potwierdza go.";

    const baseQuestion = bindingQuestion(claim);
    const questions: Record<string, DecisionsNoulQuestion> = {};

    candidates.forEach((candidate, index) => {
        const context = candidate.context ? ` Kontekst (poprzednie zdanie): ${candidate.context}` : "";
        questions[`s${index}_same`] = {
            type: "noul",
            instructions: {
                question:
                    `${baseQuestion} Zdanie pochodzi z artykułu „${candidate.article}”. ` +
                    "Odpowiedz tak tylko wtedy, gdy zdanie wiąże ten obiekt z tym podmiotem. " +
                    "Samo wystąpienie słów w zdaniu nie wystarcza — liczy się przypisanie." +
                    (date ? " Jeśli podano `date`, zdanie musi dotyczyć tego samego czasu." : "") +
                    presentRule +
                    negated +
                    context,
                subject,
                relation,
                object,
                date,
                article: candidate.article,
                sentence: candidate.sentence,
            },
        };
        questions[`s${index}_other`] = {
            type: "noul",
            instructions: {
                question:
                    `Czy \`sentence\` (z artykułu „${candidate.article}”) przeczy temu, że \`subject\` ma relację \`relation\` z \`object\`? ` +
                    "Odpowiedz tak, gdy zdanie: (a) przypisuje `object` innemu podmiotowi niż `subject`, " +
                    "(b) przypisuje tej samej relacji inną wartość lub inny czas niż podane, " +
                    "albo (c) wprost zaprzecza tej relacji, " +
                    "albo (d) wymienia `subject` wśród państw/członków POZA `object` lub bez `object`. " +
                    "Zdanie o innym, niepowiązanym temacie to nie." +
                    timeRule +
                    eventRule +
                    negated +
                    context,
                subject,
                relation,
                object,
                date,
                article: candidate.article,
                sentence: candidate.sentence,
            },
        };
    });

    try {
        const result = await OpenRouterWrapper.Jev(
            { claim: claim.text, subject, relation, predicate, object, date },
            questions,
        );

        return candidates.map((_candidate, index) => {
            const same = result.answers[`s${index}_same`];
            const other = result.answers[`s${index}_other`];
            const pSame = same?.type === "noul" ? same.noul : 0;
            const pOther = other?.type === "noul" ? other.noul : 0;
            const candidate = candidates[index]!;
            if (process.env["PIPELINE_DEBUG"] === "1") {
                console.log(
                    `[wikipedia-rel] same=${pSame.toFixed(2)} other=${pOther.toFixed(2)} | ${candidate.sentence.slice(0, 140)}`,
                );
            }

            if (pSame >= JEV_THRESHOLD && pSame > pOther) {
                return { relation: "supports", confidence: pSame };
            }
            if (pOther >= JEV_THRESHOLD && pOther > pSame) {
                return { relation: "refutes", confidence: pOther };
            }

            // Jev is conservative when a date/range needs inference ("2017–2023"
            // vs a 2024 claim). Accept a clear, one-sided signal above 0.6, but
            // only when the other answer is far behind.
            if (pSame >= 0.6 && pSame >= pOther * 2 && pSame - pOther >= 0.35) {
                return { relation: "supports", confidence: pSame };
            }
            if (pOther >= 0.6 && pOther >= pSame * 2 && pOther - pSame >= 0.35) {
                return { relation: "refutes", confidence: pOther };
            }
            return { relation: null, confidence: 0 };
        });
    } catch {
        return candidates.map(() => ({ relation: null, confidence: 0 }));
    }
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

/**
 * Search Wikipedia for the claim's relation (predicate + object), read the top
 * pages, and decide whether the relation is bound to the claim's subject.
 *
 * Returns `null` when no usable sentence was found at all. When a sentence was
 * found but Jev could not classify it, `relation` is `null` (the sentence is
 * still returned for debugging / evidence as context).
 */
export async function relationLookup(claim: ClaimInput): Promise<RelationLookupResult | null> {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = (fact.s ?? "").trim();
    const object = String(fact.o ?? "").trim();
    if (subject.length === 0 || object.length === 0) return null;

    const queries = buildRelationQueries(claim);
    if (queries.length === 0) return null;

    // 1) search: run the queries, then interleave their results so the entity
    // page (query 2) is read even when the relation query is full of generic pages.
    const resultSets: string[][] = [];
    for (const query of queries) {
        try {
            resultSets.push(await searchTitles(query));
        } catch {
            resultSets.push([]);
        }
    }

    const titlesAll: string[] = [];
    for (const set of resultSets) {
        for (const title of set) {
            if (!titlesAll.some((item) => item.toLowerCase() === title.toLowerCase())) {
                titlesAll.push(title);
            }
        }
    }

    const titles = titlesAll
        .map((title, index) => ({ title, index, score: scoreTitle(title, claim) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, MAX_PAGES)
        .map((entry) => entry.title);
    if (titles.length === 0) return null;

    // 2) read extracts for the best pages.
    const pages: Array<{ title: string; text: string }> = [];
    for (const title of titles.slice(0, MAX_PAGES)) {
        try {
            const page = await pageExtract(title);
            if (page) pages.push(page);
        } catch {
            // One broken page must not kill the lookup.
        }
    }
    if (pages.length === 0) return null;

    // 3) sentence candidates + one batched Jev call.
    const candidates = pickCandidates(claim, pages);
    if (process.env["PIPELINE_DEBUG"] === "1") {
        console.log(`[wikipedia-rel] ${claim.id} queries=${JSON.stringify(queries)}`);
        console.log(`[wikipedia-rel] pages=${JSON.stringify(pages.map((page) => page.title))}`);
        console.log(`[wikipedia-rel] candidates=${candidates.length}`);
    }
    if (candidates.length === 0) return null;

    const bindings = await classifyBindings(claim, candidates);

    // Prefer the most confident decisive binding. On a tie, `refutes` wins
    // because the false-claim class is what the current system fails on.
    let best: { index: number; relation: "supports" | "refutes"; confidence: number } | null = null;
    for (let index = 0; index < candidates.length; index++) {
        const binding = bindings[index];
        if (!binding || !binding.relation) continue;
        if (!best) {
            best = { index, relation: binding.relation, confidence: binding.confidence };
            continue;
        }
        const stronger =
            binding.confidence > best.confidence ||
            (binding.confidence === best.confidence && binding.relation === "refutes" && best.relation === "supports");
        if (stronger) {
            best = { index, relation: binding.relation, confidence: binding.confidence };
        }
    }

    if (!best) {
        const first = candidates[0]!;
        return { relation: null, sentence: first.sentence, url: first.url };
    }

    const chosen = candidates[best.index]!;
    return { relation: best.relation, sentence: chosen.sentence, url: chosen.url };
}
