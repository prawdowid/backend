/**
 * Free news discovery through Bing News RSS.
 *
 * RSS is only an index of candidates. A result becomes evidence only after the
 * article is fetched, quoted and gated by Jev in `researchOne`.
 */
import { fetchWithProxy } from "../modules/proxy";
import type { ClaimInput } from "../pipeline/types";

export type NewsCandidate = {
    title: string;
    url: string;
    publisher: string;
    publishedAt: string | null;
};

type CacheEntry = { at: number; items: NewsCandidate[] };

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<NewsCandidate[]>>();

function tokens(value: string): Set<string> {
    return new Set(
        value
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter((token) => token.length >= 4)
            .map((token) => (token.length > 5 ? token.slice(0, 5) : token)),
    );
}

function decodeXml(value: string): string {
    return value
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseRss(xml: string, queryTokens: Set<string>): NewsCandidate[] {
    const items: NewsCandidate[] = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

    for (const block of blocks.slice(0, 20)) {
        const title = decodeXml(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? "");
        const rawLink = decodeXml(/<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] ?? "");
        const pubDate = decodeXml(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1] ?? "");
        if (!title || !rawLink) continue;

        // Bing wraps the publisher URL in an apiclick redirect. Unwrap it so the
        // fetcher gets the article directly (Google News redirects return 503).
        let url = rawLink;
        try {
            const parsed = new URL(rawLink);
            const target = parsed.searchParams.get("url");
            if (target && /^https?:\/\//i.test(target)) url = target;
        } catch {
            // Keep the raw link.
        }

        let publisher = "";
        try {
            publisher = new URL(url).hostname.replace(/^www\./i, "");
        } catch {
            publisher = "Bing News";
        }

        // Drop items that share almost nothing with the claim's entities.
        const titleTokens = tokens(title);
        let hits = 0;
        for (const token of queryTokens) if (titleTokens.has(token)) hits++;
        if (queryTokens.size > 0 && hits / queryTokens.size < 0.2) continue;

        const date = pubDate ? new Date(pubDate) : null;
        items.push({
            title,
            url,
            publisher,
            publishedAt:
                date && !Number.isNaN(date.getTime())
                    ? date.toISOString().slice(0, 10)
                    : null,
        });
    }

    // Newest first, then de-duplicate by title prefix.
    items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = item.title.toLowerCase().slice(0, 80);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function searchBingNews(query: string, limit: number): Promise<NewsCandidate[]> {
    const url =
        "https://www.bing.com/news/search?q=" +
        encodeURIComponent(query) +
        "&format=RSS&mkt=pl-PL&setlang=pl";

    const response = await fetchWithProxy(url, {
        headers: {
            "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            accept: "application/rss+xml,application/xml,text/xml",
        },
        signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return [];

    const xml = await response.text();
    return parseRss(xml, tokens(query)).slice(0, limit);
}

/**
 * Candidate articles that mention the claim's subject and object.
 * Query text is intentionally short: Bing News matches entities, not whole
 * sentences, and a long query returns nothing.
 */
export async function discoverNews(
    claim: ClaimInput,
    limit = 6,
): Promise<NewsCandidate[]> {
    const fact = claim.fact;
    const subject = (fact?.s ?? "").trim();
    const object = String(fact?.o ?? "").trim();
    if (!subject && !object) return [];

    const queries = [
        [subject, object].filter(Boolean).join(" "),
        claim.quote ? claim.quote.slice(0, 120) : "",
    ]
        .map((query) => query.replace(/[—–]/g, " ").replace(/\s+/g, " ").trim())
        .filter((query, index, all) => query.length >= 3 && all.indexOf(query) === index)
        .slice(0, 2);

    const results: NewsCandidate[] = [];
    const settled = await Promise.allSettled(
        queries.map(async (query) => {
            const key = query.toLowerCase();
            const cached = cache.get(key);
            if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;

            let promise = inflight.get(key);
            if (!promise) {
                promise = searchBingNews(query, limit)
                    .then((items) => {
                        cache.set(key, { at: Date.now(), items });
                        return items;
                    })
                    .catch(() => [])
                    .finally(() => inflight.delete(key));
                inflight.set(key, promise);
            }
            return await promise;
        }),
    );
    for (const result of settled) {
        if (result.status === "fulfilled") results.push(...result.value);
    }

    const seen = new Set<string>();
    return results
        .filter((item) => {
            const key = item.title.toLowerCase().slice(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
}
