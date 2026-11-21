import { Elysia } from "elysia";
import { cacheBackend, cachePlugin } from "./cache";
import { env } from "./env";

const app = new Elysia()
  .use(cachePlugin)
  .get("/", () => ({ message: "Hello World" }))
  .get("/health", () => ({ status: "ok", cache: cacheBackend }))
  .get("/cached", async ({ cache, set }) => {
    const key = "cached:hello";
    const cached = await cache.get<{ message: string; generatedAt: string }>(key);

    if (cached !== null) {
      set.headers["x-cache"] = `HIT (${cacheBackend})`;
      return cached;
    }

    const response = {
      message: "Hello World",
      generatedAt: new Date().toISOString(),
    };

    await cache.set(key, response, 10);
    set.headers["x-cache"] = `MISS (${cacheBackend})`;

    return response;
  })
  .listen(env.port);

console.log(
  `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);
console.log(`Cache backend: ${cacheBackend}`);

export default app;
