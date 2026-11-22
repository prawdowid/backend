/**
 * Wikidata as a deterministic fact source.
 *
 * The research layer needs a source that can *refute* a claim, not only find
 * text that mentions it. Wikidata gives exactly one structured value per
 * property, so a mismatch is a real signal:
 *
 *   claim (s, p, o)  ->  entity QID + property Pxxx  ->  value on Wikidata
 *
 * Design rules, same spirit as the rest of the research layer:
 *   - A predicate is mapped only when the mapping is unambiguous. Unknown
 *     predicates return `null`, never a guess.
 *   - If several entities match the subject/object, the one that actually has
 *     the mapped property wins. If two still match, we return `null`.
 *   - Refutation by absence is allowed only for closed, well-modeled sets
 *     (capital, currency, membership). Historical statements are handled with
 *     the P580/P582 qualifiers instead of being ignored.
 *
 * No new dependencies: plain `fetch` against the public Wikidata API.
 */

import type { ClaimInput, Evidence } from "../pipeline/types";

const API_ENDPOINT = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "PrawdowidBot/1.0 (fact-checking prototype; contact: local)";
const REQUEST_TIMEOUT_MS = 8000;
/** Wikidata asks for serial requests; one claim needs 2-4 of them. */
const MIN_REQUEST_GAP_MS = 900;
const SEARCH_LIMIT = 5;
const MAX_CANDIDATES = 5;
const MAX_BATCH_IDS = 20;
const DEBUG = process.env["WIKIDATA_DEBUG"] === "1";

function debug(message: string, details?: unknown): void {
    if (!DEBUG) return;
    if (details === undefined) console.log(`[wikidata] ${message}`);
    else console.log(`[wikidata] ${message}`, details);
}

export type WikidataLookupResult = {
    relation: "supports" | "refutes" | null;
    value: string;
    url: string;
    confidence: number;
};

// ---------------------------------------------------------------------------
// predicate -> property mapping
// ---------------------------------------------------------------------------

type ValueKind = "entity" | "number" | "date";

type PredicateSpec = {
    property: string;
    kind: ValueKind;
    /**
     * Keep only statements that hold now (no P582 end date). Used for
     * single-valued current facts: capital, currency.
     */
    currentOnly?: boolean;
    /** A missing expected value is a refutation, not missing data. */
    refuteOnAbsence?: boolean;
    /** Relative tolerance for numeric comparison; 0 = exact. */
    tolerance?: number;
    /** The object must be an instance of one of these classes. */
    valueClasses?: string[];
    /** Human-readable property name for the evidence excerpt. */
    label: string;
};

const P = {
    capital: "P36",
    headOfState: "P35",
    headOfGovernment: "P6",
    officialLanguage: "P37",
    currency: "P38",
    memberOf: "P463",
    inception: "P571",
    pointInTime: "P585",
    successfulCandidate: "P991",
    numberOfSeats: "P1342",
    length: "P2043",
    area: "P2046",
} as const;

const SPECS = {
    capital: {
        property: P.capital,
        kind: "entity",
        currentOnly: true,
        refuteOnAbsence: true,
        label: "stolica",
    },
    memberOf: {
        property: P.memberOf,
        kind: "entity",
        refuteOnAbsence: true,
        label: "członkostwo",
    },
    currency: {
        property: P.currency,
        kind: "entity",
        currentOnly: true,
        refuteOnAbsence: true,
        // Q8142 = currency; filters out "euro" the currency symbol.
        valueClasses: ["Q8142"],
        label: "waluta",
    },
    seats: {
        property: P.numberOfSeats,
        kind: "number",
        tolerance: 0,
        label: "liczba miejsc",
    },
    length: {
        property: P.length,
        kind: "number",
        tolerance: 0.02,
        label: "długość",
    },
    area: {
        property: P.area,
        kind: "number",
        tolerance: 0.02,
        label: "powierzchnia",
    },
    winner: {
        property: P.successfulCandidate,
        kind: "entity",
        refuteOnAbsence: true,
        label: "zwycięzca",
    },
    headOfState: {
        property: P.headOfState,
        kind: "entity",
        // Historical office-holders are a list without reliable qualifiers.
        refuteOnAbsence: false,
        label: "głowa państwa",
    },
    headOfGovernment: {
        property: P.headOfGovernment,
        kind: "entity",
        refuteOnAbsence: false,
        label: "szef rządu",
    },
    language: {
        property: P.officialLanguage,
        kind: "entity",
        refuteOnAbsence: true,
        label: "język urzędowy",
    },
    inception: {
        property: P.inception,
        kind: "date",
        label: "data powstania",
    },
    eventDate: {
        property: P.pointInTime,
        kind: "date",
        label: "data wydarzenia",
    },
} satisfies Record<string, PredicateSpec>;

