/** Inverted-index benchmark for the 110k AI cache. */
import { readFile } from "node:fs/promises";

const FILE = process.env["AI_CACHE_FILE"] ??
    "C:\\Users\\admin\\Documents\\Default Project\\data\\aicache.json";

type Rec = { s: string; p: string; o: string | number; quote?: string; verdict: string; key: string };

function norm(v: unknown): string {
    return String(v ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(v: unknown): string[] {
    return norm(v).split(" ").filter((t) => t.length >= 4).map((t) => (t.length > 5 ? t.slice(0, 5) : t));
}

const t0 = Date.now();
const data = JSON.parse(await readFile(FILE, "utf8")) as { records: Rec[] };
const records = data.records;
console.log(`load+parse ${Date.now() - t0} ms, records ${records.length}`);

const tIndex = Date.now();
const postings = new Map<string, number[]>();
for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const seen = new Set(tokens(`${rec.s} ${rec.o} ${(rec.quote ?? "").slice(0, 400)}`));
    for (const token of seen) {
        let list = postings.get(token);
        if (!list) {
            list = [];
            postings.set(token, list);
        }
        list.push(i);
    }
}
console.log(`index build ${Date.now() - tIndex} ms, tokens ${postings.size}, heap ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB`);

const queries = [
    "Dariusz Klimczak minister infrastruktury",
    "Polska Unia Europejska członek",
    "Kraków stolica Polski",
    "Andrzej Duda wybory prezydenckie 2020",
    "CERT Polska komunikat podatność",
];

function search(query: string, limit = 10): Array<{ rec: Rec; score: number }> {
    const q = [...new Set(tokens(query))];
    if (q.length === 0) return [];

    // Intersect the smallest posting lists first.
    const lists = q
        .map((token) => postings.get(token))
        .filter((list): list is number[] => Array.isArray(list))
        .sort((a, b) => a.length - b.length);
    if (lists.length === 0) return [];

    let candidates = lists[0]!;
    for (let i = 1; i < lists.length; i++) {
        const set = new Set(lists[i]!);
        candidates = candidates.filter((index) => set.has(index));
        if (candidates.length === 0) break;
    }

    const scored = candidates.map((index) => {
        const rec = records[index]!;
        const hay = norm(`${rec.s} ${rec.o} ${rec.quote ?? ""}`);
        const hits = q.filter((token) => hay.includes(token)).length;
        return { rec, score: hits / q.length };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

const times: number[] = [];
for (const query of queries) {
    const start = Date.now();
    const hits = search(query, 10);
    const elapsed = Date.now() - start;
    times.push(elapsed);
    console.log(`\n"${query}" -> ${elapsed} ms, hits=${hits.length}`);
    for (const hit of hits.slice(0, 2)) console.log(`  ${hit.score.toFixed(2)} ${hit.rec.s} — ${String(hit.rec.o).slice(0, 70)}`);
}

times.sort((a, b) => a - b);
console.log(`\nlookup p50=${times[Math.floor(times.length / 2)]} ms, max=${Math.max(...times)} ms`);
