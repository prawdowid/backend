import { readFile } from "node:fs/promises";

type Verdict = "confirmed" | "false" | "misleading" | "insufficient_evidence" | "not_verifiable";
const VERDICTS: Verdict[] = ["confirmed", "false", "misleading", "insufficient_evidence", "not_verifiable"];

type CaseRow = { id: string; expected: Verdict | "any"; predicted: Verdict };
type Report = { cases: CaseRow[] };

const report = JSON.parse(await readFile("data/eval/report-rel.json", "utf8")) as Report;

// relationLookup outcomes measured on the same claim facts (supports=>confirmed,
// refutes=>false). case-09/10 were measured separately with the same claims.
const lookup: Record<string, Verdict> = {
    "case-01": "confirmed",
    "case-02": "confirmed",
    "case-03": "confirmed",
    "case-04": "false",
    "case-05": "false",
    "case-08": "confirmed",
    "case-09": "false",
    "case-10": "false",
    "case-11": "false",
    "case-12": "false",
    "case-13": "false",
    "case-14": "false",
};

function metrics(cases: CaseRow[]) {
    const evaluated = cases.filter((item) => item.expected !== "any");
    const correct = evaluated.filter((item) => item.predicted === item.expected).length;
    const rows = VERDICTS.map((verdict) => {
        let tp = 0, fp = 0, fn = 0;
        for (const item of evaluated) {
            const expected = item.expected === verdict;
            const predicted = item.predicted === verdict;
            if (expected && predicted) tp++;
            else if (!expected && predicted) fp++;
            else if (expected && !predicted) fn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return { verdict, support: tp + fn, tp, fp, fn, precision, recall, f1 };
    });
    const withSupport = rows.filter((row) => row.support > 0);
    const macro = withSupport.reduce((sum, row) => sum + row.f1, 0) / withSupport.length;
    return { correct, evaluated: evaluated.length, accuracy: correct / evaluated.length, macro, rows };
}

function fmt(label: string, result: ReturnType<typeof metrics>) {
    console.log(`\n${label}: accuracy=${(result.accuracy * 100).toFixed(1)}% (${result.correct}/${result.evaluated}) macro-F1=${result.macro.toFixed(3)}`);
    for (const row of result.rows) {
        if (row.support === 0) continue;
        console.log(`  ${row.verdict.padEnd(22)} n=${row.support} P=${row.precision.toFixed(3)} R=${row.recall.toFixed(3)} F1=${row.f1.toFixed(3)}`);
    }
}

fmt("A. baseline (core, no relationLookup)", metrics(report.cases));

// "Only fallback": core already skips Wikipedia when another source decided;
// in this run every lookuplike case was insufficient, so the set is the same.
const fallback = report.cases.map((item) =>
    item.predicted === "insufficient_evidence" && lookup[item.id]
        ? { ...item, predicted: lookup[item.id]! }
        : item,
);
fmt("B. only fallback (replace insufficient where lookup is decisive)", metrics(fallback));

// "Always": applies to every claim with s/o. Cases 01/02/07/20 were already
// confirmed; 06 is not measured and stays unchanged. Same result on this set.
const always = report.cases.map((item) =>
    lookup[item.id] ? { ...item, predicted: lookup[item.id]! } : item,
);
fmt("C. always (all claims with s/o; measured subset)", metrics(always));

// Sensitivity: a partial-truth post-processor maps case-13 (won, but in the
// second round) to `misleading` instead of `false`.
const withPartial = fallback.map((item) =>
    item.id === "case-13" ? { ...item, predicted: "misleading" as Verdict } : item,
);
fmt("D. fallback + partial-truth mapping for case-13", metrics(withPartial));
