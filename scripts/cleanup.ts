/**
 * Retencja danych demo: logs/, moderation/cases.json, cache/.
 *
 * Zasada: plik starszy niż RETENTION_DAYS jest usuwany w całości; świeższy plik
 * jest tylko czyszczony z wpisów starszych niż RETENTION_DAYS (po polu czasu),
 * żeby nie kasować danych, które wciąż się dopisują.
 *
 * Uruchomienie:
 *   bun run scripts/cleanup.ts                # realne czyszczenie
 *   bun run scripts/cleanup.ts --dry-run      # tylko raport, zero zapisów
 *   RETENTION_DAYS=3 bun run scripts/cleanup.ts
 *
 * Skrypt nie wychodzi poza katalog data/ i nigdy nie usuwa katalogów.
 */
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_DIR = resolve(ROOT, "data");
const DAY_MS = 86_400_000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const daysArg = args.find((arg) => arg.startsWith("--days="));
const DAYS = (() => {
    const raw = daysArg ? daysArg.slice("--days=".length) : (process.env["RETENTION_DAYS"] ?? "7");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
})();

const cutoff = Date.now() - DAYS * DAY_MS;

type Stats = {
    scanned: number;
    prunedFiles: number;
    deletedFiles: number;
    removedEntries: number;
    skipped: number;
};

const stats: Stats = { scanned: 0, prunedFiles: 0, deletedFiles: 0, removedEntries: 0, skipped: 0 };
const problems: string[] = [];

function label(path: string): string {
    return relative(ROOT, path).split(sep).join("/");
}

/** Twarde zabezpieczenie: wolno działać wyłącznie wewnątrz data/. */
function insideData(path: string): boolean {
    const target = resolve(path);
    return target === DATA_DIR || target.startsWith(DATA_DIR + sep);
}

function log(message: string): void {
    console.log(`${DRY_RUN ? "[dry-run] " : ""}${message}`);
}

