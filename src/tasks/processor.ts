import { runPipeline } from "../pipeline/orchestrator";
import { publishTaskFailed, publishTaskUpdate } from "./events";
import { getTask, updateTask } from "./store";
import type { Task } from "./types";

export function scheduleTask(task: Task): void {
  setTimeout(() => {
    void runTask(task.id);
  }, 0);
}

async function runTask(id: string): Promise<void> {
  const task = await getTask(id);
  if (!task) return;

  try {
    await runPipeline(task);
  } catch (error) {
    const failed = await updateTask(id, {
      status: "failed",
      step: "Failed",
      error: error instanceof Error ? error.message : String(error),
    });

    if (failed) {
      publishTaskUpdate(failed);
      publishTaskFailed(failed);
    }
  }
}
