import { expect, mock, test } from "bun:test";
import { MemoryStore } from "@clov-std/kv-store";
import type { Task } from "./types";

const kv = new MemoryStore();

mock.module("../cache", () => ({
  cacheBackend: "redis" as const,
  keyValueStore: kv,
}));

const { createTask, getTask, taskBackend, updateTask } = await import(
  "./store"
);

test("persists task updates to the shared KV store", async () => {
  expect(taskBackend()).toBe("redis");

  const task = await createTask("text", { text: "hello" });
  expect(await kv.get<Task>(`task:${task.id}`)).toMatchObject({
    id: task.id,
    status: "queued",
    progress: 0,
  });

  await updateTask(task.id, { status: "completed", progress: 100 });

  expect(await kv.get<Task>(`task:${task.id}`)).toMatchObject({
    id: task.id,
    status: "completed",
    progress: 100,
  });
});

test("hydrates a task that is only present in the KV store", async () => {
  const now = new Date().toISOString();
  const stored: Task = {
    id: "external-task",
    kind: "url",
    status: "completed",
    progress: 100,
    step: "Completed",
    input: { url: "https://example.com" },
    createdAt: now,
    updatedAt: now,
  };

  await kv.set("task:external-task", stored, 60);

  expect(await getTask("external-task")).toMatchObject({
    id: "external-task",
    status: "completed",
  });
});
