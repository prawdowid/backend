export type FactCheckReview = {
    matchedClaim?: string;
    publisher?: {
        name?: string;
        site?: string;
    };
    url?: string;
    title?: string;
    reviewDate?: string;
    textualRating?: string;
    languageCode?: string;
};

export type TrustedSource = {
    title: string;
    url: string;
    domain: string;
    trusted: boolean;
    excerpt?: string;
};

export type ProviderStatus = "available" | "not_configured" | "unavailable";

export type FactCheckResult = {
    claim: string;
    status: "review_found" | "sources_found" | "no_evidence_found";
    reviews: FactCheckReview[];
    sources: TrustedSource[];
    providers: {
        googleFactCheck: ProviderStatus;
        jinaSearch: ProviderStatus;
    };
    providerErrors: string[];
    checkedAt: string;
};

type ProviderCall<T> =
    | { status: "available"; value: T }
    | { status: "not_configured" }
    | { status: "unavailable"; error: string };

type GoogleFactCheckResponse = {
    claims?: Array<{
        text?: string;
        claimReview?: FactCheckReview[];
    }>;
};

type JinaSearchValue = {
    sources: TrustedSource[];
};

const TRUSTED_SOURCE_URLS = [
    "https://odyseusz.gov.pl/",
    "https://www.gov.pl/web/gov/ostrzezenia",
    "https://www.gov.pl/web/gov/ostrzezenia#/_/mazowieckie/wszystkie",
    "https://www.gov.pl/web/mswia/regionalny-system-ostrzegania",
    "https://www.gov.pl/web/rcb/raport-dobowy3",
    "https://www.gov.pl/web/kgpsp/aktualnosci",
    "https://policja.pl/pol/aktualnosci",
    "https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci",
    "https://www.gov.pl/web/obrona-narodowa/aktualnosci5",
    "https://www.gov.pl/web/gis/ostrzezenia",
    "https://www.gov.pl/web/paa/panstwowa-agencja-atomistyki",
    "https://monitoring.paa.gov.pl/",
    "https://powietrze.gios.gov.pl/pjp/",
    "https://moje.cert.pl/komunikaty/",
    "https://www.gov.pl/web/infrastruktura",
    "https://www.gov.pl/web/infrastruktura/aktualnosci",
    "https://www.gov.pl/web/infrastruktura/prawa-pasazerow",
    "https://www.gov.pl/web/infrastruktura/infolinia-dla-obywatela",
    "https://www.gov.pl/web/infrastruktura/dane-kontaktowe",
    "https://drogi.gddkia.gov.pl/informacje-drogowe",
    "https://drogi.gddkia.gov.pl/mapy/mapa-informacji-drogowej",
    "https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien",
    "https://www.gov.pl/web/gddkia/informacja-drogowa---19-111",
    "https://ulc.gov.pl/",
    "https://ulc.gov.pl/prawa-pasazera",
    "https://ulc.gov.pl/prawa-pasazera/poradnik-dla-pasazerow",
    "https://portalpasazera.pl/",
    "https://utk.gov.pl/pl/pasazerowie",
    "https://kgsok.pl/",
    "https://www.sar.gov.pl/",
    "https://www.umgdy.gov.pl/",
    "https://www.ums.gov.pl/bezpieczenstwo-morskie/warunki-zeglugi",
    "https://www.gov.pl/web/wody-polskie/komunikaty-nawigacyjne",
    "https://meteo.imgw.pl/",
    "https://hydro.imgw.pl/",
    "https://baltyk.imgw.pl/",
    "https://www.gov.pl/web/rcb/strona-glowna-rzadowego-centrum-bezpieczenstwa",
    "https://www.gov.pl/web/mswia",
    "https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych",
    "https://www.gov.pl/web/premier",
] as const;
const TRUSTED_DOMAINS = Array.from(new Set(
    TRUSTED_SOURCE_URLS.map((source) => new URL(source).hostname.toLowerCase().replace(/^www\./, "")),
));

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new Error(`Invalid API field: ${key}`);
    }
    return value;
}

function parseReview(value: unknown): FactCheckReview {
    if (!isRecord(value)) {
        throw new Error("Invalid Google Fact Check API review");
    }

    let publisher: FactCheckReview["publisher"];
    if (value.publisher !== undefined && value.publisher !== null) {
        if (!isRecord(value.publisher)) {
            throw new Error("Invalid Google Fact Check API publisher");
        }
        publisher = {
            name: optionalString(value.publisher, "name"),
            site: optionalString(value.publisher, "site"),
        };
    }

    return {
        publisher,
        url: optionalString(value, "url"),
        title: optionalString(value, "title"),
        reviewDate: optionalString(value, "reviewDate"),
        textualRating: optionalString(value, "textualRating"),
        languageCode: optionalString(value, "languageCode"),
    };
}

function parseGoogleResponse(value: unknown): GoogleFactCheckResponse {
    if (!isRecord(value)) {
        throw new Error("Invalid Google Fact Check API response");
    }
    if (value.claims === undefined || value.claims === null) {
        return {};
    }
    if (!Array.isArray(value.claims)) {
        throw new Error("Invalid Google Fact Check API claims");
    }

    return {
        claims: value.claims.map((claim) => {
            if (!isRecord(claim)) {
                throw new Error("Invalid Google Fact Check API claim");
            }
            if (claim.claimReview !== undefined && claim.claimReview !== null && !Array.isArray(claim.claimReview)) {
                throw new Error("Invalid Google Fact Check API reviews");
            }

            return {
                text: optionalString(claim, "text"),
                claimReview: Array.isArray(claim.claimReview)
                    ? claim.claimReview.map(parseReview)
                    : undefined,
            };
        }),
    };
}

