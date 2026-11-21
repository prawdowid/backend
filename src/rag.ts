import { keyValueStore } from "./cache";
import { env } from "./env";
import type {
  RagEntry,
  RagEntryInput,
  RagHit,
  RagLookup,
} from "./pipeline/types";

const INDEX_KEY = "rag:index:v1";
const ENTRY_PREFIX = "rag:entry:";
const LOCAL_MODEL = "local:hash-v1";
const LOCAL_DIMENSION = 384;
const OPENROUTER_EMBEDDINGS_URL =
  "https://openrouter.ai/api/v1/embeddings";

interface EmbeddingsResponse {
  data?: Array<{
    embedding?: number[] | string;
  }>;
  model?: string;
  usage?: {
    cost?: number;
  };
}

const entries = new Map<string, RagEntry>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

function normalizeForHash(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(text: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(normalizeForHash(text))
    .digest("hex");
}

function addToken(vector: number[], token: string): void {
  let hash = 2_166_136_261;

  for (let index = 0; index < token.length; index++) {
    hash = Math.imul(hash ^ token.charCodeAt(index), 16_777_619);
  }

  vector[Math.abs(hash) % LOCAL_DIMENSION]! += 1;
}

export function localEmbed(text: string): number[] {
  const vector = new Array<number>(LOCAL_DIMENSION).fill(0);
  const tokens =
    text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const [index, token] of tokens.entries()) {
    addToken(vector, token);

    if (index > 0) {
      addToken(vector, `${tokens[index - 1]}_${token}`);
    }
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) return vector;

  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index++) {
    const valueA = a[index]!;
    const valueB = b[index]!;

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function loadIndex(): Promise<void> {
  try {
    const keys = await keyValueStore.get<string[]>(INDEX_KEY);
    if (!Array.isArray(keys)) return;

    const stored = await Promise.all(
      keys.map((key) => keyValueStore.get<RagEntry>(ENTRY_PREFIX + key)),
    );

    for (const entry of stored) {
      if (entry && Array.isArray(entry.embedding)) {
        entries.set(entry.key, entry);
      }
    }
  } catch (error) {
    console.warn(
      "RAG index could not be loaded; starting with an empty index.",
      error instanceof Error ? error.message : error,
    );
  } finally {
    loaded = true;
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;

  loadPromise ??= loadIndex();
  await loadPromise;
}

async function embed(
  text: string,
): Promise<{ vector: number[]; model: string; costUsd: number }> {
  if (env.openRouterApiKey) {
    try {
      const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.openRouterApiKey}`,
          "Content-Type": "application/json",
          "X-Title": "backend",
        },
        body: JSON.stringify({
          model: env.embeddingModel,
          input: text,
          encoding_format: "float",
        }),
        signal: AbortSignal.timeout(env.aiTimeoutMs),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`OpenRouter embeddings ${response.status}: ${detail}`);
      }

      const data = (await response.json()) as EmbeddingsResponse;
      const embedding = data.data?.[0]?.embedding;

      if (!Array.isArray(embedding)) {
        throw new Error("OpenRouter returned no float embedding");
      }

      return {
        vector: embedding,
        model: `openrouter:${data.model ?? env.embeddingModel}`,
        costUsd: data.usage?.cost ?? 0,
      };
    } catch (error) {
      console.warn(
        "Embedding provider failed; using local hashed embeddings.",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    vector: localEmbed(text),
    model: LOCAL_MODEL,
    costUsd: 0,
  };
}

export async function write(
  input: RagEntryInput,
): Promise<{ key: string; costUsd: number }> {
  await ensureLoaded();

  const { vector, model, costUsd } = await embed(input.text);
  const key = hashText(input.text);

  const entry: RagEntry = {
    ...input,
    key,
    embedding: vector,
    embeddingModel: model,
    createdAt: new Date().toISOString(),
  };

  entries.set(key, entry);

  try {
    await keyValueStore.set(
      ENTRY_PREFIX + key,
      entry,
      env.ragTtlSeconds,
    );
    await keyValueStore.set(
      INDEX_KEY,
      [...entries.keys()],
      env.ragTtlSeconds,
    );
  } catch (error) {
    console.warn(
      "RAG entry could not be persisted; it remains in memory.",
      error instanceof Error ? error.message : error,
    );
  }

  return { key, costUsd };
}

export async function lookup(text: string): Promise<RagLookup> {
  await ensureLoaded();

  const exact = entries.get(hashText(text));
  if (exact) {
    return {
      hit: { entry: exact, score: 1 },
      model: exact.embeddingModel,
      costUsd: 0,
      bestScore: 1,
    };
  }

  if (entries.size === 0) {
    return { hit: null, model: LOCAL_MODEL, costUsd: 0 };
  }

  const { vector, model, costUsd } = await embed(text);

  const candidates = [...entries.values()]
    .filter((entry) => entry.embeddingModel === model)
    .map((entry) => ({
      entry,
      score: cosineSimilarity(vector, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, env.ragTopK);

  const best = candidates[0] as RagHit | undefined;

  return {
    hit: best && best.score >= env.ragMinScore ? best : null,
    model,
    costUsd,
    bestScore: best?.score,
  };
}
