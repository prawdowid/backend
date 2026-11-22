/**
 * Proxy pool for research calls (Wikipedia, Wikidata, Jina, page fetches).
 *
 * RESEARCH_PROXIES accepts a comma- or newline-separated list; requests rotate
 * round-robin and retry on 429/transport errors. RESEARCH_PROXY_URL is kept as a
 * single-proxy fallback for backwards compatibility.
 */
const RAW = process.env["RESEARCH_PROXIES"] ?? process.env["RESEARCH_PROXY_URL"] ?? "";

const PROXIES = RAW.split(/[\n,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

let cursor = 0;

export function proxyCount(): number {
    return PROXIES.length;
}

export function nextProxy(): string | undefined {
    if (PROXIES.length === 0) return undefined;
    const proxy = PROXIES[cursor % PROXIES.length];
    cursor += 1;
    return proxy;
}

type FetchInit = RequestInit & { proxy?: string };

/** fetch with proxy rotation and a small retry budget on 429 / network errors. */
export async function fetchWithProxy(url: string | URL, init: FetchInit = {}): Promise<Response> {
    if (PROXIES.length === 0) {
        return fetch(url, init as RequestInit);
    }

    const attempts = Math.min(PROXIES.length, 3);
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const proxy = nextProxy();
        try {
            const response = await fetch(url, { ...init, proxy } as RequestInit);
            if (response.status === 429) {
                lastError = new Error(`proxy 429 (${attempt + 1}/${attempts})`);
                if (attempt < attempts - 1) continue;
                break;
            }
            return response;
        } catch (error) {
            lastError = error;
        }
    }

    // Last resort: direct request without a proxy (some hosts block proxy ranges).
    try {
        return await fetch(url, init as RequestInit);
    } catch {
        throw lastError instanceof Error ? lastError : new Error("proxy request failed");
    }
}
