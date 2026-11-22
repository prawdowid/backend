import "dotenv/config";
import { readFile } from "node:fs/promises";
import { MASTERPROMPT } from "../src/pipeline";

const FILE =
    "C:\\Users\\admin\\Documents\\GitHub\\hackathon\\DANE\\do_udostępnienia\\1\\«Wiem, kto strzelał»_ zamach na Rafała Brzoskę, założyciela InPostu — Gazeta.pl.html";

const html = await readFile(FILE, "utf8");
const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

const models = [
    "deepseek/deepseek-v4.1-flash",
    "~deepseek/deepseek-flash-latest",
    "google/gemma-4-26b-a4b-it",
    "google/gemini-2.5-flash-lite",
];

const RUNS = 4;

function isJson(raw: string): boolean {
    try {
        JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
        return true;
    } catch {
        return false;
    }
}

const results = new Map<string, { ms: number[]; out: number[]; ok: number }>();

for (const model of models) {
    results.set(model, { ms: [], out: [], ok: 0 });
}

for (let run = 1; run <= RUNS; run++) {
    for (const model of models) {
        const started = Date.now();
        try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    authorization: `Bearer ${process.env["OPENROUTER_API_KEY"]}`,
                    "content-type": "application/json",
                    "HTTP-Referer": "https://github.com/hackathon",
                    "X-Title": "speed-bench",
                },
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    max_tokens: 8000,
                    reasoning: { enabled: false },
                    messages: [
                        { role: "system", content: MASTERPROMPT },
                        { role: "user", content: `<ARTICLE>\n${text}\n</ARTICLE>` },
                    ],
                }),
            });
            const elapsed = Date.now() - started;
            const entry = results.get(model)!;
            entry.ms.push(elapsed);

            if (!res.ok) {
                console.log(`${model} run${run}: HTTP ${res.status} ${elapsed} ms`);
                continue;
            }
            const body = (await res.json()) as {
                choices?: Array<{ message?: { content?: string | null } }>;
                usage?: { completion_tokens?: number };
            };
            const out = body.usage?.completion_tokens ?? 0;
            const ok = isJson(body.choices?.[0]?.message?.content ?? "");
            entry.out.push(out);
            if (ok) entry.ok++;
            console.log(`${model} run${run}: ${elapsed} ms out=${out} JSON=${ok ? "ok" : "FAIL"}`);
        } catch (error) {
            console.log(`${model} run${run}: FAILED ${Date.now() - started} ms ${(error as Error).message.slice(0, 80)}`);
        }
    }
}

const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

console.log("\n=== summary (ms) ===");
for (const [model, entry] of results) {
    console.log(
        `${model}: median=${median(entry.ms)} min=${Math.min(...entry.ms)} max=${Math.max(...entry.ms)} | JSON ok=${entry.ok}/${RUNS} | avg out=${Math.round(entry.out.reduce((a, b) => a + b, 0) / Math.max(1, entry.out.length))}`,
    );
}
