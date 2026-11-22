/**
 * Research fan-out to OpenAI GPT-5.6 Terra via OpenRouter.
 * Not part of the product; produces docs/RESEARCH/gpt56-terra.md.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";

const MODEL = process.env["TERRA_MODEL"] ?? "openai/gpt-5.6-terra";
const KEY = process.env["OPENROUTER_API_KEY"];
if (!KEY) throw new Error("OPENROUTER_API_KEY missing");

const CONTEXT = `
PROJECT: PRAWDOWID — Polish fact-checking MVP for MSZ hackathon (24h). Stack: Bun, TypeScript, Elysia.
HARD REQUIREMENTS (from task PDF):
- verdict classes: confirmed / false / misleading / insufficient_evidence / not_verifiable;
- error and "needs clarification" must be separate statuses, never verdicts;
- every factual claim needs evidence: title, publisher, date, link, excerpt;
- abstain when evidence is insufficient; explain what is missing;
- source corpus >=100 documents, >=10 domains, >=2 source types (primary/official + secondary);
- prompt-injection resistance; privacy/retention; observability; Polish simple language.
JURY METRICS: macro-F1 >=0.75; citation coverage >=95%; citation correctness >=85%; abstention >=80%; injection >=90%; median <=30s; cost per 100 reported; E2E 100%; channel consistency 100%; info loop (moderator cases) if implemented.

CURRENT STATE:
- 30 eval cases, 24 scored. Last run: accuracy 75% (18/24), macro-F1 0.662.
- Per class F1: confirmed 0.833 (support 6), false 0.769 (support 8), misleading 0.000 (support 2), insufficient 0.706 (support 6), not_verifiable 1.000 (support 2).
- Remaining misses: case-06 compound sentence (expected misleading, got confirmed because one sub-claim confirmed and the euro sub-claim was wrongly confirmed in that run), case-08 (expected confirmed), case-10/12/22 (expected false), case-13 (expected misleading).
- Sources already wired: Wikidata deterministic value lookup (capital, membership+date, currency, seats, length, election winner), local 1164-document gov corpus (gov.pl/Policja/CERT/RSO), EUvsDisinfo 5000-case snapshot, Google Fact Check API, Wikipedia (direct + r.jina.ai fallback), optional Brave/Tavily.
- Pipeline: claim extraction (DeepSeek Flash via OpenRouter), embeddings (bge-m3), cache with validFrom/validUntil, Jev neural matching, research layer with Jev gates, information loop with moderator cases.
- Known issues: extraction nondeterminism; Wikidata rate limits; Wikipedia 429; p95 latency ~80s (median ~12s); misleading class hard to trigger.
- Constraints: no Postgres; files/MySQL; remaining time ~4h; don't overfit the 30 cases.

QUESTION: Give a concrete, prioritized plan to reliably reach macro-F1 >=0.75 on this eval and satisfy the jury requirements, without gaming the test. Focus on:
1) the cheapest fixes for misleading/false recall and compound-claim aggregation;
2) which additional deterministic sources or rules actually move F1;
3) evaluation hygiene (how to report F1 with nondeterminism, avoid overfitting);
4) jury-facing risks and what to demonstrate.
Be specific: rules, thresholds, data sources, expected F1 delta, effort in hours. Do not propose rewriting the architecture.
`;

const ANGLES = [
    "ANGLE: evaluation and metrics. Diagnose the class-level losses and propose exact decision/aggregation rules that raise macro-F1 without false positives. Include how to score compound claims and how to report a stable number.",
    "ANGLE: evidence and sources. Decide which deterministic lookups (Wikidata properties, document corpus, EUvsDisinfo, fact-check APIs) to prioritize to raise false/confirmed recall. Give concrete mappings/queries and thresholds.",
    "ANGLE: product/jury. Given the PDF, identify what the jury will penalize in this prototype and the smallest changes (UX, logs, disclosures, demo scenarios) that maximize score without new infrastructure.",
];

type Result = { angle: string; text: string; usage?: unknown };

async function call(angle: string): Promise<Result> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            authorization: `Bearer ${KEY}`,
            "content-type": "application/json",
            "HTTP-Referer": "https://github.com/prawdowid/backend",
            "X-Title": "prawdowid-research",
        },
        body: JSON.stringify({
            model: MODEL,
            temperature: 0.2,
            max_tokens: 3500,
            reasoning: { enabled: false },
            messages: [
                { role: "system", content: "You are a senior fact-checking systems architect. Be concrete, skeptical, and quantitative. Reply in English." },
                { role: "user", content: `${CONTEXT}\n\n${angle}` },
            ],
        }),
        signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
        return { angle, text: `ERROR ${response.status}: ${(await response.text()).slice(0, 300)}` };
    }

    const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: unknown;
    };
    return { angle, text: body.choices?.[0]?.message?.content ?? "", usage: body.usage };
}

const results = await Promise.all(ANGLES.map(call));

const doc = [
    `# GPT-5.6 Terra research (${new Date().toISOString()})`,
    `Model: \`${MODEL}\``,
    "",
    ...results.flatMap((result) => [`## ${result.angle}`, "", result.text, ""]),
].join("\n");

await mkdir("docs/RESEARCH", { recursive: true });
await writeFile("docs/RESEARCH/gpt56-terra.md", doc, "utf8");

for (const result of results) {
    console.log(`\n===== ${result.angle.slice(0, 60)} =====`);
    console.log(result.text.slice(0, 1200));
}
console.log("\nSaved docs/RESEARCH/gpt56-terra.md");
