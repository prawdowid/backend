import type { Verdict } from "./types";

/**
 * Document-level verdict for a compound statement.
 *
 * Rules (conservative, no guessing):
 * - confirmed + false => misleading (one true part, one false part)
 * - confirmed + insufficient => insufficient (absence of proof is not a lie)
 * - false + insufficient => false (one proven false conjunct falsifies the whole)
 * - a single secondary refute never reaches here as `false` (decide() already demotes it)
 * - zero claims => null (the request needs clarification, not a verdict)
 */
export function aggregateVerdicts(verdicts: readonly Verdict[]): Verdict | null {
    if (verdicts.length === 0) return null;

    const unique = new Set(verdicts);
    if (unique.size === 1) return verdicts[0]!;

    if (unique.has("misleading")) return "misleading";
    if (unique.has("confirmed") && unique.has("false")) return "misleading";
    if (unique.has("false")) return "false";
    if (unique.has("confirmed") && unique.has("insufficient_evidence")) {
        return "insufficient_evidence";
    }
    if (unique.has("not_verifiable") && unique.has("insufficient_evidence")) {
        return "insufficient_evidence";
    }

    return "insufficient_evidence";
}
