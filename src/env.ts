const port = Number(Bun.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PORT "${Bun.env.PORT}": expected an integer from 1 to 65535`);
}

export const env = {
  port,
  redisUrl: Bun.env.REDIS_URL?.trim() || undefined,
} as const;