type PredicateRule = { pattern: RegExp; spec: PredicateSpec };

/** English snake_case from the extraction prompt, plus Polish/English stems. */
const PREDICATE_RULES: PredicateRule[] = [
    { pattern: /\b(capital|capital city|stolica|stolic)\b/, spec: SPECS.capital },
    {
        pattern: /\b(member|membership|member of|czlonk\w*|członk\w*|nalezy|należy|przynalezy|przynależy)\b/,
        spec: SPECS.memberOf,
    },
    {
        pattern: /\b(join|joined|joins|accession|accede|przystap\w*|przystąp\w*|wstap\w*|wstąp\w*)\b/,
        spec: SPECS.memberOf,
    },
    { pattern: /\b(currency|waluta|walute|walutę|waluty)\b/, spec: SPECS.currency },
    { pattern: /\b(seat|seats|number of seats|liczba miejsc|posel|poseł|poslow|posłów)\b/, spec: SPECS.seats },
    { pattern: /\b(length|dlugosc|długość|kilometr\w*|km)\b/, spec: SPECS.length },
    { pattern: /\b(area|powierzchnia|obszar)\b/, spec: SPECS.area },
    {
        pattern: /\b(won|win|winner|wygra\w*|wygrywa\w*|zwyciezc\w*|zwycięzc\w*|zwyciezyl\w*|zwyciężył\w*)\b/,
        spec: SPECS.winner,
    },
    { pattern: /\b(head of state|prezydent|president)\b/, spec: SPECS.headOfState },
    {
        pattern: /\b(head of government|premier|prime minister|prezes rady ministrow|prezes rady ministrów)\b/,
        spec: SPECS.headOfGovernment,
    },
    {
        pattern: /\b(official language|jezyk urzedowy|język urzędowy|jezyki urzedowe|języki urzędowe)\b/,
        spec: SPECS.language,
    },
    { pattern: /\b(inception|founded|foundation|zalozon\w*|założon\w*|powstal\w*|powstał\w*)\b/, spec: SPECS.inception },
    { pattern: /\b(date|data|when|kiedy|occurred|odbyly sie|odbyły się)\b/, spec: SPECS.eventDate },
];

/**
 * Generic predicates carry no relation, only a shape. Resolve them from the
 * claim wording, and only when exactly one hint matches.
 */
const TEXT_HINTS: PredicateRule[] = [
    { pattern: /stolic|capital/iu, spec: SPECS.capital },
    { pattern: /cz[łl]onk|nale[żz]y|przyst[ąa]p|wst[ąa]p|member|join/iu, spec: SPECS.memberOf },
    { pattern: /walut|euro|z[łl]ot|currency/iu, spec: SPECS.currency },
    { pattern: /pos[łl]|mandat|sejm|seat/iu, spec: SPECS.seats },
    { pattern: /d[łl]ug|kilometr|\bkm\b|length/iu, spec: SPECS.length },
    { pattern: /powierzchni|obszar|\barea\b/iu, spec: SPECS.area },
    { pattern: /wygra|wygryw|zwyci[ęe]ż|won|winner/iu, spec: SPECS.winner },
    { pattern: /prezydent|head of state/iu, spec: SPECS.headOfState },
    { pattern: /premier|prime minister/iu, spec: SPECS.headOfGovernment },
];

const GENERIC_PREDICATE =
    /^(count|number|liczba|amount|value|has|have|is|jest|byc|być|posiada|posiadac|posiadać)$/;

function detectSpec(claim: ClaimInput): PredicateSpec | null {
    const fact = claim.fact;
    if (!fact) return null;

    const predicate = String(fact.p ?? "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    for (const rule of PREDICATE_RULES) {
        if (rule.pattern.test(predicate)) return rule.spec;
    }

    // Generic "count"/"has": the wording decides, and only a single hint may.
    const text = `${claim.text ?? ""} ${fact.o ?? ""}`.slice(0, 600);
    if (GENERIC_PREDICATE.test(predicate) || predicate.length === 0) {
        const matched = TEXT_HINTS.filter((hint) => hint.pattern.test(text));
        const unique = new Set(matched.map((hint) => hint.spec.property));
        if (unique.size === 1 && matched[0]) return matched[0].spec;
    }

    // Last resort: wording-only mapping, still requiring one property.
    const hinted = TEXT_HINTS.filter((hint) => hint.pattern.test(text));
    const hintedProperties = new Set(hinted.map((hint) => hint.spec.property));
    if (hintedProperties.size === 1 && hinted[0]) return hinted[0].spec;

    return null;
}

// ---------------------------------------------------------------------------
// API plumbing
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

