import { cacheBackend, keyValueStore } from "../cache";
import type { Task, TaskInput, TaskKind } from "./types";

const TASK_TTL_SECONDS = 60 * 60;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const tasks = new Map<string, Task>();

// Tasks always live in memory for fast local access. When Redis was
// available at startup, snapshots are also written through to it.
let persistent = cacheBackend === "redis";

function taskKey(id: string): string {
  return `task:${id}`;
}

function disablePersistence(error: unknown): void {
  if (!persistent) return;

  persistent = false;
  console.warn(
    "Redis task persistence is unavailable; continuing with in-memory tasks.",
    error instanceof Error ? error.message : error,
  );
}

async function persist(task: Task): Promise<void> {
  if (!persistent) return;

  try {
    await keyValueStore.set(taskKey(task.id), task, TASK_TTL_SECONDS);
  } catch (error) {
    disablePersistence(error);
  }
}

export function taskBackend(): "redis" | "memory" {
  return persistent ? "redis" : "memory";
}

export async function createTask(
  kind: TaskKind,
  input: TaskInput,
): Promise<Task> {
  const now = new Date().toISOString();

  const task: Task = {
    id: crypto.randomUUID(),
    kind,
    status: "queued",
    progress: 0,
    step: "Queued",
    input,
    createdAt: now,
    updatedAt: now,
  };

  tasks.set(task.id, task);
  await persist(task);

  return task;
}

export async function getTask(id: string): Promise<Task | undefined> {
  const local = tasks.get(id);
  if (local) return local;

  // A task may have been created by another instance, or before a restart.
  if (!persistent) return undefined;

  try {
    const stored = await keyValueStore.get<Task>(taskKey(id));
    if (!stored) return undefined;

    tasks.set(id, stored);
    return stored;
  } catch (error) {
    disablePersistence(error);
    return undefined;
  }
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<Task | undefined> {
  const task = await getTask(id);
  if (!task) return undefined;

  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  tasks.set(id, task);
  await persist(task);

  return task;
}

setInterval(() => {
  const cutoff = Date.now() - TASK_TTL_SECONDS * 1000;

  for (const [id, task] of tasks) {
    if (Date.parse(task.updatedAt) < cutoff) tasks.delete(id);
  }
}, CLEANUP_INTERVAL_MS).unref();
