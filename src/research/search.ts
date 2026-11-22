/**
 * Web search adapter (Brave / Tavily) used ONLY to discover candidate pages.
 * A hit never becomes a verdict: the page is fetched, a sentence must name the
 * claim, and Jev decides supports/refutes.
 */
export type SourceTier = "A" | "B" | "C" | "D";

export type WebResult = {
    title: string;
    url: string;
    snippet: string;
    tier: SourceTier;
};

const TIER_A = [
    "gov.pl",
    "pkw.gov.pl",
    "stat.gov.pl",
    "nbp.pl",
    "sejm.gov.pl",
    "senat.gov.pl",
    "isap.sejm.gov.pl",
    "dziennikustaw.gov.pl",
    "monitorpolski.gov.pl",
    "europa.eu",
    "europarl.europa.eu",
    "ec.europa.eu",
    "eur-lex.europa.eu",
    "nik.gov.pl",
    "rpo.gov.pl",
    "trybunal.gov.pl",
    "sn.pl",
    "uzp.gov.pl",
    "nfz.gov.pl",
    "zus.pl",
    "pip.gov.pl",
    "uokik.gov.pl",
    "krrit.gov.pl",
    "ipn.gov.pl",
    "bbn.gov.pl",
    "podatki.gov.pl",
    "who.int",
];

const TIER_B = [
    "demagog.org.pl",
    "factcheck.afp.com",
    "afp.com",
    "euvsdisinfo.eu",
    "edmo.eu",
    "nask.pl",
    "fullfact.org",
    "snopes.com",
    "politifact.com",
    "konkret24.tvn24.pl",
];

const TIER_C = [
    "pap.pl",
    "tvn24.pl",
    "rmf24.pl",
    "gazeta.pl",
    "onet.pl",
    "wp.pl",
    "o2.pl",
    "interia.pl",
    "polsatnews.pl",
    "tvp.info",
    "wyborcza.pl",
    "rp.pl",
];

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return "";
    }
}

export function tierOf(url: string): SourceTier {
    const host = hostOf(url);
    if (!host) return "D";
    if (TIER_A.some((domain) => host === domain || host.endsWith(`.${domain}`))) return "A";
    if (TIER_B.some((domain) => host === domain || host.endsWith(`.${domain}`))) return "B";
    if (TIER_C.some((domain) => host === domain || host.endsWith(`.${domain}`))) return "C";
    return "D";
}

async function brave(query: string, limit: number): Promise<WebResult[]> {
    const key = process.env["BRAVE_SEARCH_API_KEY"];
    if (!key) return [];

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(10, limit)));
    url.searchParams.set("country", "pl");
    url.searchParams.set("search_lang", "pl");

    const response = await fetch(url, {
        headers: {
            accept: "application/json",
            "x-subscription-token": key,
        },
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Brave ${response.status}`);

    const body = (await response.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    return (body.web?.results ?? [])
        .filter((item) => typeof item.url === "string" && item.url.startsWith("http"))
        .map((item) => ({
            title: (item.title ?? "").slice(0, 300),
            url: item.url!,
            snippet: (item.description ?? "").slice(0, 500),
            tier: tierOf(item.url!),
        }));
}

async function tavily(query: string, limit: number): Promise<WebResult[]> {
    const key = process.env["TAVILY_API_KEY"];
    if (!key) return [];

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
            query,
            max_results: Math.min(10, limit),
            search_depth: "basic",
            include_answer: false,
            include_raw_content: false,
        }),
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Tavily ${response.status}`);

    const body = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (body.results ?? [])
        .filter((item) => typeof item.url === "string" && item.url.startsWith("http"))
        .map((item) => ({
            title: (item.title ?? "").slice(0, 300),
            url: item.url!,
            snippet: (item.content ?? "").slice(0, 500),
            tier: tierOf(item.url!),
        }));
}

/** Returns [] when no provider key is configured. Never throws for the caller. */
export async function searchWeb(query: string, limit = 5): Promise<WebResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];

    try {
        if (process.env["BRAVE_SEARCH_API_KEY"]) return await brave(trimmed, limit);
        if (process.env["TAVILY_API_KEY"]) return await tavily(trimmed, limit);
    } catch (error) {
        console.warn(`[search] provider error: ${(error as Error).message}`);
    }

    return [];
}
