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

export const env = {
  port: integerEnv("PORT", 3000, 1, 65_535),
  redisUrl: optional("REDIS_URL"),

  openRouterApiKey: optional("OPENROUTER_API_KEY"),
  deepseekModel: optional("DEEPSEEK_MODEL") ?? "deepseek/deepseek-chat",
  embeddingModel:
    optional("EMBEDDING_MODEL") ?? "openai/text-embedding-3-small",
  aiTimeoutMs: integerEnv("AI_TIMEOUT_MS", 20_000, 1_000),

  typeSafeApiKey: optional("TYPESAFE_API_KEY"),
  jevModel: optional("JEV_MODEL") ?? "jev-latest",
  jevCheckableThreshold: numberEnv("JEV_CHECKABLE_THRESHOLD", 0.6, 0, 1),

  ragTopK: integerEnv("RAG_TOP_K", 5, 1, 50),
  ragMinScore: numberEnv("RAG_MIN_SCORE", 0.82, 0, 1),
  ragTtlSeconds: integerEnv("RAG_TTL_SECONDS", 604_800, 1),

  requestBudgetUsd: numberEnv("REQUEST_BUDGET_USD", 0.05, 0),
} as const;