/** Serialize calls; a burst of claims must not trip the API rate limit. */
function waitTurn(): Promise<void> {
    const next = requestQueue.then(async () => {
        const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
    });
    requestQueue = next.catch(() => undefined);
    return next;
}

type RawSnak = {
    snaktype?: string;
    datavalue?: { type?: string; value?: unknown };
};

type RawStatement = {
    mainsnak?: RawSnak;
    rank?: string;
    qualifiers?: Record<string, RawSnak[]>;
};

type RawEntity = {
    id?: string;
    labels?: Record<string, { value?: string }>;
    aliases?: Record<string, Array<{ value?: string }>>;
    claims?: Record<string, RawStatement[]>;
};

type RawGetEntities = { entities?: Record<string, RawEntity> };
type RawSearchEntities = {
    search?: Array<{
        id?: string;
        label?: string;
        description?: string;
        aliases?: string[];
    }>;
};

async function api<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(API_ENDPOINT);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    for (let attempt = 0; attempt < 4; attempt++) {
        await waitTurn();
        let response: Response;
        try {
            response = await fetch(url, {
                headers: {
                    "User-Agent": USER_AGENT,
                    "Api-User-Agent": USER_AGENT,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            if (attempt === 3) throw error;
            await sleep(1500 * (attempt + 1));
            continue;
        }

        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const wait = Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : 2500 * (attempt + 1);
            debug(`HTTP ${response.status}, retry in ${wait} ms`);
            await sleep(wait);
            continue;
        }
        if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);

        return (await response.json()) as T;
    }

    throw new Error("Wikidata request failed");
}

// ---------------------------------------------------------------------------
// entity search & disambiguation
// ---------------------------------------------------------------------------

export type WikidataSearchHit = {
    id: string;
    label: string;
    description: string;
    aliases: string[];
};

const searchCache = new Map<string, WikidataSearchHit[]>();

