import type {
    DecisionsChoiceQuestion,
    DecisionsNoulQuestion,
} from "@openrouter/sdk/models";

/** TODO: lepszy prompt */
export const containsStatementsQuestion: DecisionsNoulQuestion = {
    type: "noul",
    instructions: "Does this text have anything that could be classified political/propaganda statements?",
    criteria: {
        true: "Yes it does",
        false: "No it doesn't",
    },
};

/** One cached statement: `id` is the Redis key, `text` is what Jev sees. */
export type StatementCandidate = {
    id: string;
    text: string;
    /** Optional metadata rendered next to the text (negation, date, source...). */
    details?: string;
};

export type StatementCacheQuestions = {
    /** true = the input is a direct meaning-level match for at least one candidate */
    statementMatchExists: DecisionsNoulQuestion;
    /** which candidate matches; always answers, so only trust it when the Noul is true */
    statementMatch: DecisionsChoiceQuestion;
};

/**
 * Builds the companion pair for a Redis-backed statement cache.
 *
 * - `statementMatch` (choice) picks one candidate from the list.
 * - `statementMatchExists` (noul) is the gate: Choice always picks something,
 *   so only use the choice when this says there is a real match.
 */
export function createStatementCacheQuestions(
    candidates: readonly StatementCandidate[],
): StatementCacheQuestions {
    if (candidates.length === 0) {
        throw new Error("createStatementCacheQuestions: candidates is empty");
    }

    // Jev Choice supports max 255 options; prefilter in Redis/embeddings first.
    if (candidates.length > 255) {
        throw new Error("createStatementCacheQuestions: max 255 candidates, prefilter first");
    }

    const criteria = Object.fromEntries(
        candidates.map(({ id, text, details }) => [id, details ? `${text} — ${details}` : text]),
    );

    return {
        statementMatchExists: {
            type: "noul",
            instructions: {
                question:
                    "Does `text` make the same claim as any entry in `candidates`? " +
                    "Answer true only for a direct meaning-level match: same subject, same relation, same object, same polarity. " +
                    "Partial overlap, merely related topics, or the opposite meaning is false.",
                candidates: candidates.map(({ text, details }) => details ? `${text} — ${details}` : text),
            },
        },
        statementMatch: {
            type: "choice",
            instructions: {
                question:
                    "Which candidate is the direct meaning-level match for `text`? " +
                    "The options below are the candidates; pick the one that makes the same claim.",
            },
            criteria,
        },
    };
}
