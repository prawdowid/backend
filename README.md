# backend

Minimal [ElysiaJS](https://elysiajs.com/) + [Bun](https://bun.sh/) API with an optional Redis cache.

## Requirements

- Bun 1.4+

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

Bun loads `.env` automatically. The server listens on `http://localhost:3000` by default.

### Environment

| Variable    | Default | Description                                                                 |
| ----------- | ------- | --------------------------------------------------------------------------- |
| `PORT`      | `3000`  | HTTP port.                                                                  |
| `REDIS_URL` | empty   | Optional Redis/Valkey URL. When empty, the cache stays in memory.           |

Example:

```dotenv
PORT=3000
REDIS_URL=redis://localhost:6379
```

If `REDIS_URL` is set but Redis cannot be reached at startup, the app logs a warning and falls back to the in-memory cache instead of refusing to boot.

## Endpoints

```bash
curl http://localhost:3000/
# {"message":"Hello World"}

curl http://localhost:3000/health
# {"status":"ok","cache":"memory"}

curl -i http://localhost:3000/cached
# x-cache: MISS (memory)
# {"message":"Hello World","generatedAt":"..."}

curl -i http://localhost:3000/cached
# x-cache: HIT (memory)
# {"message":"Hello World","generatedAt":"..."}
```

`/cached` is a small cache demo: the value is stored for 10 seconds, and the `x-cache` header shows whether it came from the cache.

## Cache

The cache is provided by [`@clov-std/kv-store`](https://www.npmjs.com/package/@clov-std/kv-store), which uses Bun's native Redis client. It is exposed to route handlers as `cache`:

```ts
.get("/example", async ({ cache }) => {
  const value = await cache.get<string>("key");
  await cache.set("key", "value", 60); // TTL in seconds
  return { value };
});
```

## Scripts

| Script              | Description                     |
| ------------------- | ------------------------------- |
| `bun run dev`       | Start with file watching        |
| `bun run start`     | Start the server                |
| `bun run typecheck` | Type-check with `tsc --noEmit`  |

## Docker

```bash
docker build -t backend .
docker run --rm -p 3000:3000 backend
```

To use Redis, pass the URL at runtime (the `.env` file is not baked into the image):

```bash
docker run --rm -p 3000:3000 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  backend
```

Set `PORT` too if you want the container to listen somewhere other than `3000`.
