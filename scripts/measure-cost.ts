/**
 * Koszt: cold vs warm cache (rozbicie na etapy).
 *
 * Dla każdego przypadku woła `verifyInput` DWA razy:
 *   1) cold  — plik cache skasowany przed przebiegiem,
 *   2) warm  — ten sam plik cache, zapisany przez przebieg cold.
 *
 * Dlaczego warm nie jest darmowy: ekstrakcja (DeepSeek) wykonuje się zawsze,
 * bo z wejścia trzeba wyciągnąć twierdzenia. Cache oszczędza tylko research
 * (Google Fact Check / Wikipedia / EUvsDisinfo) i — dla trafień dokładnych —
 * dopasowanie Jev. Dlatego warm jest o ~5-20% tańszy, a nie o 100%.
 *
 * Wynik: data/eval/cost.json (COST_REPORT) + tabela markdown na stdout.
 *
 * Uruchomienie:
 *   bun run scripts/measure-cost.ts
 *   COST_URL=https://example.com/artykul bun run scripts/measure-cost.ts   # + przypadek URL
 */
import "dotenv/config";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileCacheStore } from "../src/pipeline/filestore";
import { verifyInput } from "../src/pipeline/verify";
import type { VerifyCostBreakdown, VerifyResponse } from "../src/pipeline/types";

const REPORT_FILE = process.env["COST_REPORT"] ?? "data/eval/cost.json";
const CACHE_DIR = process.env["COST_CACHE_DIR"] ?? "data/eval/cost-cache";
const EXTRA_URL = (process.env["COST_URL"] ?? "").trim();

type CostCase = {
    id: string;
    label: string;
    input: { text?: string; url?: string };
};

const CASES: CostCase[] = [
    {
        id: "fakt-krotki",
        label: "krótki fakt (1 zdanie)",
        input: { text: "Warszawa jest stolicą Polski." },
    },
    {
        id: "fakt-liczby",
        label: "fakt z liczbami",
        input: {
            text: "W 2024 roku Polska liczyła około 37,5 miliona mieszkańców, a w Sejmie zasiada 460 posłów.",
        },
    },
    {
        id: "akapit-sredni",
        label: "średni akapit (3 zdania)",
        input: {
            text:
                "Polska wstąpiła do Unii Europejskiej 1 maja 2004 roku. " +
                "W 2023 roku inflacja w Polsce wyniosła 11,4 proc. " +
                "Prezesem Narodowego Banku Polskiego jest Adam Glapiński.",
        },
    },
    {
        id: "artykul-dlugi",
        label: "długi artykuł (kilka faktów)",
        input: {
            text:
                "Ministerstwo Klimatu poinformowało w poniedziałek, że do 2030 roku Polska chce " +
                "zmniejszyć udział węgla w produkcji energii elektrycznej do 56 procent. " +
                "Według danych Głównego Urzędu Statystycznego w 2023 roku z węgla kamiennego " +
                "i brunatnego pochodziło około 70 procent energii elektrycznej w kraju. " +
                "Wiceminister zapowiedział, że pierwszy blok elektrowni jądrowej w Choczewie " +
                "zostanie uruchomiony w 2033 roku. " +
                "Umowa na budowę elektrowni została podpisana w 2023 roku, a jej wartość " +
                "ministerstwo oszacowało na 20 miliardów dolarów. " +
                "Przeciwko planom protestowały związki zawodowe z Górnego Śląska, " +
                "które zapowiedziały strajk ostrzegawczy na 12 grudnia. " +
                "Rzecznik rządu przekazał, że transformacja ma być rozłożona na dwie dekady.",
        },
    },
    {
        id: "opinia",
        label: "opinia (brak faktów)",
        input: {
            text: "Moim zdaniem rząd powinien wreszcie przestać obiecywać i zacząć działać.",
        },
    },
];

if (EXTRA_URL) {
    CASES.push({ id: "url", label: "wejście linkiem", input: { url: EXTRA_URL } });
}

