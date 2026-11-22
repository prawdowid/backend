/**
 * Runner ewaluacji PRAWDOWID.
 *
 * DomyÅ›lnie woÅ‚a `verifyInput` bezpoÅ›rednio (szybciej, bez HTTP).
 * Gdy ustawisz EVAL_BASE_URL, woÅ‚a `POST {base}/verify` na dziaÅ‚ajÄ…cym serwerze.
 *
 * WejÅ›cie:  eval/cases.json        (EVAL_CASES)
 * WyjÅ›cie:  data/eval/report.json       (EVAL_REPORT)
 *
 * Cache: przy trybie bezpoÅ›rednim uÅ¼ywamy osobnego pliku (EVAL_CACHE_FILE,
 * domyÅ›lnie data/eval/cache.json), Å¼eby ewaluacja nie mieszaÅ‚a siÄ™ z cache demo.
 *
 * Zasady: brak nowych zaleÅ¼noÅ›ci, sekwencyjnie, max 30 przypadkÃ³w, jeden bÅ‚Ä…d
 * przypadku nie przerywa caÅ‚ego przebiegu.
 */
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Verdict, VerifyResponse } from "../src/pipeline/types";

const CASES_FILE = process.env["EVAL_CASES"] ?? "eval/cases.json";
const REPORT_FILE = process.env["EVAL_REPORT"] ?? "data/eval/report.json";
const BASE_URL = (process.env["EVAL_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
const MAX_CASES = 30;

const VERDICTS: readonly Verdict[] = [
    "confirmed",
    "false",
    "misleading",
    "insufficient_evidence",
    "not_verifiable",
];

type Expected = Verdict | "any";

type EvalCase = {
    id: string;
    category: string;
    input: { text?: string; url?: string };
    expected: Expected;
    mustMentionInLimitations?: string[];
    notes?: string;
};

/** OdpowiedÅº sprowadzona do tego, co mierzymy. */
type Outcome = {
    status: string;
    claims: Array<{ verdict: Verdict; evidence: number }>;
    limitations: string[];
    models: string[];
    costUsd: number;
    timingMs: number;
    httpStatus: number | null;
};

type InjectionCheck = {
    required: string[];
    passed: boolean;
    matched: string | null;
};

type CaseResult = {
    id: string;
    category: string;
    expected: Expected;
    predicted: Verdict | null;
    /** Czy oczekiwany werdykt pojawiÅ‚ siÄ™ na ktÃ³rymkolwiek twierdzeniu (metryka pomocnicza). */
    anyClaimMatched: boolean;
    status: string;
    httpStatus: number | null;
    latencyMs: number;
    serverTimingMs: number;
    claims: number;
    evidence: number;
    costUsd: number;
    verdicts: Verdict[];
    models: string[];
    limitations: string[];
    injection: InjectionCheck | null;
    notes?: string;
    error?: string;
};

type ClassMetrics = {
    verdict: Verdict;
    support: number;
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
};

// ---------------------------------------------------------------------------
// maÅ‚e pomocniki
// ---------------------------------------------------------------------------

function isVerdict(value: unknown): value is Verdict {
    return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

function round(value: number, digits = 3): number {
    return Number(value.toFixed(digits));
}

function ratio(numerator: number, denominator: number): number | null {
    return denominator > 0 ? numerator / denominator : null;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]!
        : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function p95(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return sorted[index]!;
}

function pct(value: number | null): string {
    return value === null ? "â€”" : `${(value * 100).toFixed(1)}%`;
}

function money(value: number | null): string {
    return value === null ? "â€”" : `$${value.toFixed(6)}`;
}

// ---------------------------------------------------------------------------
// Å‚adowanie przypadkÃ³w
// ---------------------------------------------------------------------------

async function loadCases(): Promise<EvalCase[]> {
    let raw: string;
    try {
        raw = await readFile(CASES_FILE, "utf8");
    } catch {
        throw new Error(`Nie znalazÅ‚em pliku z przypadkami: ${CASES_FILE}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Plik ${CASES_FILE} nie jest poprawnym JSON-em: ${(error as Error).message}`);
    }

    if (!Array.isArray(parsed)) throw new Error(`Plik ${CASES_FILE} musi zawieraÄ‡ tablicÄ™ przypadkÃ³w.`);

    const cases: EvalCase[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        const input = entry["input"];
        if (!input || typeof input !== "object") continue;
        const expected = entry["expected"];
        if (expected !== "any" && !isVerdict(expected)) continue;

        cases.push({
            id: String(entry["id"] ?? `case-${cases.length + 1}`),
            category: String(entry["category"] ?? "inne"),
            input: input as { text?: string; url?: string },
            expected: expected as Expected,
            ...(Array.isArray(entry["mustMentionInLimitations"])
                ? { mustMentionInLimitations: (entry["mustMentionInLimitations"] as unknown[]).map(String) }
                : {}),
            ...(typeof entry["notes"] === "string" ? { notes: entry["notes"] } : {}),
        });
    }

    if (cases.length > MAX_CASES) {
        console.warn(`[eval] ${cases.length} przypadkÃ³w w pliku â€” biorÄ™ pierwsze ${MAX_CASES}.`);
    }
    return cases.slice(0, MAX_CASES);
}

// ---------------------------------------------------------------------------
// wywoÅ‚anie systemu: bezpoÅ›rednio albo przez HTTP
// ---------------------------------------------------------------------------

function normalizeClaims(raw: unknown): Array<{ verdict: Verdict; evidence: number }> {
    if (!Array.isArray(raw)) return [];
    const claims: Array<{ verdict: Verdict; evidence: number }> = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const claim = item as Record<string, unknown>;
        if (!isVerdict(claim["verdict"])) continue;
        claims.push({
            verdict: claim["verdict"],
            evidence: Array.isArray(claim["evidence"]) ? claim["evidence"].length : 0,
        });
    }
    return claims;
}

function normalize(raw: unknown, httpStatus: number | null): Outcome {
    const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
        status: typeof body["status"] === "string" ? body["status"] : "unknown",
        claims: normalizeClaims(body["claims"]),
        limitations: Array.isArray(body["limitations"]) ? body["limitations"].map(String) : [],
        models: Array.isArray(body["models"]) ? body["models"].map(String) : [],
        costUsd: typeof body["costUsd"] === "number" ? body["costUsd"] : 0,
        timingMs: typeof body["timingMs"] === "number" ? body["timingMs"] : 0,
        httpStatus,
    };
}

let directVerify: ((request: { text?: string; url?: string }) => Promise<VerifyResponse>) | null = null;

async function getDirectVerify(): Promise<(request: { text?: string; url?: string }) => Promise<VerifyResponse>> {
    if (directVerify) return directVerify;
    // Musi byÄ‡ ustawione PRZED importem verify.ts: defaultCache powstaje przy imporcie.
    process.env["CACHE_FILE"] ??= process.env["EVAL_CACHE_FILE"] ?? "data/eval/cache.json";
    const module = await import("../src/pipeline/verify");
    directVerify = (request) => module.verifyInput(request);
    return directVerify;
}

async function callDirect(input: { text?: string; url?: string }): Promise<Outcome> {
    const verify = await getDirectVerify();
    const response = await verify(input);
    return normalize(response, null);
}

async function callHttp(input: { text?: string; url?: string }): Promise<Outcome> {
    const response = await fetch(`${BASE_URL}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
    });

    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return normalize(body, response.status);
}

function checkInjection(required: string[] | undefined, limitations: string[]): InjectionCheck | null {
    if (!required || required.length === 0) return null;
    const haystack = limitations.join(" \n ").toLowerCase();
    // Wpis na liÅ›cie to alternatywa: wystarczy, Å¼e odpowiedÅº wspomni jeden z terminÃ³w.
    const matched = required.find((term) => haystack.includes(term.toLowerCase())) ?? null;
    return { required, passed: matched !== null, matched };
}

async function runCase(testCase: EvalCase): Promise<CaseResult> {
    const started = performance.now();
    let outcome: Outcome | null = null;
    let errorMessage: string | undefined;

    try {
        outcome = BASE_URL ? await callHttp(testCase.input) : await callDirect(testCase.input);
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[eval] ${testCase.id}: bÅ‚Ä…d wywoÅ‚ania â€” ${errorMessage}`);
    }

    const latencyMs = Math.round(performance.now() - started);
    const safe: Outcome =
        outcome ?? {
            status: "runner_error",
            claims: [],
            limitations: [],
            models: [],
            costUsd: 0,
            timingMs: 0,
            httpStatus: null,
        };

    function aggregateVerdict(verdicts: Verdict[]): Verdict {
    if (verdicts.length === 0) return "insufficient_evidence";

    const unique = new Set(verdicts);
    if (unique.size === 1) return verdicts[0]!;

    // Partial confirmation mixed with unknown or refuted parts.
    if (unique.has("misleading")) return "misleading";
    if (unique.has("false") && unique.has("confirmed")) return "misleading";
    if (unique.has("confirmed") && unique.has("insufficient_evidence")) return "misleading";
    if (unique.has("false") && unique.has("insufficient_evidence")) return "false";
    if (unique.has("false")) return "false";
    if (unique.has("not_verifiable") && unique.size === 1) return "not_verifiable";

    return "insufficient_evidence";
}

    const verdicts = safe.claims.map((claim) => claim.verdict);
    const predicted = verdicts.length > 0 ? aggregateVerdict(verdicts) : "insufficient_evidence";

    return {
        id: testCase.id,
        category: testCase.category,
        expected: testCase.expected,
        predicted,
        anyClaimMatched: testCase.expected === "any" ? false : verdicts.includes(testCase.expected),
        status: safe.status,
        httpStatus: safe.httpStatus,
        latencyMs,
        serverTimingMs: safe.timingMs,
        claims: safe.claims.length,
        evidence: safe.claims.reduce((sum, claim) => sum + claim.evidence, 0),
        costUsd: safe.costUsd,
        verdicts,
        models: safe.models,
        limitations: safe.limitations,
        injection: checkInjection(testCase.mustMentionInLimitations, safe.limitations),
        ...(testCase.notes ? { notes: testCase.notes } : {}),
        ...(errorMessage ? { error: errorMessage } : {}),
    };
}

