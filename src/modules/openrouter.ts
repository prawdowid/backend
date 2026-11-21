import { OpenRouter } from "@openrouter/sdk";
import type { DecisionsBoxQuestion, DecisionsChoiceQuestion, DecisionsNoulQuestion, DecisionsResponse, DecisionsScoreQuestion } from "@openrouter/sdk/models";

export class OpenRouterWrapper {
    private static client?: OpenRouter;

    private static getClient(): OpenRouter {
        return (this.client ??= new OpenRouter({
            apiKey: process.env["OPENROUTER_API_KEY"],
        }));
    }

    public static async Jev(state: string | any[] | {[k: string]: any;}, questions: {[k: string]: DecisionsBoxQuestion | DecisionsChoiceQuestion | DecisionsNoulQuestion | DecisionsScoreQuestion;}): Promise<DecisionsResponse> {
        const res = await this.getClient().systemOne.create({
            decisionsRequest: {
                model: process.env["OPENROUTER_RLCD_MODEL"] ?? "typesafe/jev-latest",
                state, questions,
            },
        });

        return res;
    }
}
