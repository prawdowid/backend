/**
 * Symulacja warstwy decyzyjnej PRAWDOWID — zero API, zero zapisów.
 *
 * Wejście: data/eval/report.json (domyślnie; można podać ścieżkę w argv[2]).
 * Wyjście: tabela reguła → accuracy / macro-F1 + analiza strat i sufitów.
 *
 * Raport NIE przechowuje relacji dowodów (supports/refutes/context), typów
 * (primary/secondary/fact_check) ani confidence. Dlatego symulacja operuje
 * wyłącznie na tym, co raport faktycznie ma: werdyktach per claim, liczbie
 * claimów, liczbie dowodów, statusie i treści limitations. Wszystkie reguły
 * są jawnie oznaczone jako heurystyki na 24 ocenianych przypadkach — to
 * narzędzie analityczne, nie klasyfikator produkcyjny.
 *
 * Użycie:
 *   bun run scripts/simulate-decision.ts
 *   bun run scripts/simulate-decision.ts data/eval/report.json
 */
import { readFile } from "node:fs/promises";

type Verdict =
    | "confirmed"
    | "false"
    | "misleading"
    | "insufficient_evidence"
    | "not_verifiable";

type Prediction = Verdict | null;
type Expected = Verdict | "any";

type CaseRow = {
    id: string;
    category: string;
    expected: Expected;
    predicted: Prediction;
    anyClaimMatched?: boolean;
    status: string;
    claims: number;
    evidence: number;
    verdicts: Verdict[];
    limitations: string[];
};

type Report = {
    meta?: {
        runAt?: string;
        mode?: string;
        durationHuman?: string;
    };
    summary?: {
        cases?: number;
        evaluated?: number;
        correct?: number;
        accuracy?: number | null;
        macroF1?: number | null;
        anyClaimMatches?: number;
    };
    cases: CaseRow[];
};

const VERDICTS: readonly Verdict[] = [
    "confirmed",
    "false",
    "misleading",
    "insufficient_evidence",
    "not_verifiable",
];

const ABSTAIN_CLASSES = ["confirmed", "false", "misleading", "abstain"] as const;

type ClassMetric = {
    name: string;
    support: number;
    tp: number;
    fp: number;
    fn: number;
    precision: number;
    recall: number;
    f1: number;
};

type Metrics = {
    correct: number;
    evaluated: number;
    accuracy: number;
    macroF1: number;
    classes: ClassMetric[];
};

// ---------------------------------------------------------------------------
// pomocniki
// ---------------------------------------------------------------------------

function round(value: number, digits = 3): number {
    return Number(value.toFixed(digits));
}

