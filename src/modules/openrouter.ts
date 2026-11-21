import { OpenRouter } from "@openrouter/sdk";
import type { DecisionsBoxQuestion, DecisionsChoiceQuestion, DecisionsNoulQuestion, DecisionsResponse, DecisionsScoreQuestion } from "@openrouter/sdk/models";

const EMBEDDING_MODEL =
    process.env["OPENROUTER_EMBEDDING_MODEL"] ?? "baai/bge-m3";

/** bge-m3 returns 1024-dim vectors. Change if you switch models. */
export const EMBEDDING_DIMENSIONS = 1024;

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

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