function fold(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(value: string): Set<string> {
    return new Set(fold(value).split(" ").filter(Boolean));
}

/**
 * Does the search hit actually name the query? Exact label/alias, or a whole
 * token subset ("wybory prezydenckie w Polsce w 2020 roku" vs the same label
 * with a date suffix). Substring matching is deliberately avoided: "euro"
 * must not match "Europa".
 */
function plausible(hit: WikidataSearchHit, query: string): boolean {
    const queryTokens = tokens(query);
    if (queryTokens.size === 0) return false;

    const labelTokens = tokens(hit.label);
    const aliasExact = hit.aliases.some((alias) => fold(alias) === fold(query));
    if (aliasExact) return true;

    const queryInsideLabel = [...queryTokens].every((token) => labelTokens.has(token));
    if (queryInsideLabel) return true;

    const labelInsideQuery = [...labelTokens].every((token) => queryTokens.has(token));
    if (labelInsideQuery) return true;

    return false;
}

const DISAMBIGUATION_RE = /(disambiguation|strona ujednoznaczniaj|artykuł w wikinews|article in wikinews|wikinews)/iu;

async function searchEntities(query: string): Promise<WikidataSearchHit[]> {
    const clean = query.trim();
    if (clean.length < 2) return [];

    const cacheKey = fold(clean);
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const languages = ["pl", "en"];
    for (const language of languages) {
        try {
            const data = await api<RawSearchEntities>({
                action: "wbsearchentities",
                search: clean,
                language,
                uselang: language,
                limit: String(SEARCH_LIMIT),
                type: "item",
            });

            const hits: WikidataSearchHit[] = [];
            for (const item of data.search ?? []) {
                const id = typeof item.id === "string" ? item.id : "";
                const label = typeof item.label === "string" ? item.label.trim() : "";
                if (!id || !label) continue;
                const description = typeof item.description === "string" ? item.description : "";
                // Disambiguation pages and news articles are never facts.
                if (DISAMBIGUATION_RE.test(description)) continue;
                hits.push({
                    id,
                    label,
                    description,
                    aliases: Array.isArray(item.aliases)
                        ? item.aliases.filter((alias): alias is string => typeof alias === "string")
                        : [],
                });
            }

            if (hits.length > 0) {
                searchCache.set(cacheKey, hits);
                debug(`search "${clean}" (${language})`, hits.map((hit) => `${hit.id}:${hit.label}`));
                return hits;
            }
        } catch (error) {
            // Try the other language, then give up on this query.
            debug(`search "${clean}" (${language}) failed`, error instanceof Error ? error.message : error);
        }
    }

    searchCache.set(cacheKey, []);
    return [];
}

// ---------------------------------------------------------------------------
// entity payload parsing
// ---------------------------------------------------------------------------

type StatementValue =
    | { type: "entity"; id: string }
    | { type: "quantity"; amount: number; unit: string | null }
    | { type: "time"; time: string }
    | { type: "text"; text: string };

type Statement = {
    value: StatementValue;
    rank: string;
    from?: string;
    to?: string;
    at?: string;
};

type EntityBundle = {
    id: string;
    label: string;
    aliases: string[];
    claims: Record<string, Statement[]>;
};

const entityCache = new Map<string, EntityBundle>();

function normalizeTime(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    const match = raw.match(/^[+-]?(\d{4,})-(\d{2})-(\d{2})/);
    if (!match) return undefined;
    const year = match[1] ?? "0000";
    const month = match[2] ?? "00";
    const day = match[3] ?? "00";
    return `${year}-${month}-${day}`;
}

function parseSnakValue(snak: RawSnak | undefined): StatementValue | null {
    const datavalue = snak?.datavalue;
    if (!datavalue || snak?.snaktype !== "value") return null;

    if (datavalue.type === "wikibase-entityid") {
        const value = datavalue.value as { id?: unknown };
        return typeof value?.id === "string" ? { type: "entity", id: value.id } : null;
    }

    if (datavalue.type === "quantity") {
        const value = datavalue.value as { amount?: unknown; unit?: unknown };
        const amount =
            typeof value?.amount === "string"
                ? Number.parseFloat(value.amount)
                : typeof value?.amount === "number"
                  ? value.amount
                  : Number.NaN;
        if (!Number.isFinite(amount)) return null;
        const unitRaw = typeof value?.unit === "string" ? value.unit : "";
        const unit = /Q\d+$/.exec(unitRaw)?.[0] ?? null;
        return { type: "quantity", amount, unit };
    }

    if (datavalue.type === "time") {
        const value = datavalue.value as { time?: unknown };
        const time = normalizeTime(value?.time);
        return time ? { type: "time", time } : null;
    }

    if (datavalue.type === "string") {
        return typeof datavalue.value === "string" ? { type: "text", text: datavalue.value } : null;
    }

    return null;
}

function qualifierTime(statement: RawStatement, property: string): string | undefined {
    const snak = statement.qualifiers?.[property]?.[0];
    const value = snak?.datavalue?.value as { time?: unknown } | undefined;
    return normalizeTime(value?.time);
}

function parseEntity(raw: RawEntity): EntityBundle | null {
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) return null;

    const label =
        raw.labels?.["pl"]?.value?.trim() ||
        raw.labels?.["en"]?.value?.trim() ||
        id;
    const aliases = [
        ...(raw.aliases?.["pl"] ?? []),
        ...(raw.aliases?.["en"] ?? []),
    ]
        .map((alias) => alias.value?.trim() ?? "")
        .filter((alias) => alias.length > 0);

    const claims: Record<string, Statement[]> = {};
    for (const [property, list] of Object.entries(raw.claims ?? {})) {
        const parsed: Statement[] = [];
        for (const statement of list ?? []) {
            const value = parseSnakValue(statement.mainsnak);
            if (!value) continue;
            parsed.push({
                value,
                rank: statement.rank ?? "normal",
                from: qualifierTime(statement, "P580"),
                to: qualifierTime(statement, "P582"),
                at: qualifierTime(statement, "P585"),
            });
        }
        if (parsed.length > 0) claims[property] = parsed;
    }

    return { id, label, aliases, claims };
}

async function getEntities(ids: string[]): Promise<Map<string, EntityBundle>> {
    const unique = [...new Set(ids)].filter((id) => /^Q\d+$/.test(id));
    const missing = unique.filter((id) => !entityCache.has(id));

    for (let offset = 0; offset < missing.length; offset += MAX_BATCH_IDS) {
        const chunk = missing.slice(offset, offset + MAX_BATCH_IDS);
        if (chunk.length === 0) continue;

        const data = await api<RawGetEntities>({
            action: "wbgetentities",
            ids: chunk.join("|"),
            props: "claims|labels|aliases",
            languages: "pl|en",
        });

        for (const id of chunk) {
            const raw = data.entities?.[id];
            const bundle = raw ? parseEntity(raw) : null;
            // Cache misses too: a broken id must not be retried per claim.
            entityCache.set(id, bundle ?? { id, label: id, aliases: [], claims: {} });
        }
    }

    const result = new Map<string, EntityBundle>();
    for (const id of unique) {
        const bundle = entityCache.get(id);
        if (bundle) result.set(id, bundle);
    }
    return result;
}

function hasProperty(bundle: EntityBundle | undefined, property: string): boolean {
    return (bundle?.claims[property]?.length ?? 0) > 0;
}

