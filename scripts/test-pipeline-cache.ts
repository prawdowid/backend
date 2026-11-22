import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runPipeline, MemoryCacheStore } from "../src/pipeline";
import { DeepSeekWrapper } from "../src/modules/deepseek";

const FILE =
    "C:\\Users\\admin\\Documents\\GitHub\\hackathon\\DANE\\do_udostępnienia\\1\\«Wiem, kto strzelał»_ zamach na Rafała Brzoskę, założyciela InPostu — Gazeta.pl.html";

function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const text = htmlToText(await readFile(FILE, "utf8"));
const cache = new MemoryCacheStore();

console.log("=== run 1: cold cache ===");
const cold = await runPipeline(text, cache);
console.log(`status=${cold.status} claims=${cold.claims.length} hits=${cold.hits.length} misses=${cold.misses.length}`);

console.log("\n=== seeding cache with the extracted claims (verdict=false, fake keys) ===");
const vectors = await DeepSeekWrapper.Embed(cold.misses.map((c) => c.text));
for (let i = 0; i < cold.misses.length; i++) {
    const claim = cold.misses[i]!;
    await cache.put({
        id: `seed-${i}`,
        key: `seed-${i}`, // different key -> exact-match path must NOT hit
        text: claim.text,
        details: claim.details,
        verdict: "false",
        sources: ["https://example.invalid/fact-check"],
        checkedAt: new Date().toISOString(),
        embedding: vectors[i]!,
    });
}
console.log(`seeded ${cold.misses.length}`);

console.log("\n=== run 2: warm cache, semantic match only ===");
const warm = await runPipeline(text, cache);
console.log(`status=${warm.status} claims=${warm.claims.length} hits=${warm.hits.length} misses=${warm.misses.length}`);

for (const hit of warm.hits) {
    console.log(`HIT p=${hit.probability.toFixed(3)} verdict=${hit.cached.verdict} :: ${hit.claim.text}`);
}
for (const miss of warm.misses) {
    console.log(`MISS :: ${miss.text}`);
}
