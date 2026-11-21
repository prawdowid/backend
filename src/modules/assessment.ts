import { DeepSeek, type Verdict } from "./deepseek";
import type { FactCheckResult } from "./fact-check";

export type AssessedFact = FactCheckResult & {
    question: string;
    verdict: Verdict;
    summary: string;
    assessed: boolean;
};

export async function assessFact(result: FactCheckResult, question: string): Promise<AssessedFact> {
    if (result.reviews.length === 0 && result.sources.length === 0) {
        return {
            ...result,
            question,
            verdict: "unclear",
            summary: "Brak jednoznacznej odpowiedzi. Nie znaleziono źródeł ani opublikowanych weryfikacji; brak wyników nie oznacza, że twierdzenie jest prawdziwe ani fałszywe.",
            assessed: true,
        };
    }

    try {
        const assessment = await DeepSeek.AssessClaim(result, question);
        return {
            ...result,
            question,
            sources: assessment.relevantSources.map((index) => result.sources[index - 1]!),
            verdict: assessment.verdict,
            summary: assessment.summary,
            assessed: true,
        };
    } catch (error) {
        console.error("Claim assessment failed.", error);
        return {
            ...result,
            question,
            sources: [],
            verdict: "unclear",
            summary: "Brak jednoznacznej odpowiedzi. Nie udało się automatycznie ocenić znalezionych źródeł, więc nie traktuj tego twierdzenia jako potwierdzonego.",
            assessed: false,
        };
    }
}
