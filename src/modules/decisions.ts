/**
 * Local decision-question contract.
 *
 * PRAWDOWID used to send these questions to TypeSafe Jev through OpenRouter.
 * They are now answered by DeepSeek, so the shapes live here instead of in an
 * external SDK. Keeping the names makes the call sites explicit about what the
 * model is being asked.
 */

export type DecisionQuestionType = "noul" | "choice" | "score" | "box";

export type DecisionQuestion = {
    type: DecisionQuestionType;
    /** Free-form instructions, or an object with fields such as claim/candidate. */
    instructions: unknown;
    /** For `choice`: option key -> description. For `score`: ordered labels. */
    criteria?: Record<string, string> | readonly string[];
};

export type DecisionsNoulQuestion = DecisionQuestion & { type: "noul" };
export type DecisionsChoiceQuestion = DecisionQuestion & { type: "choice" };
export type DecisionsScoreQuestion = DecisionQuestion & { type: "score" };
export type DecisionsBoxQuestion = DecisionQuestion & { type: "box" };

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = { type: "choice"; choice: string };
export type ScoreAnswer = { type: "score"; score: number };
export type BoxAnswer = { type: "box"; box: string[] };

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer | BoxAnswer;

export type DecisionsResponse = {
    answers: Record<string, DecisionAnswer>;
    usage?: { cost?: number };
};
