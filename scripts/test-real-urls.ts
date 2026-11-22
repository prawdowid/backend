import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { verifyInput } from "../src/pipeline/verify";

const urls = [
    "https://wiadomosci.gazeta.pl/polityka/7,198013,33144699,nato-reaguje-na-rosyjskie-obiekty-w-polsce-rutte-absolutnie.html",
    "https://wiadomosci.gazeta.pl/polityka/7,198012,33144657,lider-prawicy-w-polsce-polacy-wybrali-w-sondazu-swojego-faworyta.html",
    "https://wiadomosci.gazeta.pl/polityka/7,198013,33144518,zelenski-podsumowal-spotkanie-usa-chiny-rosja-nie-udala-sie.html",
    "https://wiadomosci.wp.pl/trump-nie-pozostawil-zludzen-opublikowal-zdjecie-z-putinem-i-dwa-slowa-7353534468577312a",
    "https://wiadomosci.wp.pl/usciski-i-usmiechy-tusk-ujawnil-co-powiedzial-mu-nawrocki-7353019127879680v",
    "https://www.benchmark.pl/jedno-pytanie-o-jensena-huanga-i-koniec-chiny-pokazaly-jej-drzwi-7353059859265536a",
];

const results: Array<Record<string, unknown>> = [];

for (const url of urls) {
    const started = Date.now();
    console.log(`\n=== ${url.slice(0, 90)}`);
    try {
        const result = await verifyInput({ url, channel: "web" });
        const summary = {
            url,
            status: result.status,
            overall: result.overallVerdict ?? null,
            claims: result.claims.map((claim) => ({
                claim: claim.claim,
                verdict: claim.verdict,
                confidence: claim.confidence,
                cached: claim.cached,
                evidence: claim.evidence.map((item) => `${item.relation}:${item.publisher}`),
                limitations: claim.limitations,
            })),
            limitations: result.limitations,
            timingMs: Date.now() - started,
            costUsd: result.costUsd,
            preview: result.input.preview,
        };
        results.push(summary);
        console.log(
            `status=${summary.status} overall=${summary.overall} claims=${summary.claims.length} ${summary.timingMs}ms`,
        );
        for (const claim of summary.claims as Array<{ verdict: string; claim: string; evidence: string[] }>) {
            console.log(`  ${claim.verdict} :: ${claim.claim} :: ${claim.evidence.slice(0, 4).join(", ")}`);
        }
        if (summary.limitations.length) console.log(`  limits: ${(summary.limitations as string[]).join(" | ").slice(0, 240)}`);
    } catch (error) {
        results.push({ url, error: (error as Error).message });
        console.log(`  ERROR ${(error as Error).message}`);
    }
}

await mkdir("data/eval", { recursive: true });
await writeFile("data/eval/real-urls.json", JSON.stringify(results, null, 2), "utf8");
console.log("\nZapisano data/eval/real-urls.json");
