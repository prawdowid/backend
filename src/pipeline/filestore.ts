import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CacheStore, CachedClaim } from ".";

/**
 * JSON-file backed cache. Good enough for the demo and auditable,
 * drop-in replacement for Redis later (same 3-method interface).
 */
export class FileCacheStore implements CacheStore {
    private readonly entries = new Map<string, CachedClaim>();
    private loadPromise?: Promise<void>;

    constructor(private readonly file = process.env["CACHE_FILE"] ?? "data/cache/claims.json") {}

    private load(): Promise<void> {
        return (this.loadPromise ??= (async () => {
            try {
                const raw = await readFile(this.file, "utf8");
                const parsed = JSON.parse(raw) as CachedClaim[];
                if (Array.isArray(parsed)) {
                    for (const entry of parsed) this.entries.set(entry.key, entry);
                }
            } catch {
                // Missing file is fine: start empty.
            }
        })());
    }

    private async flush(): Promise<void> {
        await mkdir(dirname(this.file), { recursive: true });
        await writeFile(this.file, JSON.stringify([...this.entries.values()], null, 2), "utf8");
    }

    async all(): Promise<CachedClaim[]> {
        await this.load();
        return [...this.entries.values()];
    }

    async getByKey(key: string): Promise<CachedClaim | undefined> {
        await this.load();
        return this.entries.get(key);
    }

    async put(entry: CachedClaim): Promise<void> {
        await this.load();
        this.entries.set(entry.key, entry);
        await this.flush();
    }
}
