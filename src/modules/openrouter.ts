import { OpenRouter } from "@openrouter/sdk";
import type { DecisionsBoxQuestion, DecisionsChoiceQuestion, DecisionsNoulQuestion, DecisionsResponse, DecisionsScoreQuestion } from "@openrouter/sdk/models";

const EMBEDDING_MODEL =
    process.env["OPENROUTER_EMBEDDING_MODEL"] ?? "baai/bge-m3";

/** bge-m3 returns 1024-dim vectors. Change if you switch models. */
export const EMBEDDING_DIMENSIONS = 1024;

export type ChatOptions = {
    model?: string;
    system?: string;
    /** Default false: DeepSeek reasons itself to death on extraction prompts. */
    reasoning?: boolean;
    maxTokens?: number;
    temperature?: number;
};

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

    /** Plain chat completion on OpenRouter; extraction/JSON tasks. */
    public static async Chat(user: string, options: ChatOptions = {}): Promise<string> {
        const res = await this.getClient().chat.send({
            chatRequest: {
                model:
                    options.model ??
                    process.env["OPENROUTER_EXTRACT_MODEL"] ??
                    "deepseek/deepseek-v4.1-flash",
                messages: [
                    ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
                    { role: "user" as const, content: user },
                ],
                maxTokens: options.maxTokens ?? 6000,
                temperature: options.temperature ?? 0,
                reasoning: { enabled: options.reasoning ?? false },
            },
        });

        const choice = res.choices[0];
        const content = choice?.message.content;
        const text = typeof content === "string" ? content : "";

        if (process.env["PIPELINE_DEBUG"] === "1") {
            console.log(
                `[openrouter] model=${res.model} finish=${choice?.finishReason ?? "?"} in=${res.usage?.promptTokens ?? "?"} out=${res.usage?.completionTokens ?? "?"} reasoning=${res.usage?.completionTokensDetails?.reasoningTokens ?? 0} content=${text.length}`,
            );
        }

        return text;
    }

    /** One vector for one string. */
    public static Embed(input: string): Promise<number[]>;
    /** One vector per string, in the same order as the input. */
    public static Embed(input: string[]): Promise<number[][]>;
    public static async Embed(input: string | string[]): Promise<number[] | number[][]> {
        const res = await this.getClient().embeddings.generate({
            requestBody: {
                model: EMBEDDING_MODEL,
                input,
                encodingFormat: "float",
            },
        });

        // SDK types this as object | string; float encoding should always be the object.
        if (typeof res === "string") {
            throw new Error("Embeddings: expected JSON body, got string");
        }

        const vectors = res.data
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
            .map((item) => {
                if (typeof item.embedding === "string") {
                    throw new Error("Embeddings: expected float vector, got base64");
                }
                return item.embedding;
            });

        return Array.isArray(input) ? vectors : vectors[0]!;
    }
}

/** Cosine similarity in [-1, 1]. Both vectors must be normalized size. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i]! * b[i]!;
        normA += a[i]! * a[i]!;
        normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
}
