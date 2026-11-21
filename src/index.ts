import { openapi } from "@elysia/openapi";
import { Elysia, t } from "elysia";
import { cacheBackend, cachePlugin } from "./cache";
import { env } from "./env";
import { setTaskPublisher } from "./tasks/events";
import { taskRoutes } from "./tasks/routes";
import { taskSocket } from "./tasks/socket";
import { taskBackend } from "./tasks/store";

const app = new Elysia()
  .use(
    openapi({
      path: "/docs",
      provider: "swagger-ui",
      openapiVersion: "3.0.3",
      exclude: { paths: ["/ws"] },
      documentation: {
        info: {
          title: "Backend API",
          version: "0.1.0",
          description:
            "ElysiaJS + Bun API with async task processing, WebSocket updates, and Redis fallback.",
        },
        tags: [
          {
            name: "System",
            description: "Health, cache, and hello-world endpoints.",
          },
          {
            name: "Tasks",
            description:
              "Queue processing jobs and inspect their progress. Live updates are available over WebSocket.",
          },
        ],
      },
    }),
  )
  .use(cachePlugin)
  .use(taskRoutes)
  .use(taskSocket)
  .get("/", () => ({ message: "Hello World" }), {
    detail: { tags: ["System"], summary: "Say hello" },
    response: t.Object({ message: t.String() }),
  })
  .get(
    "/health",
    () => ({
      status: "ok" as const,
      cache: cacheBackend,
      tasks: taskBackend(),
    }),
    {
      detail: {
        tags: ["System"],
        summary: "Health and storage backends",
      },
      response: t.Object({
        status: t.Literal("ok"),
        cache: t.Union([t.Literal("redis"), t.Literal("memory")]),
        tasks: t.Union([t.Literal("redis"), t.Literal("memory")]),
      }),
    },
  )
  .get(
    "/cached",
    async ({ cache, set }) => {
      const key = "cached:hello";
      const cached = await cache.get<{
        message: string;
        generatedAt: string;
      }>(key);

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
    },
    {
      detail: {
        tags: ["System"],
        summary: "Cache demo",
        description:
          "Returns a value cached for 10 seconds. The x-cache response header is HIT or MISS.",
      },
      response: t.Object({
        message: t.String(),
        generatedAt: t.String(),
      }),
    },
  )
  .listen(env.port);

setTaskPublisher((topic, event) => {
  app.server?.publish(topic, JSON.stringify(event));
});

console.log(
  `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);
console.log(`Cache backend: ${cacheBackend}`);

export default app;