function isTrustedUrl(value: string, domains: string[]): URL | undefined {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return undefined;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return undefined;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const trustedDomain = domains.find((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!trustedDomain) {
        return undefined;
    }

    return url;
}

function parseJinaSources(value: unknown, domains: string[]): TrustedSource[] {
    if (!isRecord(value) || !Array.isArray(value.data)) {
        throw new Error("Invalid Jina Search response");
    }

    const seenUrls = new Set<string>();
    const sources: TrustedSource[] = [];

    for (const item of value.data) {
        if (!isRecord(item)) {
            continue;
        }

        const rawUrl = optionalString(item, "url");
        if (!rawUrl) {
            continue;
        }
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            continue;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            continue;
        }
        const trustedUrl = isTrustedUrl(rawUrl, domains);
        const trusted = trustedUrl !== undefined;
        if ((domains.length > 0 && !trusted) || seenUrls.has(url.href)) {
            continue;
        }
        seenUrls.add(url.href);

        const title = optionalString(item, "title");
        const content = optionalString(item, "content") ?? optionalString(item, "description");
        sources.push({
            title: title?.trim() || url.hostname,
            url: url.href,
            domain: url.hostname,
            trusted,
            ...(content ? { excerpt: content.slice(0, 1_000) } : {}),
        });
    }

    return sources.slice(0, 10);
}

async function searchGoogleFactChecks(claim: string): Promise<ProviderCall<FactCheckReview[]>> {
    const apiKey = process.env["GOOGLE_FACT_CHECK_API_KEY"];
    if (!apiKey) {
        return { status: "not_configured" };
    }

    const params = new URLSearchParams({ query: claim, key: apiKey });
    let response: Response;
    try {
        response = await fetch(
            `https://factchecktools.googleapis.com/v1alpha1/claims:search?${params}`,
            { signal: AbortSignal.timeout(10_000) },
        );
    } catch {
        return { status: "unavailable", error: "Google Fact Check API could not be reached." };
    }

    if (!response.ok) {
        return {
            status: "unavailable",
            error: `Google Fact Check API request failed (HTTP ${response.status}).`,
        };
    }

    let payload: GoogleFactCheckResponse;
    try {
        payload = parseGoogleResponse(await response.json());
    } catch {
        return { status: "unavailable", error: "Google Fact Check API returned an invalid response." };
    }

    const reviews = (payload.claims ?? []).flatMap((match) =>
        (match.claimReview ?? []).map((review) => ({
            ...review,
            ...(match.text ? { matchedClaim: match.text } : {}),
        })),
    );
    return { status: "available", value: reviews };
}

async function searchJinaSources(claim: string): Promise<ProviderCall<JinaSearchValue>> {
    const apiKey = process.env["JINA_API_KEY"];
    if (!apiKey) {
        return { status: "not_configured" };
    }

    const domains = TRUSTED_DOMAINS;
    const siteQuery = domains.map((domain) => `site:${domain}`).join(" OR ");
    const query = `${claim} (${siteQuery})`;
    const url = new URL(`https://s.jina.ai/${encodeURIComponent(query)}`);
    url.searchParams.set("engine", "bing");
    url.searchParams.set("num", "5");
    url.searchParams.set("hl", "pl");
    url.searchParams.set("gl", "pl");

    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        return { status: "unavailable", error: "Jina Search could not be reached." };
    }

    if (!response.ok) {
        return {
            status: "unavailable",
            error: `Jina Search request failed (HTTP ${response.status}).`,
        };
    }

    let sources: TrustedSource[];
    try {
        sources = parseJinaSources(await response.json(), domains);
    } catch {
        return { status: "unavailable", error: "Jina Search returned an invalid response." };
    }

    return {
        status: "available",
        value: { sources },
    };
}

export class FactCheckUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FactCheckUnavailableError";
    }
}

export async function researchFact(claim: string): Promise<FactCheckResult> {
    const [google, jinaSearch] = await Promise.all([
        searchGoogleFactChecks(claim),
        searchJinaSources(claim),
    ]);

    if (google.status === "not_configured" && jinaSearch.status === "not_configured") {
        throw new FactCheckUnavailableError(
            "No research provider is configured. Set GOOGLE_FACT_CHECK_API_KEY and/or JINA_API_KEY.",
        );
    }

    if (google.status !== "available" && jinaSearch.status !== "available") {
        const errors = [google, jinaSearch]
            .flatMap((provider) => provider.status === "unavailable" ? [provider.error] : []);
        throw new FactCheckUnavailableError(errors.join(" "));
    }

    const reviews = google.status === "available" ? google.value : [];
    const sources = jinaSearch.status === "available" ? jinaSearch.value.sources : [];
    const providerErrors = [google, jinaSearch]
        .flatMap((provider) => provider.status === "unavailable" ? [provider.error] : []);
    return {
        claim,
        status: reviews.length > 0
            ? "review_found"
            : sources.length > 0
                ? "sources_found"
                : "no_evidence_found",
        reviews,
        sources,
        providers: {
            googleFactCheck: google.status,
            jinaSearch: jinaSearch.status,
        },
        providerErrors,
        checkedAt: new Date().toISOString(),
    };
}