function cents(usd: number): string {
    return `$${usd.toFixed(6)}`;
}

/** Savings are shown as "−x" (cheaper) or "+x" (more expensive, noise). */
function savedMoney(usd: number): string {
    return usd >= 0 ? `−${cents(usd)}` : `+${cents(-usd)}`;
}

function savedPercent(pct: number): string {
    const value = Math.abs(pct) < 0.05 ? 0 : pct;
    if (value === 0) return "0,0%";
    return `${value > 0 ? "−" : "+"}${Math.abs(value).toFixed(1).replace(".", ",")}%`;
}

function ms(value: number): string {
    return `${Math.round(value)}`;
}

function verdicts(response: VerifyResponse): string {
    if (response.status !== "ok") return response.status;
    if (response.claims.length === 0) return "brak twierdzeń";

    const counts = new Map<string, number>();
    for (const claim of response.claims) {
        counts.set(claim.verdict, (counts.get(claim.verdict) ?? 0) + 1);
    }
    return [...counts.entries()].map(([verdict, n]) => `${verdict}×${n}`).join(", ");
}

type RunSnapshot = {
    costUsd: number;
    costBreakdown: VerifyCostBreakdown | null;
    timingMs: number;
    claims: number;
    /** Claims answered from the cache (`claims[].cached`). */
    cached: number;
    /** Compact verdict summary, e.g. "confirmed×2, insufficient_evidence×1". */
    verdict: string;
};

function snapshot(response: VerifyResponse, elapsedMs: number): RunSnapshot {
    return {
        costUsd: response.costUsd,
        costBreakdown: response.costBreakdown ?? null,
        timingMs: elapsedMs,
        claims: response.claims.length,
        cached: response.claims.filter((claim) => claim.cached).length,
        verdict: verdicts(response),
    };
}

type CaseResult = {
    id: string;
    label: string;
    chars: number;
    cold: RunSnapshot;
    warm: RunSnapshot;
    savedUsd: number;
    savedPct: number;
    error?: string;
};

async function measure(costCase: CostCase): Promise<CaseResult> {
    const cacheFile = join(CACHE_DIR, `${costCase.id}.json`);
    const chars = costCase.input.text?.length ?? 0;

    // Cold: the cache file must not exist when the store is created.
    await rm(cacheFile, { force: true });
    const coldStarted = performance.now();
    const cold = await verifyInput(costCase.input, { cache: new FileCacheStore(cacheFile) });
    const coldMs = performance.now() - coldStarted;

    // Warm: a fresh store reading whatever cold just wrote.
    const warmStarted = performance.now();
    const warm = await verifyInput(costCase.input, { cache: new FileCacheStore(cacheFile) });
    const warmMs = performance.now() - warmStarted;

    const coldSnap = snapshot(cold, coldMs);
    const warmSnap = snapshot(warm, warmMs);
    const savedUsd = coldSnap.costUsd - warmSnap.costUsd;
    const savedPct = coldSnap.costUsd > 0 ? (savedUsd / coldSnap.costUsd) * 100 : 0;

    return {
        id: costCase.id,
        label: costCase.label,
        chars,
        cold: coldSnap,
        warm: warmSnap,
        savedUsd,
        savedPct,
    };
}

function breakdownLine(run: RunSnapshot): string {
    const b = run.costBreakdown;
    if (!b) return "—";
    return [
        `ekstrakcja ${cents(b.extractionUsd)}`,
        `jev ${cents(b.jevUsd)}`,
        `embeddingi ${cents(b.embeddingUsd)}`,
        `research ${cents(b.researchUsd)}`,
    ].join(" · ");
}