function entityValues(bundle: EntityBundle | undefined, property: string): string[] {
    const statements = bundle?.claims[property] ?? [];
    const ids: string[] = [];
    for (const statement of statements) {
        if (statement.value.type === "entity") ids.push(statement.value.id);
    }
    return ids;
}

function isInstanceOf(bundle: EntityBundle | undefined, classes: string[]): boolean {
    if (!bundle) return false;
    const p31 = bundle.claims["P31"] ?? [];
    return p31.some(
        (statement) => statement.value.type === "entity" && classes.includes(statement.value.id),
    );
}

// ---------------------------------------------------------------------------
// date & number comparison
// ---------------------------------------------------------------------------

type ClaimDate = { year: number; month?: number; day?: number };

const POLISH_MONTHS: Record<string, number> = {
    stycznia: 1,
    lutego: 2,
    marca: 3,
    kwietnia: 4,
    maja: 5,
    czerwca: 6,
    lipca: 7,
    sierpnia: 8,
    wrzesnia: 9,
    września: 9,
    pazdziernika: 10,
    października: 10,
    listopada: 11,
    grudnia: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
};

function extractClaimDate(claim: ClaimInput): ClaimDate | null {
    const fact = claim.fact;
    const explicit = fact?.t?.trim() ?? "";
    const iso = explicit.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const year = Number(iso[1]);
        const month = Number(iso[2]);
        const day = Number(iso[3]);
        if (Number.isFinite(year) && year > 0) {
            return {
                year,
                ...(month > 0 ? { month } : {}),
                ...(day > 0 ? { day } : {}),
            };
        }
    }

    const text = claim.text ?? "";
    const dayMonthYear = text.match(
        /\b(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[śs]nia|pa[źz]dziernika|listopada|grudnia)\s+(\d{4})\b/iu,
    );
    if (dayMonthYear) {
        const day = Number(dayMonthYear[1]);
        const month = POLISH_MONTHS[(dayMonthYear[2] ?? "").toLowerCase()];
        const year = Number(dayMonthYear[3]);
        if (month && Number.isFinite(year)) return { year, month, day };
    }

    const englishDate = text.match(
        /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/iu,
    );
    if (englishDate) {
        const day = Number(englishDate[1]);
        const month = ENGLISH_MONTHS[(englishDate[2] ?? "").toLowerCase()];
        const year = Number(englishDate[3]);
        if (month && Number.isFinite(year)) return { year, month, day };
    }

    const yearMatch = text.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    if (yearMatch) {
        const year = Number(yearMatch[1]);
        if (Number.isFinite(year)) return { year };
    }

    return null;
}

function parseIsoParts(value: string): { year: number; month: number; day: number } | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
    };
}

/** Compare at the precision the claim actually states. */
function datesMatch(claimDate: ClaimDate, sourceDate: string): boolean {
    const source = parseIsoParts(sourceDate);
    if (!source) return false;
    if (source.year !== claimDate.year) return false;

    if (claimDate.month !== undefined && source.month > 0) {
        if (source.month !== claimDate.month) return false;
        if (claimDate.day !== undefined && source.day > 0 && source.day !== claimDate.day) return false;
    }
    return true;
}