function parseTime(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function removeFile(path: string, reason: string): Promise<void> {
    if (!insideData(path)) {
        problems.push(`${label(path)}: poza data/, pomijam`);
        stats.skipped += 1;
        return;
    }
    log(`usuń plik: ${label(path)} (${reason})`);
    if (DRY_RUN) return;
    try {
        await unlink(path);
    } catch (error) {
        problems.push(`${label(path)}: nie udało się usunąć (${(error as Error).message})`);
        return;
    }
}

/** JSONL: zostaw linie, których `ts` jest świeższe niż cutoff. */
async function pruneJsonl(path: string): Promise<void> {
    const raw = await readFile(path, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const kept: string[] = [];
    let removed = 0;

    for (const line of lines) {
        let ts: number | null = null;
        try {
            const parsed = JSON.parse(line) as { ts?: unknown };
            ts = parseTime(parsed.ts);
        } catch {
            ts = null;
        }

        if (ts !== null && ts < cutoff) {
            removed += 1;
        } else {
            kept.push(line);
        }
    }

    if (removed === 0) {
        log(`bez zmian: ${label(path)} (${lines.length} wpisów)`);
        return;
    }

    stats.removedEntries += removed;
    stats.prunedFiles += 1;
    log(`czyść wpisy: ${label(path)} — usuwam ${removed}, zostawiam ${kept.length}`);
    if (DRY_RUN) return;

    const body = kept.length > 0 ? `${kept.join("\n")}\n` : "";
    await writeFile(path, body, "utf8");
}

/** JSON z tablicą wpisów (cache) — filtruje po podanym polu czasu. */
async function pruneJsonArray(path: string, timeField: string): Promise<void> {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
        problems.push(`${label(path)}: oczekiwano tablicy JSON, pomijam`);
        stats.skipped += 1;
        return;
    }

    const entries = parsed as Array<Record<string, unknown>>;
    const kept = entries.filter((entry) => {
        const ts = parseTime(entry[timeField]);
        return ts === null || ts >= cutoff;
    });

    const removed = entries.length - kept.length;
    if (removed === 0) {
        log(`bez zmian: ${label(path)} (${entries.length} wpisów)`);
        return;
    }

    stats.removedEntries += removed;
    stats.prunedFiles += 1;
    log(`czyść wpisy: ${label(path)} — usuwam ${removed}, zostawiam ${kept.length}`);
    if (DRY_RUN) return;
    await writeFile(path, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
}

/** cases.json: { version, cases: [...] }, czas w `lastSeen`. */
async function pruneCases(path: string): Promise<void> {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { version?: number; cases?: unknown };

    if (!Array.isArray(parsed.cases)) {
        problems.push(`${label(path)}: brak tablicy cases, pomijam`);
        stats.skipped += 1;
        return;
    }

    const entries = parsed.cases as Array<Record<string, unknown>>;
    const kept = entries.filter((entry) => {
        const ts = parseTime(entry["lastSeen"]) ?? parseTime(entry["firstSeen"]);
        return ts === null || ts >= cutoff;
    });

    const removed = entries.length - kept.length;
    if (removed === 0) {
        log(`bez zmian: ${label(path)} (wpisów: ${entries.length})`);
        return;
    }

    stats.removedEntries += removed;
    stats.prunedFiles += 1;
    log(`czyść wpisy: ${label(path)} — usuwam ${removed}, zostawiam ${kept.length}`);
    if (DRY_RUN) return;
    await writeFile(path, `${JSON.stringify({ version: parsed.version ?? 1, cases: kept }, null, 2)}\n`, "utf8");
}

async function handleFile(path: string, kind: "jsonl" | "cache" | "cases"): Promise<void> {
    stats.scanned += 1;

    let info;
    try {
        info = await stat(path);
    } catch {
        problems.push(`${label(path)}: nie mogę odczytać metadanych, pomijam`);
        stats.skipped += 1;
        return;
    }

    if (!info.isFile()) {
        log(`pomijam (to nie plik): ${label(path)}`);
        stats.skipped += 1;
        return;
    }

    if (info.mtimeMs < cutoff) {
        stats.deletedFiles += 1;
        await removeFile(path, `starszy niż ${DAYS} dni`);
        return;
    }

    try {
        if (kind === "jsonl") await pruneJsonl(path);
        else if (kind === "cache") await pruneJsonArray(path, "checkedAt");
        else await pruneCases(path);
    } catch (error) {
        problems.push(`${label(path)}: ${(error as Error).message}`);
        stats.skipped += 1;
    }
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
            .map((entry) => resolve(dir, entry.name));
    } catch {
        return [];
    }
}

console.log(
    `Retencja: ${DAYS} dni (cutoff ${new Date(cutoff).toISOString()}), tryb: ${DRY_RUN ? "dry-run" : "zapis"}`,
);

for (const file of [
    ...(await listFiles(resolve(DATA_DIR, "logs"), ".jsonl")),
    ...(await listFiles(resolve(DATA_DIR, "logs"), ".jsonl.1")),
]) {
    await handleFile(file, "jsonl");
}

for (const file of await listFiles(resolve(DATA_DIR, "cache"), ".json")) {
    await handleFile(file, "cache");
}

const casesFile = resolve(DATA_DIR, "moderation", "cases.json");
try {
    await stat(casesFile);
    await handleFile(casesFile, "cases");
} catch {
    log(`brak pliku: ${label(casesFile)}`);
}

console.log(
    `\nPodsumowanie: plików sprawdzonych ${stats.scanned}, wyczyszczonych ${stats.prunedFiles}, ` +
        `usuniętych ${stats.deletedFiles}, wpisów usuniętych ${stats.removedEntries}, pominiętych ${stats.skipped}`,
);

if (problems.length > 0) {
    console.log("\nUwagi:");
    for (const problem of problems) console.log(`- ${problem}`);
    process.exit(1);
}

console.log(DRY_RUN ? "PASS (dry-run, nic nie zmieniono)" : "PASS");
process.exit(0);
