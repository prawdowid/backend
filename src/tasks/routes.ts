import { Elysia, t } from "elysia";
import { scheduleTask } from "./processor";
import { createTask, getTask } from "./store";
import type { TaskInput, TaskKind } from "./types";

const textBody = t.Object({
  text: t.String({ minLength: 1, maxLength: 100_000 }),
});

const urlBody = t.Object({
  url: t.String({ minLength: 1, maxLength: 2_048 }),
});

async function enqueue(
  kind: TaskKind,
  input: TaskInput,
  set: { status?: number | string },
) {
  const task = await createTask(kind, input);
  scheduleTask(task);

  set.status = 202;
  return { taskId: task.id, status: task.status };
}

export const taskRoutes = new Elysia()
  .post(
    "/process/text",
    ({ body, set }) => enqueue("text", body, set),
    { body: textBody },
  )
  .post(
    "/process/image",
    ({ body, set }) => enqueue("image", body, set),
    { body: urlBody },
  )
  .post(
    "/process/video",
    ({ body, set }) => enqueue("video", body, set),
    { body: urlBody },
  )
  .post(
    "/process/url",
    ({ body, set }) => enqueue("url", body, set),
    { body: urlBody },
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
    { params: t.Object({ id: t.String({ minLength: 1 }) }) },
  );
