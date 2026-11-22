import "dotenv/config";
import { readFile } from "node:fs/promises";
import { MASTERPROMPT } from "../src/pipeline";

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
const flat = text.replace(/\s+/g, " ").trim();

type Candidate = { model: string; reasoning?: boolean };

const candidates: Candidate[] = [
    { model: "google/gemini-2.5-flash-lite" },
    { model: "openai/gpt-4.1-nano" },
    { model: "mistralai/mistral-small-3.2-24b-instruct" },
    { model: "google/gemma-4-26b-a4b-it" },
    { model: "nvidia/nemotron-3.5-lightning" },
    { model: "z-ai/glm-5.3-flash" },
    { model: "minimax/minimax-m3.1-flash" },
    { model: "deepseek/deepseek-v4.1-flash", reasoning: false },
];

function parse(raw: string): { facts: number; claims: number; quotesOk: number } | null {
    try {
        const json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim());
        const facts = Array.isArray(json.facts) ? json.facts : [];
        let claims = 0;
        let quotesOk = 0;
        for (const fact of facts) {
            claims += Array.isArray(fact.c) ? fact.c.length : 0;
            if (typeof fact.q === "string" && flat.includes(fact.q.replace(/\s+/g, " ").trim())) quotesOk++;
        }
        return { facts: facts.length, claims, quotesOk };
    } catch {
        return null;
    }
}

for (const { model, reasoning } of candidates) {
    const started = Date.now();
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                authorization: `Bearer ${process.env["OPENROUTER_API_KEY"]}`,
                "content-type": "application/json",
                "HTTP-Referer": "https://github.com/hackathon",
                "X-Title": "pipeline-bench",
            },
            body: JSON.stringify({
                model,
                temperature: 0,
                max_tokens: 4000,
                messages: [
                    { role: "system", content: MASTERPROMPT },
                    { role: "user", content: `<ARTICLE>\n${text}\n</ARTICLE>` },
                ],
                ...(reasoning === false ? { reasoning: { enabled: false } } : {}),
            }),
        });

        const elapsed = Date.now() - started;
        if (!res.ok) {
            console.log(`${model}: HTTP ${res.status} after ${elapsed} ms -> ${(await res.text()).slice(0, 120)}`);
            continue;
        }

        const body = (await res.json()) as {
            choices?: Array<{ message?: { content?: string | null } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const raw = body.choices?.[0]?.message?.content ?? "";
        const parsed = parse(raw);
        console.log(
            `${model}: ${elapsed} ms | in=${body.usage?.prompt_tokens} out=${body.usage?.completion_tokens} | JSON=${parsed ? "ok" : "FAIL"} | facts=${parsed?.facts ?? 0} claims=${parsed?.claims ?? 0} quotes=${parsed?.quotesOk ?? 0}/${parsed?.facts ?? 0}`,
        );
    } catch (error) {
        console.log(`${model}: FAILED after ${Date.now() - started} ms -> ${(error as Error).message.slice(0, 150)}`);
    }
}