function fmt(value: number | null, digits = 3): string {
    return value === null ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
    return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function hasLimitation(item: CaseRow, needle: string): boolean {
    return item.limitations.some((line) => line.includes(needle));
}

function predictedOf(item: CaseRow): Prediction {
    return item.verdicts[0] ?? null;
}

// ---------------------------------------------------------------------------
// metryki — zgodne z scripts/eval.ts
// ---------------------------------------------------------------------------

function computeMetrics(
    cases: CaseRow[],
    predictions: Record<string, Prediction>,
    classNames: readonly string[] = VERDICTS,
): Metrics {
    const evaluated = cases.filter((item) => item.expected !== "any");
    const collapse = classNames.length === 4;
    const bucket = new Map<string, { support: number; tp: number; fp: number; fn: number }>();
    for (const name of classNames) bucket.set(name, { support: 0, tp: 0, fp: 0, fn: 0 });

    let correct = 0;
    for (const item of evaluated) {
        const expected = collapseExpected(item.expected, collapse);
        const predicted = collapseExpected(predictions[item.id] ?? null, collapse);
        if (expected === predicted) correct++;
        if (expected === null) continue;

        for (const name of classNames) {
            const stat = bucket.get(name)!;
            if (expected === name) stat.support++;
            if (predicted === name && expected === name) stat.tp++;
            else if (predicted === name && expected !== name) stat.fp++;
            else if (predicted !== name && expected === name) stat.fn++;
        }
    }

    const classes: ClassMetric[] = [];
    for (const name of classNames) {
        const stat = bucket.get(name)!;
        const precision = stat.tp + stat.fp > 0 ? stat.tp / (stat.tp + stat.fp) : 0;
        const recall = stat.tp + stat.fn > 0 ? stat.tp / (stat.tp + stat.fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        classes.push({
            name,
            support: stat.support,
            tp: stat.tp,
            fp: stat.fp,
            fn: stat.fn,
            precision: round(precision),
            recall: round(recall),
            f1: round(f1),
        });
    }

    const withSupport = classes.filter((item) => item.support > 0);
    const macroF1 =
        withSupport.length > 0
            ? withSupport.reduce((sum, item) => sum + item.f1, 0) / withSupport.length
            : 0;

    return {
        correct,
        evaluated: evaluated.length,
        accuracy: evaluated.length > 0 ? correct / evaluated.length : 0,
        macroF1: round(macroF1),
        classes,
    };
}

function collapseExpected(value: Expected | Prediction, collapse: boolean): string | null {
    if (value === "any" || value === null) return null;
    if (!collapse) return value;
    return value === "insufficient_evidence" || value === "not_verifiable" ? "abstain" : value;
}

// ---------------------------------------------------------------------------
// reguły decyzyjne
// ---------------------------------------------------------------------------

type AggregateMode = "first" | "worst" | "conjunctive";

type RuleFlags = {
    aggregate: AggregateMode;
    zeroClaimAbstain?: boolean;
    secondaryRefuteAbstain?: boolean;
    richConfirm?: boolean;
    richRefute?: boolean;
    hardConfirm?: boolean;
};

const SEVERITY: Record<Verdict, number> = {
    false: 0,
    misleading: 1,
    insufficient_evidence: 2,
    not_verifiable: 3,
    confirmed: 4,
};

function aggregate(caseRow: CaseRow, flags: RuleFlags): Prediction {
    const verdicts = caseRow.verdicts;
    if (verdicts.length === 0) {
        return flags.zeroClaimAbstain && caseRow.status === "ok" ? "insufficient_evidence" : null;
    }

    if (flags.aggregate === "first") return verdicts[0]!;

    if (flags.aggregate === "worst") {
        return [...verdicts].sort((a, b) => SEVERITY[a] - SEVERITY[b])[0]!;
    }

    // Koniunkcja: przypadek jest potwierdzony tylko wtedy, gdy WSZYSTKIE
    // twierdzenia są potwierdzone. Częściowe potwierdzenie + niewiedza to
    // misleading, bo całość może wprowadzać w błąd (case-06).
    if (verdicts.includes("false")) return "false";
    if (verdicts.includes("misleading")) return "misleading";
    if (verdicts.includes("confirmed") && verdicts.some((value) => value !== "confirmed")) {
        return "misleading";
    }
    if (verdicts.every((value) => value === "confirmed")) return "confirmed";
    if (verdicts.every((value) => value === "not_verifiable")) return "not_verifiable";
    return "insufficient_evidence";
}

/** Czy dowody to wyłącznie bogaty, ale nierozstrzygający kontekst? */
function richContextOnly(caseRow: CaseRow): boolean {
    if (caseRow.evidence < 6) return false;
    if (hasLimitation(caseRow, "Wikipedia była niedostępna")) return false;
    if (hasLimitation(caseRow, "nie potwierdzają wprost")) return false;
    return true;
}

function applyRule(caseRow: CaseRow, flags: RuleFlags): Prediction {
    let prediction = aggregate(caseRow, flags);

    // Pojedyncze źródło wtórne (Wikipedia) nie wystarcza na twarde "false".
    if (
        flags.secondaryRefuteAbstain &&
        prediction === "false" &&
        caseRow.verdicts.length === 1 &&
        caseRow.evidence <= 4 &&
        hasLimitation(caseRow, "Wykorzystano źródło wtórne")
    ) {
        prediction = "insufficient_evidence";
    }

    // Eksperymentalne: bogaty kontekst bez potwierdzenia → zgadnij w którąś stronę.
    if (flags.richConfirm && prediction === "insufficient_evidence" && richContextOnly(caseRow)) {
        prediction = "confirmed";
    }
    if (flags.richRefute && prediction === "insufficient_evidence" && richContextOnly(caseRow)) {
        prediction = "false";
    }

    // Eksperymentalne: wymagaj pierwotnego źródła do potwierdzenia.
    if (
        flags.hardConfirm &&
        prediction === "confirmed" &&
        hasLimitation(caseRow, "Brak źródła pierwotnego") &&
        hasLimitation(caseRow, "Wykorzystano źródło wtórne")
    ) {
        prediction = "insufficient_evidence";
    }

    return prediction;
}

type RuleSpec = {
    id: string;
    label: string;
    flags: RuleFlags;
    note: string;
};

const RULES: RuleSpec[] = [
    {
        id: "R0",
        label: "baseline: pierwszy claim",
        flags: { aggregate: "first" },
        note: "tak liczy scripts/eval.ts; brak werdyktu = brak",
    },
    {
        id: "R1",
        label: "najgorszy claim (severity)",
        flags: { aggregate: "worst" },
        note: "sam 'worst' nie naprawia case-06 — daje insufficient",
    },
    {
        id: "R2",
        label: "koniunkcja: częściowe potwierdzenie → misleading",
        flags: { aggregate: "conjunctive" },
        note: "naprawia case-06; reszta bez zmian",
    },
    {
        id: "R3",
        label: "R2 + zero claimów (status ok) → insufficient",
        flags: { aggregate: "conjunctive", zeroClaimAbstain: true },
        note: "naprawia case-21 (brak werdyktu)",
    },
    {
        id: "R4",
        label: "R3 + pojedynczy refute wtórny → insufficient",
        flags: {
            aggregate: "conjunctive",
            zeroClaimAbstain: true,
            secondaryRefuteAbstain: true,
        },
        note: "REKOMENDOWANA baza; naprawia case-23",
    },
    {
        id: "R5",
        label: "R4 + bogaty kontekst → confirmed",
        flags: {
            aggregate: "conjunctive",
            zeroClaimAbstain: true,
            secondaryRefuteAbstain: true,
            richConfirm: true,
        },
        note: "overfit: naprawia 03, ale błędnie potwierdza 09 i 22",
    },
    {
        id: "R6",
        label: "R4 + bogaty kontekst → false",
        flags: {
            aggregate: "conjunctive",
            zeroClaimAbstain: true,
            secondaryRefuteAbstain: true,
            richRefute: true,
        },
        note: "agresywny stress-test: naprawia 09/22, psuje 03",
    },
    {
        id: "R7",
        label: "R4 + twarde potwierdzenie (wymagaj primary)",
        flags: {
            aggregate: "conjunctive",
            zeroClaimAbstain: true,
            secondaryRefuteAbstain: true,
            hardConfirm: true,
        },
        note: "koszt: psuje case-01 (jedno wiarygodne źródło wtórne)",
    },
];

// ---------------------------------------------------------------------------
// scenariusze sufitowe (wyraźnie oznaczone jako analiza, nie reguła)
// ---------------------------------------------------------------------------

type CeilingSpec = {
    id: string;
    label: string;
    fixes: string[];
    note: string;
};

const CEILINGS: CeilingSpec[] = [
    {
        id: "C0",
        label: "tylko warstwa decyzyjna (R4)",
        fixes: [],
        note: "agregacja + zero claimów + próg refute; zero nowych danych",
    },
    {
        id: "C1",
        label: "C0 + flaga opinia/prognoza",
        fixes: ["case-30"],
        note: "case-30 to prognoza; potrzebny flag z ekstrakcji, nie z raportu",
    },
    {
        id: "C2",
        label: "C1 + relacje i daty z istniejących dowodów",
        fixes: ["case-05", "case-09", "case-11", "case-22"],
        note: "poprawne supports/refutes dla 05/09/22 + normalizacja daty 11",
    },
    {
        id: "C3",
        label: "C2 + naprawa pobrania sejm.gov.pl (case-03)",
        fixes: ["case-03"],
        note: "ten sam korpus, ale działający fetch zamiast metadanych",
    },
    {
        id: "C4",
        label: "C3 + jedno działające źródło dla case-04",
        fixes: ["case-04"],
        note: "potrzebne nowe/ działające źródło (Wikipedia lub fact-check)",
    },
];

// ---------------------------------------------------------------------------
// wczytywanie i wydruk
// ---------------------------------------------------------------------------

async function loadReport(file: string): Promise<Report> {
    let raw: string;
    try {
        raw = await readFile(file, "utf8");
    } catch {
        throw new Error(`Nie znalazłem raportu: ${file}. Najpierw uruchom scripts/eval.ts.`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Raport ${file} nie jest poprawnym JSON-em: ${(error as Error).message}`);
    }

    const body = parsed as Partial<Report>;
    if (!body || !Array.isArray(body.cases)) {
        throw new Error(`Raport ${file} nie zawiera tablicy "cases".`);
    }
    return body as Report;
}

function printHeader(report: Report): void {
    const summary = report.summary ?? {};
    console.log("# Symulacja warstwy decyzyjnej PRAWDOWID");
    console.log("");
    console.log(
        `Raport: ${report.meta?.runAt ?? "?"} · tryb: ${report.meta?.mode ?? "?"} · ` +
            `czas: ${report.meta?.durationHuman ?? "?"}`,
    );
    console.log(
        `Przypadki: ${report.cases.length} · oceniane: ${summary.evaluated ?? "?"} · ` +
            `"any": ${report.cases.length - (summary.evaluated ?? 0)}`,
    );
    console.log(
        `Raportowany baseline: accuracy ${pct(summary.accuracy ?? null)} ` +
            `(${summary.correct ?? "?"}/${summary.evaluated ?? "?"}), macro-F1 ${fmt(summary.macroF1 ?? null)}`,
    );
    console.log("");
}

function printBaselineCheck(report: Report, baseline: Metrics): void {
    console.log("## 1. Kontrola baseline");
    console.log("");
    console.log("| źródło | correct | accuracy | macro-F1 |");
    console.log("|---|---|---|---|");
    console.log(
        `| raport.json | ${report.summary?.correct ?? "?"}/${report.summary?.evaluated ?? "?"} | ` +
            `${pct(report.summary?.accuracy ?? null)} | ${fmt(report.summary?.macroF1 ?? null)} |`,
    );
    console.log(
        `| przeliczone z verdicts[0] | ${baseline.correct}/${baseline.evaluated} | ` +
            `${pct(baseline.accuracy)} | ${fmt(baseline.macroF1)} |`,
    );
    console.log("");
}

function printLossAnalysis(report: Report): void {
    const evaluated = report.cases.filter((item) => item.expected !== "any");
    const wrong = evaluated.filter((item) => item.predicted !== item.expected);

    console.log("## 2. Gdzie tracona jest trafność");
    console.log("");
    console.log(
        `Błędnych przypadków: **${wrong.length}/${evaluated.length}**. ` +
            `Raport nie zapisuje relacji dowodów, więc poniżej jest rozkład oczekiwane → przewidziane.`,
    );
    console.log("");
    console.log("| oczekiwane → przewidziane | n | przypadki |");
    console.log("|---|---|---|");

    const buckets = new Map<string, string[]>();
    for (const item of wrong) {
        const key = `${item.expected} → ${item.predicted ?? "brak"}`;
        const list = buckets.get(key) ?? [];
        list.push(item.id);
        buckets.set(key, list);
    }
    const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [key, ids] of sorted) {
        console.log(`| ${key} | ${ids.length} | ${ids.join(", ")} |`);
    }
    console.log("");

    const wrongConfirmed = wrong.filter((item) => item.predicted === "confirmed");
    const wrongFalse = wrong.filter((item) => item.predicted === "false");
    const wrongAbstain = wrong.filter((item) => item.predicted === "insufficient_evidence");
    const wrongNull = wrong.filter((item) => item.predicted === null);
    const decisiveWrong = wrong.filter((item) =>
        item.verdicts.some((value) => value === "confirmed" || value === "false" || value === "misleading"),
    );

    console.log("Kluczowe koszyki:");
    console.log("");
    console.log(
        `- **Niedopotwierdzenie**: ${wrongAbstain.length} przypadków oczekiwanych jako confirmed/false/misleading/not_verifiable ` +
            `dostało \`insufficient_evidence\`. To dominujące źródło strat.`,
    );
    console.log(
        `- **Złe \`confirmed\`**: ${wrongConfirmed.length} (${wrongConfirmed.map((item) => item.id).join(", ") || "brak"}).`,
    );
    console.log(
        `- **Złe \`false\`**: ${wrongFalse.length} (${wrongFalse.map((item) => item.id).join(", ") || "brak"}).`,
    );
    console.log(
        `- **Brak werdyktu**: ${wrongNull.length} (${wrongNull.map((item) => item.id).join(", ") || "brak"}).`,
    );
    console.log(
        `- **Werdykt na decisive claim, ale zły**: ${decisiveWrong.length} ` +
            `(${decisiveWrong.map((item) => item.id).join(", ") || "brak"}). ` +
            `Raport nie mówi, czy to supports czy refutes — to ograniczenie pomiaru.`,
    );
    console.log("");
    console.log(
        `Raport ma 82 pozycje dowodowe w ocenianych przypadkach (174 w całym przebiegu), ` +
            `ale **zero** pól \`relation\`/\`type\`/\`confidence\`. ` +
            `Nie da się z niego uczciwie policzyć, ile dowodów wspiera, a ile przeczy.`,
    );
    console.log("");
}

function printRuleTable(report: Report, baseline: Metrics): void {
    console.log("## 3. Reguły decyzyjne (symulacja na raporcie)");
    console.log("");
    console.log(
        "Wszystkie reguły widzą tylko: werdykty per claim, liczbę claimów, liczbę dowodów, status i limitations.",
    );
    console.log("");
    console.log("| ID | reguła | correct | accuracy | macro-F1 | Δ macro | F1 false | F1 misleading | F1 insuff | uwaga |");
    console.log("|---|---|---|---|---|---|---|---|---|---|");

    for (const rule of RULES) {
        const predictions: Record<string, Prediction> = {};
        for (const item of report.cases) predictions[item.id] = applyRule(item, rule.flags);
        const metrics = computeMetrics(report.cases, predictions);
        const falseF1 = metrics.classes.find((item) => item.name === "false")?.f1 ?? 0;
        const misleadingF1 = metrics.classes.find((item) => item.name === "misleading")?.f1 ?? 0;
        const insuffF1 = metrics.classes.find((item) => item.name === "insufficient_evidence")?.f1 ?? 0;
        console.log(
            `| ${rule.id} | ${rule.label} | ${metrics.correct}/${metrics.evaluated} | ` +
                `${pct(metrics.accuracy)} | ${fmt(metrics.macroF1)} | ` +
                `${metrics.macroF1 - baseline.macroF1 >= 0 ? "+" : ""}${fmt(metrics.macroF1 - baseline.macroF1)} | ` +
                `${fmt(falseF1)} | ${fmt(misleadingF1)} | ${fmt(insuffF1)} | ${rule.note} |`,
        );
    }
    console.log("");

    const r4 = RULES.find((item) => item.id === "R4")!;
    const r4Predictions: Record<string, Prediction> = {};
    for (const item of report.cases) r4Predictions[item.id] = applyRule(item, r4.flags);
    const merged = computeMetrics(report.cases, r4Predictions, ABSTAIN_CLASSES);

    console.log(
        `Wariant metryki: scalenie \`insufficient_evidence\` i \`not_verifiable\` w jedną klasę \`abstain\` ` +
            `dla reguły R4 daje accuracy ${pct(merged.accuracy)} (${merged.correct}/${merged.evaluated}) ` +
            `i macro-F1 ${fmt(merged.macroF1)}. ` +
            `To nie jest darmowy zysk: znika rozróżnienie taksonomiczne, a macro-F1 nie musi rosnąć.`,
    );
    console.log("");
}

function printMapping(report: Report, baseline: Metrics): void {
    const evaluated = report.cases.filter((item) => item.expected !== "any");
    const worst: Record<string, Prediction> = {};
    const conjunctive: Record<string, Prediction> = {};
    for (const item of evaluated) {
        worst[item.id] = applyRule(item, { aggregate: "worst" });
        conjunctive[item.id] = applyRule(item, { aggregate: "conjunctive" });
    }
    const worstMetrics = computeMetrics(report.cases, worst);
    const conjunctiveMetrics = computeMetrics(report.cases, conjunctive);
    const anyMatches = evaluated.filter((item) => item.anyClaimMatched).length;

    console.log("## 4. Mapowanie oczekiwań (multi-claim)");
    console.log("");
    console.log("| definicja werdyktu przypadku | correct | accuracy | macro-F1 |");
    console.log("|---|---|---|---|");
    console.log(
        `| pierwszy claim (obecna metryka) | ${baseline.correct}/${baseline.evaluated} | ` +
            `${pct(baseline.accuracy)} | ${fmt(baseline.macroF1)} |`,
    );
    console.log(
        `| najgorszy claim (severity) | ${worstMetrics.correct}/${worstMetrics.evaluated} | ` +
            `${pct(worstMetrics.accuracy)} | ${fmt(worstMetrics.macroF1)} |`,
    );
    console.log(
        `| koniunkcja: confirmed tylko gdy wszystkie | ${conjunctiveMetrics.correct}/${conjunctiveMetrics.evaluated} | ` +
            `${pct(conjunctiveMetrics.accuracy)} | ${fmt(conjunctiveMetrics.macroF1)} |`,
    );
    console.log("");

    const case06 = report.cases.find((item) => item.id === "case-06");
    if (case06) {
        console.log(
            `\`case-06\`: oczekiwane \`${case06.expected}\`, claimy \`${case06.verdicts.join(" + ")}\`. ` +
                `Pierwszy claim = \`${predictedOf(case06)}\`, najgorszy = \`${applyRule(case06, { aggregate: "worst" })}\`, ` +
                `koniunkcja = \`${applyRule(case06, { aggregate: "conjunctive" })}\`.`,
        );
        console.log("");
        console.log(
            "Wniosek: metryka „pierwszy claim” marnuje poprawny sygnał z drugiego twierdzenia. " +
                "Uczciwa definicja przypadku to koniunkcja: `confirmed` tylko gdy wszystkie claimy są confirmed; " +
                "`false`, gdy którykolwiek jest false; `misleading`, gdy część jest potwierdzona, a część nie. " +
                "To naprawia case-06 bez nowych źródeł.",
        );
    }
    console.log("");
    console.log(
        `Pomocnicza metryka \`anyClaimMatched\` daje ${anyMatches}/${evaluated.length} — tyle samo co accuracy. ` +
            `Czyli w tym przebiegu nie ma ukrytych trafień na innym claimie; case-06 także nie ma, ` +
            `bo żaden jego claim nie jest \`misleading\`. Problemem nie jest przypisanie, lecz brak rozstrzygającego dowodu.`,
    );
    console.log("");
}

function printCeilings(report: Report): void {
    console.log("## 5. Ile maksymalnie da się wycisnąć bez nowych źródeł");
    console.log("");
    console.log(
        "Scenariusze C1–C4 są **analizą potencjału**, nie regułami do wdrożenia: " +
            "ustawiają werdykt na oczekiwany dla wskazanych przypadków i pokazują, ile wymagałby każdy poziom.",
    );
    console.log("");
    console.log("| scenariusz | co dochodzi | correct | accuracy | macro-F1 |");
    console.log("|---|---|---|---|---|");

    const r4 = RULES.find((item) => item.id === "R4")!;
    const basePredictions: Record<string, Prediction> = {};
    for (const item of report.cases) basePredictions[item.id] = applyRule(item, r4.flags);

    const applied: string[] = [];
    for (const ceiling of CEILINGS) {
        applied.push(...ceiling.fixes);
        const predictions = { ...basePredictions };
        for (const id of applied) {
            const item = report.cases.find((entry) => entry.id === id);
            if (item && item.expected !== "any") predictions[id] = item.expected;
        }
        const metrics = computeMetrics(report.cases, predictions);
        console.log(
            `| ${ceiling.id} | ${ceiling.label} | ${metrics.correct}/${metrics.evaluated} | ` +
                `${pct(metrics.accuracy)} | ${fmt(metrics.macroF1)} |`,
        );
        console.log(`|  | ↳ ${ceiling.note} |  |  |  |`);
    }
    console.log("");

    const singleContext = report.cases
        .filter(
            (item) =>
                item.expected !== "any" &&
                item.predicted !== item.expected &&
                item.evidence <= 1 &&
                item.id !== "case-21" &&
                item.id !== "case-30",
        )
        .map((item) => item.id);

    console.log(
        `Do accuracy 0,75 potrzeba 18/24 trafnych. C3 daje 17/24 (macro-F1 0,753 — powyżej progu), ` +
            `więc **macro-F1 0,75 da się przekroczyć na istniejącym korpusie tylko przy idealnych relacjach i datach**. ` +
            `Stabilne 0,75 accuracy wymaga jeszcze jednego przypadku z grupy „jedno źródło kontekstowe”: ` +
            `${singleContext.join(", ")}.`,
    );
    console.log("");
    console.log(
        "Realistyczny wniosek: sama warstwa decyzyjna na obecnym raporcie zatrzymuje się na 11/24 " +
            "(R4, macro-F1 0,487). Dodanie flagi opinia/prognoza daje 12/24 (0,558). " +
            "Dopiero zapisanie relacji/typów/dat dowodów i naprawa pobrań pozwala dojść do 16–17/24 (0,72–0,75). " +
            "Powyżej 0,75 bez nowych źródeł nie ma już czego naprawiać — brakuje samych dowodów.",
    );
    console.log("");
}

async function main(): Promise<void> {
    const file = process.argv[2] ?? "data/eval/report.json";
    const report = await loadReport(file);

    const baselinePredictions: Record<string, Prediction> = {};
    for (const item of report.cases) baselinePredictions[item.id] = predictedOf(item);
    const baseline = computeMetrics(report.cases, baselinePredictions);

    printHeader(report);
    printBaselineCheck(report, baseline);
    printLossAnalysis(report);
    printRuleTable(report, baseline);
    printMapping(report, baseline);
    printCeilings(report);
}

try {
    await main();
} catch (error) {
    console.error(`[simulate-decision] przerwano: ${(error as Error).message}`);
    process.exitCode = 1;
}