function expectedNumber(object: string | number): number | null {
    if (typeof object === "number") {
        return Number.isFinite(object) ? object : null;
    }
    const match = String(object)
        .replace(/\u00a0/g, " ")
        .match(/-?\d+(?:[.,]\d+)?/);
    if (!match) return null;
    const parsed = Number.parseFloat(match[0].replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}

/** Source amount normalized to the unit used by the claim (km, km², ...). */
const UNIT_FACTORS: Record<string, { label: string; factor: number }> = {
    Q828224: { label: "km", factor: 1 },
    Q11573: { label: "m", factor: 0.001 },
    Q174728: { label: "cm", factor: 0.00001 },
    Q25343: { label: "m²", factor: 1 },
    Q712226: { label: "km²", factor: 1 },
    Q218593: { label: "mile", factor: 1.609344 },
    Q8096: { label: "mila morska", factor: 1.852 },
};

// ---------------------------------------------------------------------------
// value formatting
// ---------------------------------------------------------------------------

function formatIsoDate(value: string): string {
    const parts = parseIsoParts(value);
    if (!parts) return value;
    if (parts.month === 0) return String(parts.year);
    if (parts.day === 0) return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

async function labelFor(id: string): Promise<string> {
    const bundles = await getEntities([id]);
    const bundle = bundles.get(id);
    const label = bundle?.label && bundle.label !== id ? bundle.label : "";
    return label ? `${label} (${id})` : id;
}

function round(value: number): number {
    return Number(Math.min(0.99, Math.max(0, value)).toFixed(2));
}

// ---------------------------------------------------------------------------
// core lookup
// ---------------------------------------------------------------------------

type Orientation = {
    base: EntityBundle;
    expected: WikidataSearchHit[];
    direction: "forward" | "reverse";
};

/**
 * Pick the side that actually carries the property. When several candidates
 * carry it, the one whose values intersect the other side wins; anything still
 * ambiguous returns `null`.
 */
function chooseBase(
    carriers: WikidataSearchHit[],
    otherSide: WikidataSearchHit[],
    bundles: Map<string, EntityBundle>,
    property: string,
    query: string,
): EntityBundle | null {
    const usable = carriers.filter((hit) => hasProperty(bundles.get(hit.id), property));
    if (usable.length === 0) return null;
    if (usable.length === 1) return bundles.get(usable[0]!.id) ?? null;

    // An exact label beats an alias: "Polska" is the country, not the
    // "Korona Królestwa Polskiego" (which has the alias "Polska").
    const exact = usable.filter((hit) => fold(hit.label) === fold(query));
    if (exact.length === 1) return bundles.get(exact[0]!.id) ?? null;

    const otherIds = new Set(otherSide.map((hit) => hit.id));
    const intersecting = usable.filter((hit) => {
        const bundle = bundles.get(hit.id);
        return entityValues(bundle, property).some((value) => otherIds.has(value));
    });
    if (intersecting.length === 1) return bundles.get(intersecting[0]!.id) ?? null;

    return null;
}

function useCurrentStatements(statements: Statement[], claimDate: ClaimDate | null): Statement[] {
    const withoutEnd = statements.filter((statement) => !statement.to);
    const candidates = withoutEnd.length > 0 ? withoutEnd : statements;
    const preferred = candidates.filter((statement) => statement.rank === "preferred");
    const chosen = preferred.length > 0 ? preferred : candidates;

    // A historical claim ("w 1700 stolicą był Kraków") must not be judged
    // against today's value.
    if (claimDate && claimDate.year < 1900) return [];
    return chosen;
}

function statementActiveAt(statement: Statement, claimDate: ClaimDate | null): boolean {
    if (!claimDate) return !statement.to;

    if (statement.from && statement.to) {
        const from = parseIsoParts(statement.from);
        const to = parseIsoParts(statement.to);
        if (!from || !to) return true;
        if (claimDate.year < from.year || claimDate.year > to.year) return false;
        if (claimDate.year === from.year && claimDate.month !== undefined && from.month > 0) {
            if (claimDate.month < from.month) return false;
        }
        if (claimDate.year === to.year && claimDate.month !== undefined && to.month > 0) {
            if (claimDate.month > to.month) return false;
        }
        return true;
    }
    if (statement.from) {
        const from = parseIsoParts(statement.from);
        if (!from) return true;
        return claimDate.year >= from.year;
    }
    if (statement.to) {
        const to = parseIsoParts(statement.to);
        if (!to) return true;
        return claimDate.year <= to.year;
    }
    return true;
}

function dateQualifiedMatch(statements: Statement[], claimDate: ClaimDate): "match" | "mismatch" | "unknown" {
    let sawDate = false;
    for (const statement of statements) {
        if (!statement.from) continue;
        sawDate = true;
        if (datesMatch(claimDate, statement.from)) return "match";
    }
    return sawDate ? "mismatch" : "unknown";
}

/**
 * Deterministic lookup of a claim on Wikidata.
 *
 * Returns `null` when the predicate is not mapped, the entity cannot be
 * identified unambiguously, or Wikidata has no value for that property.
 */
export async function lookupWikidata(claim: ClaimInput): Promise<WikidataLookupResult | null> {
    const fact = claim.fact;
    if (!fact) return null;

    const spec = detectSpec(claim);
    if (!spec) return null;

    const subjectText = String(fact.s ?? "").trim();
    if (subjectText.length < 2) return null;

    const subjectHits = (await searchEntities(subjectText)).filter((hit) =>
        plausible(hit, subjectText),
    );
    if (subjectHits.length === 0) {
        debug(`no plausible subject for "${subjectText}"`);
        return null;
    }
    const subjectPool = subjectHits.slice(0, MAX_CANDIDATES);
    debug(`subject pool for "${subjectText}"`, subjectPool.map((hit) => hit.id));

    let objectPool: WikidataSearchHit[] = [];
    if (spec.kind === "entity") {
        const objectText = String(fact.o ?? "").trim();
        if (objectText.length < 2) return null;
        const objectHits = (await searchEntities(objectText)).filter((hit) =>
            plausible(hit, objectText),
        );
        if (objectHits.length === 0) {
            debug(`no plausible object for "${objectText}"`);
            return null;
        }
        objectPool = objectHits.slice(0, MAX_CANDIDATES);
        debug(`object pool for "${objectText}"`, objectPool.map((hit) => hit.id));
    }

    const bundles = await getEntities([
        ...subjectPool.map((hit) => hit.id),
        ...objectPool.map((hit) => hit.id),
    ]);

    // --- choose orientation -------------------------------------------------
    let orientation: Orientation | null = null;

    const subjectCarriers = subjectPool.filter((hit) =>
        hasProperty(bundles.get(hit.id), spec.property),
    );

    if (spec.kind === "entity") {
        if (subjectCarriers.length > 0) {
            const base = chooseBase(subjectCarriers, objectPool, bundles, spec.property, subjectText);
            if (!base) return null;
            orientation = { base, expected: objectPool, direction: "forward" };
        } else {
            const objectCarriers = objectPool.filter((hit) =>
                hasProperty(bundles.get(hit.id), spec.property),
            );
            const objectText = String(fact.o ?? "").trim();
            const base = chooseBase(objectCarriers, subjectPool, bundles, spec.property, objectText);
            if (!base) return null;
            orientation = { base, expected: subjectPool, direction: "reverse" };
        }
    } else {
        if (subjectCarriers.length === 0) return null;
        let picked: WikidataSearchHit | undefined;
        if (subjectCarriers.length === 1) {
            picked = subjectCarriers[0];
        } else {
            const exact = subjectCarriers.filter(
                (hit) => fold(hit.label) === fold(subjectText),
            );
            if (exact.length === 1) picked = exact[0];
        }
        if (!picked) return null;
        const base = bundles.get(picked.id);
        if (!base) return null;
        orientation = { base, expected: [], direction: "forward" };
    }

    const { base, expected } = orientation;
    const statements = base.claims[spec.property] ?? [];
    if (statements.length === 0) return null;
    debug(`base ${base.id} (${orientation.direction}), property ${spec.property}, statements ${statements.length}`);

    const claimDate = extractClaimDate(claim);
    const url = `https://www.wikidata.org/wiki/${base.id}#${spec.property}`;

    // --- numeric properties -------------------------------------------------
    if (spec.kind === "number") {
        const expectedValue = expectedNumber(fact.o);
        if (expectedValue === null) return null;

        const quantities = statements.filter(
            (statement) => statement.value.type === "quantity",
        );
        if (quantities.length === 0) return null;

        const tolerance = spec.tolerance ?? 0.02;
        let sourceText = "";
        let matched = false;

        for (const statement of quantities) {
            if (statement.value.type !== "quantity") continue;
            const unit = statement.value.unit;
            const unitInfo = unit ? UNIT_FACTORS[unit] : undefined;
            const sourceValue = statement.value.amount * (unitInfo?.factor ?? 1);
            if (!sourceText) {
                sourceText = unitInfo
                    ? `${statement.value.amount} ${unitInfo.label}`
                    : String(statement.value.amount);
            }
            const difference = Math.abs(sourceValue - expectedValue);
            const allowed = tolerance === 0 ? 1e-9 : tolerance * Math.abs(sourceValue);
            if (difference <= allowed) {
                matched = true;
                sourceText = unitInfo
                    ? `${statement.value.amount} ${unitInfo.label}`
                    : String(statement.value.amount);
                break;
            }
        }

        let relation: "supports" | "refutes" = matched ? "supports" : "refutes";
        if (fact.neg === true) relation = relation === "supports" ? "refutes" : "supports";

        return {
            relation,
            value: sourceText || String(quantities[0]?.value.type === "quantity" ? quantities[0].value.amount : ""),
            url,
            confidence: round(matched ? 0.88 : 0.84),
        };
    }

    // --- date properties ----------------------------------------------------
    if (spec.kind === "date") {
        const times = statements.filter((statement) => statement.value.type === "time");
        if (times.length === 0) return null;
        if (!claimDate) return null;

        // P571 may list several incarnations of the same state; only a single
        // value is safe to compare.
        if (times.length > 1 && spec.property === P.inception) return null;

        const matching = times.filter(
            (statement) =>
                statement.value.type === "time" && datesMatch(claimDate, statement.value.time),
        );

        let relation: "supports" | "refutes";
        if (matching.length === 1) {
            relation = "supports";
        } else if (matching.length === 0 && times.length === 1) {
            relation = "refutes";
        } else {
            return null;
        }
        if (fact.neg === true) relation = relation === "supports" ? "refutes" : "supports";

        const first = times[0];
        const value =
            first && first.value.type === "time" ? formatIsoDate(first.value.time) : "";
        return { relation, value, url, confidence: round(relation === "supports" ? 0.86 : 0.84) };
    }

    // --- entity-valued properties ------------------------------------------
    let expectedHits = expected;
    if (spec.valueClasses && spec.valueClasses.length > 0) {
        const filtered = expectedHits.filter((hit) =>
            isInstanceOf(bundles.get(hit.id), spec.valueClasses!),
        );
        // If class data is missing, keep the label-based candidates.
        if (filtered.length > 0) expectedHits = filtered;
    }
    if (expectedHits.length === 0) return null;

    const expectedIds = new Set(expectedHits.map((hit) => hit.id));

    const currentOnly = spec.currentOnly === true;
    const usable = currentOnly ? useCurrentStatements(statements, claimDate) : statements;
    if (usable.length === 0) {
        // A purely historical claim against a current-only property: no answer.
        return null;
    }

    // Which expected entities are present in the usable statements, and are
    // those statements active at the claim date?
    const presentIds = new Map<string, Statement[]>();
    for (const statement of usable) {
        if (statement.value.type !== "entity") continue;
        if (!expectedIds.has(statement.value.id)) continue;
        if (!currentOnly && !statementActiveAt(statement, claimDate)) continue;
        const list = presentIds.get(statement.value.id) ?? [];
        list.push(statement);
        presentIds.set(statement.value.id, list);
    }

    if (presentIds.size > 1) return null; // e.g. claim names a value that is one of many

    if (presentIds.size === 0) {
        if (!spec.refuteOnAbsence) return null;
        // Only refute when exactly one candidate could be the expected value.
        // Prefer an exact label match: "Kraków" must not be confused with
        // "Kraków — wiersz" or "Kraków — singel".
        let refuteCandidates = expectedHits;
        if (refuteCandidates.length > 1) {
            const reference = orientation.direction === "forward"
                ? String(fact.o ?? "")
                : String(fact.s ?? "");
            const exact = refuteCandidates.filter(
                (hit) => fold(hit.label) === fold(reference),
            );
            if (exact.length === 1) refuteCandidates = exact;
        }
        if (refuteCandidates.length !== 1) return null;
        const only = refuteCandidates[0]!;
        const sourceValue = await labelFor(only.id);
        let relation: "supports" | "refutes" = "refutes";
        if (fact.neg === true) relation = "supports";
        return { relation, value: sourceValue, url, confidence: round(0.76) };
    }

    const [matchedId, matchedStatements] = [...presentIds.entries()][0]!;
    const sourceLabel = await labelFor(matchedId);

    // Date qualifiers (membership "since ...", position "from ...").
    let dateNote = "";
    let relation: "supports" | "refutes" = "supports";

    if (claimDate) {
        const verdict = dateQualifiedMatch(matchedStatements, claimDate);
        if (verdict === "mismatch") relation = "refutes";
        const firstWithDate = matchedStatements.find((statement) => statement.from);
        if (firstWithDate?.from) dateNote = `, od ${formatIsoDate(firstWithDate.from)}`;
    } else if (!currentOnly && matchedStatements.every((statement) => statement.to)) {
        // Every matching statement has already ended: the claim in the present
        // tense is false.
        relation = "refutes";
    }

    // The election trap: "won in the first round" is not the same as "won".
    // An election with several P585 values has several rounds; a per-round
    // claim cannot be settled from P991 alone.
    if (
        spec.property === P.successfulCandidate &&
        /\b(pierwsz\w*\s+tur\w*|first\s+round)\b/iu.test(claim.text ?? "")
    ) {
        const rounds = (base.claims[P.pointInTime] ?? []).filter(
            (statement) => statement.value.type === "time",
        );
        if (rounds.length > 1) return null;
    }

    if (fact.neg === true) relation = relation === "supports" ? "refutes" : "supports";

    return {
        relation,
        value: `${sourceLabel}${dateNote}`,
        url,
        confidence: round(relation === "supports" ? (dateNote ? 0.9 : 0.86) : 0.88),
    };
}

// ---------------------------------------------------------------------------
// research-layer adapter (not wired into the core on purpose)
// ---------------------------------------------------------------------------

/** Convert a lookup into the shared `Evidence` shape for later integration. */
export async function wikidataEvidence(
    claim: ClaimInput,
    retrievedAt: string,
): Promise<Evidence | null> {
    const result = await lookupWikidata(claim);
    if (!result || !result.relation) return null;

    const spec = detectSpec(claim);
    const subject = claim.fact?.s ?? claim.id;

    return {
        title: `Wikidata: ${subject} — ${spec?.label ?? "wartość"}`,
        publisher: "Wikidata",
        publishedAt: null,
        retrievedAt,
        url: result.url,
        excerpt: `Wartość w Wikidata: ${result.value}.`,
        type: "secondary",
        relation: result.relation,
    };
}
