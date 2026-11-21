function optional(name: string): string | undefined {
  return Bun.env[name]?.trim() || undefined;
}

function numberEnv(
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const raw = Bun.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name} "${raw}": expected a number`);
  }
  if (min !== undefined && value < min) {
    throw new Error(`Invalid ${name} "${raw}": expected >= ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new Error(`Invalid ${name} "${raw}": expected <= ${max}`);
  }

  return value;
}

function integerEnv(
  name: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const value = numberEnv(name, fallback, min, max);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${name} "${Bun.env[name]}": expected an integer`);
  }
  return value;
}

const transcriptProvider = optional("TRANSCRIPT_PROVIDER") ?? "auto";

if (
  transcriptProvider !== "auto" &&
  transcriptProvider !== "openrouter" &&
  transcriptProvider !== "deepseek"
) {
  throw new Error(
    `Invalid TRANSCRIPT_PROVIDER "${transcriptProvider}": expected auto, openrouter, or deepseek`,
  );
}

export const env = {
  port: integerEnv("PORT", 3000, 1, 65_535),
  redisUrl: optional("REDIS_URL"),

  deepseekApiKey: optional("DEEPSEEK_API_KEY"),
  deepseekBaseUrl:
    optional("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com",
  deepseekModel: optional("DEEPSEEK_MODEL") ?? "deepseek-flash",
  deepseekInputUsdPer1M: numberEnv(
    "DEEPSEEK_INPUT_USD_PER_1M_TOKENS",
    0.3,
    0,
  ),
  deepseekOutputUsdPer1M: numberEnv(
    "DEEPSEEK_OUTPUT_USD_PER_1M_TOKENS",
    1.2,
    0,
  ),
  deepseekAsrUsdPerHour: numberEnv("DEEPSEEK_ASR_USD_PER_HOUR", 0.116, 0),

  openRouterApiKey: optional("OPENROUTER_API_KEY"),
  embeddingModel:
    optional("EMBEDDING_MODEL") ?? "openai/text-embedding-3-small",
  transcriptProvider,
  transcriptModel:
    optional("TRANSCRIPT_MODEL") ?? "openai/whisper-large-v3",
  aiTimeoutMs: integerEnv("AI_TIMEOUT_MS", 20_000, 1_000),

  typeSafeApiKey: optional("TYPESAFE_API_KEY"),
  jevModel: optional("JEV_MODEL") ?? "jev-latest",
  jevCheckableThreshold: numberEnv("JEV_CHECKABLE_THRESHOLD", 0.6, 0, 1),

  ragTopK: integerEnv("RAG_TOP_K", 5, 1, 50),
  ragMinScore: numberEnv("RAG_MIN_SCORE", 0.82, 0, 1),
  ragTtlSeconds: integerEnv("RAG_TTL_SECONDS", 604_800, 1),

  requestBudgetUsd: numberEnv("REQUEST_BUDGET_USD", 0.05, 0),
} as const;
