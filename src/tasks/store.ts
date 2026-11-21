import type { Task, TaskInput, TaskKind } from "./types";

const TASK_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const tasks = new Map<string, Task>();

setInterval(() => {
  const cutoff = Date.now() - TASK_TTL_MS;

  for (const [id, task] of tasks) {
    if (Date.parse(task.updatedAt) < cutoff) tasks.delete(id);
  }
}, CLEANUP_INTERVAL_MS).unref();

export function createTask(kind: TaskKind, input: TaskInput): Task {
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
  return task;
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Task | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;

  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  return task;
}
