import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runPipeline, MemoryCacheStore } from "../src/pipeline";

const DEFAULT_FILE =
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
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

const file = process.argv[2] ?? DEFAULT_FILE;
const html = await readFile(file, "utf8");
const text = htmlToText(html);

console.log(`file: ${file}`);
console.log(`html: ${html.length} chars -> text: ${text.length} chars (~${Math.round(text.length / 3.5)} tokens)`);
console.log("--- first 600 chars ---");
console.log(text.slice(0, 600));
console.log("--- running pipeline ---");

const started = Date.now();
const result = await runPipeline(text, new MemoryCacheStore());
const elapsed = Date.now() - started;

console.log(`--- done in ${elapsed} ms ---`);
console.log(
    JSON.stringify(
        {
            status: result.status,
            political: result.political,
            lang: result.lang,
            date: result.date,
            claims: result.claims.length,
            hits: result.hits.map((h) => ({ claim: h.claim.text, verdict: h.cached.verdict, p: h.probability })),
            misses: result.misses.map((c) => ({ text: c.text, details: c.details, quote: c.quote })),
        },
        null,
        2,
    ),
);
