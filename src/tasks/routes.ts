import { Elysia, t } from "elysia";
import { scheduleTask } from "./processor";
import { createTask, getTask } from "./store";
import type { TaskInput, TaskKind } from "./types";

const textBody = t.Object({
  text: t.String({
    minLength: 1,
    maxLength: 100_000,
    description: "Text to process.",
  }),
});

const urlBody = t.Object({
  url: t.String({
    minLength: 1,
    maxLength: 2_048,
    description: "Public URL to process.",
  }),
});

const acceptedResponse = t.Object({
  taskId: t.String({ description: "UUID used for polling and WebSocket subscriptions." }),
  status: t.Literal("queued"),
});

const evidenceResponse = t.Object({
  title: t.String(),
  url: t.String(),
  snippet: t.String(),
  stance: t.Union([
    t.Literal("supports"),
    t.Literal("refutes"),
    t.Literal("neutral"),
  ]),
});

const factCheckResultResponse = t.Object({
  checkable: t.Boolean(),
  verdict: t.Union([
    t.Literal("true"),
    t.Literal("fake"),
    t.Literal("misleading"),
    t.Literal("unverifiable"),
  ]),
  confidence: t.Number({ minimum: 0, maximum: 1 }),
  summary: t.String(),
  claims: t.Array(t.String()),
  evidence: t.Array(evidenceResponse),
  cached: t.Boolean(),
  cacheScore: t.Optional(t.Number()),
  costUsd: t.Number(),
  modelVersion: t.String(),
  reason: t.Optional(t.String()),
});

const taskResponse = t.Object({
  id: t.String(),
  kind: t.Union([
    t.Literal("text"),
    t.Literal("image"),
    t.Literal("video"),
    t.Literal("url"),
  ]),
  status: t.Union([
    t.Literal("queued"),
    t.Literal("running"),
    t.Literal("completed"),
    t.Literal("failed"),
  ]),
  stage: t.Optional(
    t.Union([
      t.Literal("queued"),
      t.Literal("ingest"),
      t.Literal("gate"),
      t.Literal("summary"),
      t.Literal("rag"),
      t.Literal("fact_check"),
      t.Literal("verdict"),
      t.Literal("cache_write"),
    ]),
  ),
  progress: t.Number({ minimum: 0, maximum: 100 }),
  step: t.String(),
  input: t.Object({
    text: t.Optional(t.String()),
    url: t.Optional(t.String()),
  }),
  result: t.Optional(factCheckResultResponse),
  error: t.Optional(t.String()),
  costUsd: t.Optional(t.Number()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const notFoundResponse = t.Object({ error: t.String() });

async function enqueue(
  kind: TaskKind,
  input: TaskInput,
  set: { status?: number | string },
) {
  const task = await createTask(kind, input);
  scheduleTask(task);

  set.status = 202;
  return { taskId: task.id, status: "queued" as const };
}

export const taskRoutes = new Elysia()
  .post(
    "/process/text",
    ({ body, set }) => enqueue("text", body, set),
    {
      body: textBody,
      response: { 202: acceptedResponse },
      detail: {
        tags: ["Tasks"],
        operationId: "processText",
        summary: "Queue text processing",
        description:
          "Queues a text-processing task and returns its UUID immediately. Subscribe to /ws with the UUID for progress.",
      },
    },
  )
  .post(
    "/process/image",
    ({ body, set }) => enqueue("image", body, set),
    {
      body: urlBody,
      response: { 202: acceptedResponse },
      detail: {
        tags: ["Tasks"],
        operationId: "processImage",
        summary: "Queue image processing",
        description:
          "Queues an image-processing task and returns its UUID immediately.",
      },
    },
  )
  .post(
    "/process/video",
    ({ body, set }) => enqueue("video", body, set),
    {
      body: urlBody,
      response: { 202: acceptedResponse },
      detail: {
        tags: ["Tasks"],
        operationId: "processVideo",
        summary: "Queue video processing",
        description:
          "Queues a video-processing task and returns its UUID immediately.",
      },
    },
  )
  .post(
    "/process/url",
    ({ body, set }) => enqueue("url", body, set),
    {
      body: urlBody,
      response: { 202: acceptedResponse },
      detail: {
        tags: ["Tasks"],
        operationId: "processUrl",
        summary: "Queue URL processing",
        description:
          "Queues a URL-processing task and returns its UUID immediately.",
      },
    },
  )
  .get(
    "/tasks/:id",
    async ({ params, set }) => {
      const task = await getTask(params.id);

      if (!task) {
        set.status = 404;
        return { error: "Task not found" };
      }

      return task;
    },
    {
      params: t.Object({
        id: t.String({
          minLength: 1,
          description: "Task UUID returned by a /process/* endpoint.",
        }),
      }),
      response: { 200: taskResponse, 404: notFoundResponse },
      detail: {
        tags: ["Tasks"],
        operationId: "getTask",
        summary: "Get task status",
        description:
          "Returns the latest task snapshot. WebSocket subscribers receive the same shape.",
      },
    },
  );