function markdown(results: CaseResult[]): string {
    const lines: string[] = [];

    lines.push("### Koszt: cold vs warm cache");
    lines.push("");
    lines.push("| case | cold cost | warm cost | cold ms | warm ms | verdict | cached |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const r of results) {
        if (r.error) {
            lines.push(`| ${r.id} | błąd | błąd | — | — | ${r.error} | — |`);
            continue;
        }
        lines.push(
            `| ${r.id} | ${cents(r.cold.costUsd)} | ${cents(r.warm.costUsd)} | ` +
                `${ms(r.cold.timingMs)} | ${ms(r.warm.timingMs)} | ${r.warm.verdict} | ` +
                `${r.warm.cached}/${r.warm.claims} |`,
        );
    }
    lines.push("");
    lines.push("### Rozbicie na etapy (cold → warm)");
    lines.push("");
    lines.push("| case | etapy cold | etapy warm | oszczędność |");
    lines.push("|---|---|---|---|");
    for (const r of results) {
        if (r.error) continue;
        lines.push(
            `| ${r.id} | ${breakdownLine(r.cold)} | ${breakdownLine(r.warm)} | ` +
                `${savedMoney(r.savedUsd)} (${savedPercent(r.savedPct)}) |`,
        );
    }
    lines.push("");
    lines.push(
        "Ekstrakcja wykonuje się w obu przebiegach, więc warm nie schodzi do zera — " +
            "oszczędza tylko research i (przy trafieniu dokładnym) dopasowanie Jev.",
    );

    return lines.join("\n");
}

async function main(): Promise<void> {
    console.log(`Koszt cold vs warm: ${CASES.length} przypadków × 2 przebiegi`);
    console.log(`Cache per przypadek: ${CACHE_DIR}/<case>.json\n`);

    const results: CaseResult[] = [];
    for (const costCase of CASES) {
        process.stdout.write(`- ${costCase.id} … `);
        try {
            const result = await measure(costCase);
            results.push(result);
            console.log(
                `cold ${cents(result.cold.costUsd)} / warm ${cents(result.warm.costUsd)} ` +
                    `(${savedPercent(result.savedPct)})`,
            );
        } catch (error) {
            const message = (error as Error).message;
            results.push({
                id: costCase.id,
                label: costCase.label,
                chars: costCase.input.text?.length ?? 0,
                cold: {
                    costUsd: 0,
                    costBreakdown: null,
                    timingMs: 0,
                    claims: 0,
                    cached: 0,
                    verdict: "—",
                },
                warm: {
                    costUsd: 0,
                    costBreakdown: null,
                    timingMs: 0,
                    claims: 0,
                    cached: 0,
                    verdict: "—",
                },
                savedUsd: 0,
                savedPct: 0,
                error: message,
            });
            console.log(`błąd: ${message}`);
        }
    }

    const measured = results.filter((r) => !r.error);
    const coldSum = measured.reduce((sum, r) => sum + r.cold.costUsd, 0);
    const warmSum = measured.reduce((sum, r) => sum + r.warm.costUsd, 0);
    const savedSum = coldSum - warmSum;
    const savedPctSum = coldSum > 0 ? (savedSum / coldSum) * 100 : 0;

    const table = markdown(results);
    const payload = {
        generatedAt: new Date().toISOString(),
        note:
            "Cold = cache file deleted before the run; warm = same file, written by the cold run. " +
            "Extraction always runs, so warm never costs 0.",
        totals: {
            cases: measured.length,
            coldUsd: coldSum,
            warmUsd: warmSum,
            savedUsd: savedSum,
            savedPct: savedPctSum,
        },
        cases: results,
        markdown: table,
    };

    await mkdir(dirname(REPORT_FILE), { recursive: true });
    await writeFile(REPORT_FILE, JSON.stringify(payload, null, 2), "utf8");

    console.log(`\n${table}\n`);
    console.log(
        `Razem (${measured.length} przypadków): cold ${cents(coldSum)} → warm ${cents(warmSum)} ` +
            `(${savedMoney(savedSum)}, ${savedPercent(savedPctSum)}). Zapisano ${REPORT_FILE}`,
    );
}

await main();
