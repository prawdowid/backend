import { BunRedisStore, MemoryStore } from "@clov-std/kv-store";
import type { KvStore } from "@clov-std/kv-store";
import { Elysia } from "elysia";
import { env } from "./env";

type CacheBackend = "memory" | "redis";

interface CacheSetup {
  store: KvStore;
  backend: CacheBackend;
}

async function createCache(): Promise<CacheSetup> {
  if (!env.redisUrl) {
    return { store: new MemoryStore(), backend: "memory" };
  }

  const store = new BunRedisStore(env.redisUrl, {
    connectionTimeout: 2_000,
    maxRetries: 1,
    autoReconnect: true,
    enableOfflineQueue: false,
  });

  try {
    await store.connect();
    return { store, backend: "redis" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Redis is unavailable (${reason}); using the in-memory cache.`);
    store.close();
    return { store: new MemoryStore(), backend: "memory" };
  }
}

const { store, backend } = await createCache();

export const cache = store;
export const cacheBackend = backend;

export const cachePlugin = new Elysia({ name: "cache" })
  .decorate("cache", cache)
  .onStop(() => {
    cache.close?.();
  });
