import { OpenRouterWrapper, cosineSimilarity } from "../modules/openrouter";
import type { SourceDoc, SourceHit } from "../pipeline/types";
import { SOURCE_DOCS } from "./manifest";

const BATCH_SIZE = 32;
const DEFAULT_K = 10;

/** Cached corpus vectors; survives the whole process lifetime. */
let corpusVectors: number[][] | null = null;
/** In-flight embedding run, so concurrent searches share one pass. */
let corpusEmbedding: Promise<number[][]> | null = null;
/** Network failures are logged once, not per request. */
let warned = false;

function embedText(doc: SourceDoc): string {
    return `${doc.title}. ${doc.summary} ${doc.topics.join(" ")}`;
}

function warnOnce(error: unknown): void {
    if (warned) return;
    warned = true;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sources] embedding nieudany, zwracam pustą listę: ${message}`);
}

function domainOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

async function embedCorpus(): Promise<number[][]> {
    const vectors: number[][] = [];

    for (let offset = 0; offset < SOURCE_DOCS.length; offset += BATCH_SIZE) {
        const batch = SOURCE_DOCS.slice(offset, offset + BATCH_SIZE);
        const batchVectors = await OpenRouterWrapper.Embed(batch.map(embedText));
        vectors.push(...batchVectors);
    }

    return vectors;
}

function getCorpusVectors(): Promise<number[][]> {
    if (corpusVectors) return Promise.resolve(corpusVectors);

    corpusEmbedding ??= embedCorpus()
        .then((vectors) => {
            corpusVectors = vectors;
            return vectors;
        })
        .catch((error: unknown) => {
            // Reset so a later call can retry once the network is back.
            corpusEmbedding = null;
            throw error;
        });

    return corpusEmbedding;
}

/**
 * Embeds the query, compares it against the whole manifest and returns the best matches.
 * Never throws: on embedding failure it logs once and returns an empty list.
 */
export async function searchSources(query: string, k: number = DEFAULT_K): Promise<SourceHit[]> {
    if (SOURCE_DOCS.length === 0) return [];

    const limit = Math.max(0, Math.trunc(k));
    if (limit === 0) return [];

    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    let queryVector: number[];
    let vectors: number[][];

    try {
        const embedded = await Promise.all([
            OpenRouterWrapper.Embed(trimmed),
            getCorpusVectors(),
        ]);
        queryVector = embedded[0];
        vectors = embedded[1];
    } catch (error) {
        warnOnce(error);
        return [];
    }

    const hits: SourceHit[] = [];

    for (let i = 0; i < SOURCE_DOCS.length; i++) {
        const doc = SOURCE_DOCS[i];
        const vector = vectors[i];
        if (!doc || !vector || vector.length === 0) continue;
        hits.push({ doc, score: cosineSimilarity(queryVector, vector) });
    }

    hits.sort((a, b) => b.score - a.score);

    return hits.slice(0, limit);
}

export function getSource(id: string): SourceDoc | undefined {
    return SOURCE_DOCS.find((doc) => doc.id === id);
}

export async function corpusStats(): Promise<{
    total: number;
    domains: number;
    byType: Record<string, number>;
}> {
    const domains = new Set<string>();
    const byType: Record<string, number> = {};

    for (const doc of SOURCE_DOCS) {
        domains.add(domainOf(doc.url));
        byType[doc.type] = (byType[doc.type] ?? 0) + 1;
    }

    return { total: SOURCE_DOCS.length, domains: domains.size, byType };
}
