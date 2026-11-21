import { OpenRouter } from "@openrouter/sdk";
import type { DecisionsBoxQuestion, DecisionsChoiceQuestion, DecisionsNoulQuestion, DecisionsResponse, DecisionsScoreQuestion } from "@openrouter/sdk/models";

export class OpenRouterWrapper {
    private static client: OpenRouter;

    public static async Jev(state: string | any[] | {[k: string]: any;}, questions: {[k: string]: DecisionsBoxQuestion | DecisionsChoiceQuestion | DecisionsNoulQuestion | DecisionsScoreQuestion;}): Promise<DecisionsResponse> {
        if(this.client === undefined) {
            this.client = new OpenRouter({
                apiKey: process.env["OPENROUTER_API_KEY"]
            })
        }

        const res = await this.client.systemOne.create({
            decisionsRequest: {
                model: process.env["OPENROUTER_RLCD_MODEL"] ?? "typesafe/jev-latest",
                state, questions,
            },
        });

        return res;
    }
}