// ---------------------------------------------------------------------------
// metryki
// ---------------------------------------------------------------------------

type Summary = {
    cases: number;
    evaluated: number;
    anyExpected: number;
    correct: number;
    accuracy: number | null;
    anyClaimMatches: number;
    macroF1: number | null;
    abstention: { expected: number; correct: number; rate: number | null };
    citationCoverage: number | null;
    claimsTotal: number;
    claimsWithEvidence: number;
    evidenceTotal: number;
    injection: { cases: number; passed: number; rate: number | null };
    latency: { medianMs: number | null; p95Ms: number | null; meanMs: number | null };
    cost: { meanUsd: number | null; totalUsd: number };
    statusCounts: Record<string, number>;
    verdictCounts: Record<string, number>;
    zeroClaimCases: number;
};

function computeClasses(results: CaseResult[]): ClassMetrics[] {
    const evaluated = results.filter((result) => result.expected !== "any");
    return VERDICTS.map((verdict) => {
        let tp = 0;
        let fp = 0;
        let fn = 0;
        for (const result of evaluated) {
            const expected = result.expected === verdict;
            const predicted = result.predicted === verdict;
            if (expected && predicted) tp++;
            else if (!expected && predicted) fp++;
            else if (expected && !predicted) fn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return {
            verdict,
            support: tp + fn,
            tp,
            fp,
            fn,
            precision: round(precision),
            recall: round(recall),
            f1: round(f1),
        };
    });
}

function computeSummary(results: CaseResult[], classes: ClassMetrics[]): Summary {
    const evaluated = results.filter((result) => result.expected !== "any");
    const correct = evaluated.filter((result) => result.predicted === result.expected).length;
    const anyClaimMatches = evaluated.filter((result) => result.anyClaimMatched).length;

    const withSupport = classes.filter((item) => item.support > 0);
    const macroF1 =
        withSupport.length > 0
            ? withSupport.reduce((sum, item) => sum + item.f1, 0) / withSupport.length
            : null;

    const abstentionCases = results.filter((result) => result.expected === "insufficient_evidence");
    const abstentionCorrect = abstentionCases.filter(
        (result) => result.predicted === "insufficient_evidence" || result.claims === 0,
    ).length;

    const claimsTotal = results.reduce((sum, result) => sum + result.claims, 0);
    const claimsWithEvidence = results.reduce(
        (sum, result) => sum + (result.evidence > 0 ? result.claims : 0),
        0,
    );
    const evidenceTotal = results.reduce((sum, result) => sum + result.evidence, 0);

    const injectionCases = results.filter((result) => result.injection !== null);
    const injectionPassed = injectionCases.filter((result) => result.injection?.passed).length;

    const latencies = results.map((result) => result.latencyMs);
    const costs = results.map((result) => result.costUsd);

    const statusCounts: Record<string, number> = {};
    for (const result of results) statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;

    const verdictCounts: Record<string, number> = {};
    for (const verdict of VERDICTS) verdictCounts[verdict] = 0;
    verdictCounts["brak_werdyktu"] = 0;
    for (const result of results) {
        if (result.predicted === null) verdictCounts["brak_werdyktu"] = (verdictCounts["brak_werdyktu"] ?? 0) + 1;
        else verdictCounts[result.predicted] = (verdictCounts[result.predicted] ?? 0) + 1;
    }

    const totalCost = costs.reduce((sum, value) => sum + value, 0);

    return {
        cases: results.length,
        evaluated: evaluated.length,
        anyExpected: results.length - evaluated.length,
        correct,
        accuracy: ratio(correct, evaluated.length),
        anyClaimMatches,
        macroF1: macroF1 === null ? null : round(macroF1),
        abstention: {
            expected: abstentionCases.length,
            correct: abstentionCorrect,
            rate: ratio(abstentionCorrect, abstentionCases.length),
        },
        citationCoverage: ratio(claimsWithEvidence, claimsTotal),
        claimsTotal,
        claimsWithEvidence,
        evidenceTotal,
        injection: {
            cases: injectionCases.length,
            passed: injectionPassed,
            rate: ratio(injectionPassed, injectionCases.length),
        },
        latency: {
            medianMs: median(latencies),
            p95Ms: p95(latencies),
            meanMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
        },
        cost: {
            meanUsd: costs.length > 0 ? round(totalCost / costs.length, 6) : null,
            totalUsd: round(totalCost, 6),
        },
        statusCounts,
        verdictCounts,
        zeroClaimCases: results.filter((result) => result.claims === 0).length,
    };
}

type CategoryStats = {
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
    zeroClaims: number;
};

function computeCategories(results: CaseResult[]): CategoryStats[] {
    const names = [...new Set(results.map((result) => result.category))];
    return names.map((category) => {
        const group = results.filter((result) => result.category === category);
        const evaluated = group.filter((result) => result.expected !== "any");
        const correct = evaluated.filter((result) => result.predicted === result.expected).length;
        const abstention = group.filter((result) => result.expected === "insufficient_evidence");
        const injection = group.filter((result) => result.injection !== null);
        return {
            category,
            cases: group.length,
            evaluated: evaluated.length,
            correct,
            accuracy: ratio(correct, evaluated.length),
            abstentionExpected: abstention.length,
            abstentionCorrect: abstention.filter(
                (result) => result.predicted === "insufficient_evidence" || result.claims === 0,
            ).length,
            injectionCases: injection.length,
            injectionPassed: injection.filter((result) => result.injection?.passed).length,
            errors: group.filter((result) => result.status === "error" || result.status === "runner_error").length,
            zeroClaims: group.filter((result) => result.claims === 0).length,
        };
    });
}

// ---------------------------------------------------------------------------
// wydruk markdown
// ---------------------------------------------------------------------------

function printMarkdown(report: {
    meta: Record<string, unknown>;
    summary: Summary;
    classes: ClassMetrics[];
    categories: CategoryStats[];
    cases: CaseResult[];
}): void {
    const { meta, summary, classes, categories, cases } = report;

    console.log("## Ewaluacja PRAWDOWID");
    console.log("");
    console.log(`- tryb: **${String(meta["mode"])}**${meta["baseUrl"] ? ` (${String(meta["baseUrl"])})` : ""}`);
    console.log(`- uruchomiono: ${String(meta["runAt"])}`);
    console.log(`- przypadkÃ³w: ${summary.cases} (ocenianych werdyktowo: ${summary.evaluated}, "any": ${summary.anyExpected})`);
    console.log(`- czas przebiegu: ${String(meta["durationHuman"])}`);
    console.log(`- klucz Google Fact Check: ${meta["googleFactCheckKey"] ? "ustawiony" : "brak"}`);
    console.log("");
    console.log("### Metryki");
    console.log("");
    console.log("| metryka | wartoÅ›Ä‡ |");
    console.log("|---|---|");
    console.log(`| accuracy | ${pct(summary.accuracy)} (${summary.correct}/${summary.evaluated}) |`);
    console.log(`| macro-F1 | ${summary.macroF1 === null ? "â€”" : summary.macroF1.toFixed(3)} |`);
    console.log(`| trafnoÅ›Ä‡ wstrzymania (abstention) | ${pct(summary.abstention.rate)} (${summary.abstention.correct}/${summary.abstention.expected}) |`);
    console.log(`| pokrycie cytowaniami | ${pct(summary.citationCoverage)} (${summary.claimsWithEvidence}/${summary.claimsTotal} twierdzeÅ„) |`);
    console.log(`| injection pass | ${pct(summary.injection.rate)} (${summary.injection.passed}/${summary.injection.cases}) |`);
    console.log(`| trafienie gdziekolwiek w twierdzeniach | ${summary.anyClaimMatches}/${summary.evaluated} |`);
    console.log(`| mediana / p95 latencji | ${summary.latency.medianMs ?? "â€”"} ms / ${summary.latency.p95Ms ?? "â€”"} ms |`);
    console.log(`| koszt Å›redni / Å‚Ä…czny | ${money(summary.cost.meanUsd)} / ${money(summary.cost.totalUsd)} |`);
    console.log(`| dowody Å‚Ä…cznie | ${summary.evidenceTotal} |`);
    console.log("");
    console.log("### F1 per klasa (tylko przypadki z oczekiwaniem innym niÅ¼ \"any\")");
    console.log("");
    console.log("| klasa | n | precision | recall | F1 |");
    console.log("|---|---|---|---|---|");
    for (const item of classes) {
        console.log(
            `| ${item.verdict} | ${item.support} | ${item.precision.toFixed(3)} | ${item.recall.toFixed(3)} | ${item.f1.toFixed(3)} |`,
        );
    }
    console.log("");
    console.log("### Kategorie");
    console.log("");
    console.log("| kategoria | przypadki | oceniane | trafne | accuracy | abstencja | injection | bÅ‚Ä™dy | zero claimÃ³w |");
    console.log("|---|---|---|---|---|---|---|---|---|");
    for (const item of categories) {
        console.log(
            `| ${item.category} | ${item.cases} | ${item.evaluated} | ${item.correct} | ${pct(item.accuracy)} | ${item.abstentionCorrect}/${item.abstentionExpected} | ${item.injectionPassed}/${item.injectionCases} | ${item.errors} | ${item.zeroClaims} |`,
        );
    }
    console.log("");
    console.log("### Przypadki");
    console.log("");
    console.log("| id | kategoria | oczekiwane | przewidziane | status | claims | dowody | ms | koszt USD |");
    console.log("|---|---|---|---|---|---|---|---|---|");
    for (const item of cases) {
        console.log(
            `| ${item.id} | ${item.category} | ${item.expected} | ${item.predicted ?? "â€”"} | ${item.status}${item.httpStatus ? ` (${item.httpStatus})` : ""} | ${item.claims} | ${item.evidence} | ${item.latencyMs} | ${item.costUsd.toFixed(6)} |`,
        );
    }

    const misses = cases.filter(
        (item) => item.expected !== "any" && item.predicted !== item.expected,
    );
    if (misses.length > 0) {
        console.log("");
        console.log("### PomyÅ‚ki werdyktowe");
        console.log("");
        for (const item of misses) {
            console.log(
                `- **${item.id}** (${item.category}): oczekiwane \`${item.expected}\`, przewidziane \`${item.predicted ?? "brak"}\`${item.anyClaimMatched ? " â€” oczekiwany werdykt byÅ‚ na innym twierdzeniu" : ""}`,
            );
        }
    }

    const injectionMisses = cases.filter((item) => item.injection && !item.injection.passed);
    if (injectionMisses.length > 0) {
        console.log("");
        console.log("### Niezaliczony injection");
        console.log("");
        for (const item of injectionMisses) {
            const required = item.injection?.required.join(", ") ?? "";
            console.log(`- **${item.id}**: brak wzmianki (${required}) w ograniczeniach`);
        }
    }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function humanDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min ${seconds % 60} s`;
}

async function main(): Promise<void> {
    const startedAt = Date.now();
    const cases = await loadCases();
    if (cases.length === 0) {
        throw new Error(`Brak poprawnych przypadkÃ³w w ${CASES_FILE}.`);
    }

    console.log(
        `[eval] tryb: ${BASE_URL ? `HTTP ${BASE_URL}` : "bezpoÅ›redni verifyInput"}; przypadkÃ³w: ${cases.length}`,
    );

    const results: CaseResult[] = [];
    const models = new Set<string>();

    for (let index = 0; index < cases.length; index++) {
        const testCase = cases[index]!;
        const result = await runCase(testCase);
        results.push(result);
        for (const model of result.models) models.add(model);

        const marker = result.expected === "any" ? "any" : result.predicted === result.expected ? "OK " : "MISS";
        const suffix = result.error ? ` bÅ‚Ä…d: ${result.error}` : "";
        console.log(
            `[eval] ${String(index + 1).padStart(2, "0")}/${cases.length} ${marker} ${result.id} ` +
                `status=${result.status} oczekiwane=${result.expected} przewidziane=${result.predicted ?? "â€”"} ` +
                `claims=${result.claims} dowody=${result.evidence} ${result.latencyMs} ms${suffix}`,
        );
    }

    const classes = computeClasses(results);
    const summary = computeSummary(results, classes);
    const categories = computeCategories(results);
    const durationMs = Date.now() - startedAt;

    const report = {
        meta: {
            runAt: new Date(startedAt).toISOString(),
            mode: BASE_URL ? "http" : "direct",
            baseUrl: BASE_URL || null,
            casesFile: CASES_FILE,
            reportFile: REPORT_FILE,
            maxCases: MAX_CASES,
            durationMs,
            durationHuman: humanDuration(durationMs),
            googleFactCheckKey: Boolean(process.env["GOOGLE_FACT_CHECK_API_KEY"]?.trim()),
            openRouterKey: Boolean(process.env["OPENROUTER_API_KEY"]?.trim()),
            models: [...models],
        },
        summary,
        classes,
        categories,
        cases: results,
    };

    const body = JSON.stringify(report, null, 2);
    await mkdir(dirname(REPORT_FILE), { recursive: true });
    await writeFile(REPORT_FILE, `${body}\n`, "utf8");

    printMarkdown(report);

    console.log("");
    console.log(`Raport zapisany: ${REPORT_FILE}`);
    console.log(`Podsumowanie do slajdÃ³w: bun run scripts/eval-report.ts`);
}

try {
    await main();
} catch (error) {
    console.error(`[eval] przerwano: ${(error as Error).message}`);
    process.exitCode = 1;
}

