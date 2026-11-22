/**
 * Benchmark the 110k-record AI cache produced by the ingestion agent.
 * Run: bun run scripts/bench-aicache.ts
 */
import { readFile } from "node:fs/promises";

const FILE = process.env["AI_CACHE_FILE"] ??
    "C:\\Users\\admin\\Documents\\Default Project\\data\\aicache.json";

type Rec = {
    s: string;
    p: string;
    o: string | number;
    quote?: string;
    verdict: string;
    key: string;
    status?: string;
    validFrom?: string | null;
    validUntil?: string | null;
    sourceUrl?: string;
    evidence?: unknown;
};

function norm(v: unknown): string {
    return String(v ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(v: unknown): string[] {
    return norm(v).split(" ").filter((t) => t.length >= 4).map((t) => (t.length > 5 ? t.slice(0, 5) : t));
}

const t0 = Date.now();
const raw = await readFile(FILE, "utf8");
const tRead = Date.now();
const data = JSON.parse(raw) as { records: Rec[] };
const tParse = Date.now();
const records = data.records.filter((r) => (r.status ?? "active") === "active");
const heap = process.memoryUsage().heapUsed / 1024 / 1024;

console.log(`read ${tRead - t0} ms, parse ${tParse - tRead} ms, total ${tParse - t0} ms`);
console.log(`records ${data.records.length}, active ${records.length}, heap ${heap.toFixed(0)} MB, JSON ${(raw.length / 1024 / 1024).toFixed(1)} MB`);

const queries = [
    "Dariusz Klimczak minister infrastruktury",
    "Polska Unia Europejska członek",
    "Kraków stolica Polski",
    "Andrzej Duda wybory prezydenckie 2020",
    "CERT Polska komunikat podatność",
];

function search(query: string, limit = 10): Array<{ rec: Rec; score: number }> {
    const q = tokens(query);
    const qset = new Set(q);
    if (qset.size === 0) return [];
    const scored: Array<{ rec: Rec; score: number }> = [];
    for (const rec of records) {
        const hay = norm(`${rec.s} ${rec.p} ${rec.o} ${rec.quote ?? ""}`);
        let hits = 0;
        for (const token of qset) if (hay.includes(token)) hits++;
        if (hits === 0) continue;
        scored.push({ rec, score: hits / qset.size });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const times: number[] = [];
for (const query of queries) {
    const start = Date.now();
    const hits = search(query, 10);
    const elapsed = Date.now() - start;
    times.push(elapsed);
    console.log(`\n"${query}" -> ${elapsed} ms, hits=${hits.length}`);
    for (const hit of hits.slice(0, 3)) {
        console.log(`  ${hit.score.toFixed(2)} [${hit.rec.verdict}] ${hit.rec.s} — ${hit.rec.p} — ${String(hit.rec.o).slice(0, 80)}`);
    }
}

times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length / 2)]!;
const p95 = times[Math.min(times.length - 1, Math.floor(times.length * 0.95))]!;
console.log(`\nlookup p50=${p50} ms, p95=${p95} ms, max=${Math.max(...times)} ms`);
