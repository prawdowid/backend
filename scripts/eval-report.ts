/**
 * Zwięzłe podsumowanie raportu ewaluacji (markdown do README/slajdów).
 *
 * Wejście: data/eval/report.json (albo ścieżka z argumentu / EVAL_REPORT).
 * Nic nie liczy od nowa — czyta gotowy raport z scripts/eval.ts.
 *
 * Użycie:
 *   bun run scripts/eval-report.ts
 *   bun run scripts/eval-report.ts data/eval/report.json
 */
import { readFile } from "node:fs/promises";

type VerdictName = "confirmed" | "false" | "misleading" | "insufficient_evidence" | "not_verifiable";

type ClassRow = {
    verdict: VerdictName;
    support: number;
    precision: number;
    recall: number;
    f1: number;
};

type Summary = {
    cases: number;
    evaluated: number;
    anyExpected: number;
    correct: number;
    accuracy: number | null;
    macroF1: number | null;
    abstention: { expected: number; correct: number; rate: number | null };
    citationCoverage: number | null;
    claimsTotal: number;
    claimsWithEvidence: number;
    evidenceTotal: number;
    injection: { cases: number; passed: number; rate: number | null };
    latency: { medianMs: number | null; p95Ms: number | null; meanMs: number | null };
    cost: { meanUsd: number | null; totalUsd: number };
    zeroClaimCases: number;
};

type CategoryRow = {
    category: string;
    cases: number;
    evaluated: number;
    correct: number;
    accuracy: number | null;
    abstentionExpected: number;
    abstentionCorrect: number;
    injectionCases: number;
    injectionPassed: number;
    errors: number;
};

type CaseRow = {
    id: string;
    category: string;
    expected: string;
    predicted: string | null;
    status: string;
    anyClaimMatched: boolean;
};

type Report = {
    meta?: {
        runAt?: string;
        mode?: string;
        baseUrl?: string | null;
        durationHuman?: string;
        googleFactCheckKey?: boolean;
    };
    summary?: Summary;
    classes?: ClassRow[];
    categories?: CategoryRow[];
    cases?: CaseRow[];
};

const DEFAULT_REPORT = "data/eval/report.json";

function pct(value: number | null | undefined): string {
    return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function num(value: number | null | undefined, digits = 3): string {
    return typeof value === "number" ? value.toFixed(digits) : "—";
}

function money(value: number | null | undefined): string {
    return typeof value === "number" ? `$${value.toFixed(6)}` : "—";
}

async function main(): Promise<void> {
    const file = process.argv[2] ?? process.env["EVAL_REPORT"] ?? DEFAULT_REPORT;

    let raw: string;
    try {
        raw = await readFile(file, "utf8");
    } catch {
        console.error(`Nie znalazłem raportu: ${file}`);
        console.error("Najpierw uruchom: bun run scripts/eval.ts");
        process.exitCode = 1;
        return;
    }

    let parsed: Report;
    try {
        parsed = JSON.parse(raw) as Report;
    } catch (error) {
        console.error(`Raport ${file} nie jest poprawnym JSON-em: ${(error as Error).message}`);
        process.exitCode = 1;
        return;
    }

    const summary = parsed.summary;
    if (!summary) {
        console.error(`Raport ${file} nie zawiera sekcji "summary" — wygląda na niekompletny.`);
        process.exitCode = 1;
        return;
    }

    const meta = parsed.meta ?? {};
    const cases = parsed.cases ?? [];

    console.log("# PRAWDOWID — wyniki ewaluacji");
    console.log("");
    console.log(
        `Przebieg: ${meta.runAt ?? "?"} · tryb: ${meta.mode ?? "?"}` +
            `${meta.baseUrl ? ` (${meta.baseUrl})` : ""} · czas: ${meta.durationHuman ?? "?"}`,
    );
    console.log(
        `Przypadki: ${summary.cases} · oceniane werdyktowo: ${summary.evaluated} · "any": ${summary.anyExpected}` +
            ` · klucz Google Fact Check: ${meta.googleFactCheckKey ? "tak" : "nie"}`,
    );
    console.log("");
    console.log("| metryka | wynik |");
    console.log("|---|---|");
    console.log(`| accuracy | ${pct(summary.accuracy)} (${summary.correct}/${summary.evaluated}) |`);
    console.log(`| macro-F1 | ${num(summary.macroF1)} |`);
    console.log(
        `| wstrzymanie (insufficient → insufficient) | ${pct(summary.abstention.rate)} ` +
            `(${summary.abstention.correct}/${summary.abstention.expected}) |`,
    );
    console.log(
        `| pokrycie cytowaniami | ${pct(summary.citationCoverage)} ` +
            `(${summary.claimsWithEvidence}/${summary.claimsTotal} twierdzeń) |`,
    );
    console.log(
        `| injection pass | ${pct(summary.injection.rate)} ` +
            `(${summary.injection.passed}/${summary.injection.cases}) |`,
    );
    console.log(`| mediana / p95 latencji | ${summary.latency.medianMs ?? "—"} / ${summary.latency.p95Ms ?? "—"} ms |`);
    console.log(`| koszt średni / łączny | ${money(summary.cost.meanUsd)} / ${money(summary.cost.totalUsd)} |`);
    console.log(`| dowody łącznie | ${summary.evidenceTotal} |`);
    console.log(`| przypadki bez żadnego twierdzenia | ${summary.zeroClaimCases} |`);
    console.log("");

    const classes = parsed.classes ?? [];
    if (classes.length > 0) {
        console.log("| klasa | n | precision | recall | F1 |");
        console.log("|---|---|---|---|---|");
        for (const row of classes) {
            console.log(
                `| ${row.verdict} | ${row.support} | ${num(row.precision)} | ${num(row.recall)} | ${num(row.f1)} |`,
            );
        }
        console.log("");
    }

    const categories = parsed.categories ?? [];
    if (categories.length > 0) {
        console.log("| kategoria | n | oceniane | trafne | accuracy | abstencja | injection |");
        console.log("|---|---|---|---|---|---|---|");
        for (const row of categories) {
            console.log(
                `| ${row.category} | ${row.cases} | ${row.evaluated} | ${row.correct} | ${pct(row.accuracy)} | ` +
                    `${row.abstentionCorrect}/${row.abstentionExpected} | ${row.injectionPassed}/${row.injectionCases} |`,
            );
        }
        console.log("");
    }

    const misses = cases.filter((row) => row.expected !== "any" && row.predicted !== row.expected);
    if (misses.length > 0) {
        console.log(`## Pomyłki (${misses.length})`);
        console.log("");
        for (const row of misses.slice(0, 10)) {
            console.log(
                `- \`${row.id}\` (${row.category}): oczekiwane **${row.expected}**, ` +
                    `przewidziane **${row.predicted ?? "brak"}**` +
                    `${row.anyClaimMatched ? " — poprawny werdykt był na innym twierdzeniu" : ""}`,
            );
        }
        if (misses.length > 10) console.log(`- … i ${misses.length - 10} więcej (pełna lista w report.json)`);
        console.log("");
    }

    console.log(
        `> Uwaga: ${summary.anyExpected} przypadków ma oczekiwanie "any" i nie wchodzi do accuracy ani F1. ` +
            "To przypadki, w których bez dostępu do źródeł fact-checkingowych nie da się uczciwie ustalić werdyktu " +
            "(URL, puste wejście, materiał testowy). Szczegóły: docs/EVAL.md.",
    );
}

try {
    await main();
} catch (error) {
    console.error(`[eval-report] przerwano: ${(error as Error).message}`);
    process.exitCode = 1;
}
