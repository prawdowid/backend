import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_DOCS } from "../src/sources/manifest";
import type { SourceDoc } from "../src/pipeline/types";

/**
 * Audyt korpusu: sprawdza, czy każdy adres z manifestu odpowiada.
 * Nie przerywa pracy przy pojedynczym błędzie - zapisuje wynik i leci dalej.
 */

type AuditRecord = {
    id: string;
    url: string;
    status: number | null;
    ok: boolean;
};

const TIMEOUT_MS = 10_000;
const USER_AGENT = "PrawdowidBot/1.0";
const CONCURRENCY = 6;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "..", "data", "sources", "audit.json");

async function checkUrl(doc: SourceDoc): Promise<AuditRecord> {
    try {
        const response = await fetch(doc.url, {
            method: "GET",
            redirect: "follow",
            headers: {
                "user-agent": USER_AGENT,
                accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5",
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        // Nie pobieramy treści - wystarczy status.
        if (response.body) await response.body.cancel().catch(() => undefined);

        const ok = response.status >= 200 && response.status < 400;
        if (!ok) {
            console.log(`  BŁĄD ${response.status} ${doc.id} ${doc.url}`);
        }

        return { id: doc.id, url: doc.url, status: response.status, ok };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`  BŁĄD ${reason} ${doc.id} ${doc.url}`);
        return { id: doc.id, url: doc.url, status: null, ok: false };
    }
}

async function runPool(items: readonly SourceDoc[], limit: number): Promise<AuditRecord[]> {
    const results: AuditRecord[] = [];
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            const doc = items[index];
            if (!doc) return;
            const record = await checkUrl(doc);
            results.push(record);
            console.log(`[${results.length}/${items.length}] ${record.ok ? "OK" : "BŁĄD"} ${doc.id}`);
        }
    });

    await Promise.all(runners);

    return results;
}

const duplicateUrls = SOURCE_DOCS.length - new Set(SOURCE_DOCS.map((doc) => doc.url)).size;
if (duplicateUrls > 0) {
    console.log(`UWAGA: w manifeście jest ${duplicateUrls} zduplikowanych adresów URL.`);
}

console.log(`Sprawdzam ${SOURCE_DOCS.length} adresów (limit ${CONCURRENCY} równolegle)...`);

const records = await runPool(SOURCE_DOCS, CONCURRENCY);
const ok = records.filter((record) => record.ok).length;
const failed = records.length - ok;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(
    outPath,
    JSON.stringify(
        {
            checkedAt: new Date().toISOString(),
            total: SOURCE_DOCS.length,
            ok,
            failed,
            records: records.sort((a, b) => a.id.localeCompare(b.id)),
        },
        null,
        2,
    ) + "\n",
    "utf8",
);

console.log("");
console.log(`Gotowe: ${ok}/${SOURCE_DOCS.length} OK, ${failed} błędów.`);
console.log(`Raport: ${outPath}`);
