import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Page-level cache for URL inputs (raw reader text), separate from the claim cache.
 * News pages change, so entries expire; the demo repeat is instant, but a re-check
 * after the TTL fetches fresh content.
 */
const DIR = process.env["PAGE_CACHE_DIR"] ??
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "cache", "pages");

const TTL_MS = Number(process.env["PAGE_CACHE_TTL_MS"] ?? 6 * 60 * 60 * 1000);
const inflight = new Map<string, Promise<string>>();

type Entry = { url: string; fetchedAt: number; text: string };

function fileFor(url: string): string {
    const hash = createHash("sha256").update(url).digest("hex");
    return resolve(DIR, `${hash}.json`);
}

export async function readPageCache(url: string): Promise<string | null> {
    try {
        const raw = await readFile(fileFor(url), "utf8");
        const entry = JSON.parse(raw) as Entry;
        if (entry.url !== url || !entry.text) return null;
        if (Date.now() - entry.fetchedAt > TTL_MS) return null;
        return entry.text;
    } catch {
        return null;
    }
}

export async function writePageCache(url: string, text: string): Promise<void> {
    try {
        await mkdir(DIR, { recursive: true });
        const entry: Entry = { url, fetchedAt: Date.now(), text };
        await writeFile(fileFor(url), JSON.stringify(entry), "utf8");
    } catch {
        // Cache is an optimisation, never a failure.
    }
}

/** Deduplicate concurrent fetches of the same URL inside one process. */
export function cachedPageFetch(url: string, fetcher: () => Promise<string>): Promise<string> {
    const existing = inflight.get(url);
    if (existing) return existing;

    const promise = (async () => {
        const cached = await readPageCache(url);
        if (cached) return cached;
        const text = await fetcher();
        await writePageCache(url, text);
        return text;
    })();

    inflight.set(url, promise);
    return promise.finally(() => inflight.delete(url));
}
