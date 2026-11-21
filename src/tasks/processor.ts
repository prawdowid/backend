import { publishTask } from "./events";
import { getTask, updateTask } from "./store";
import type { Task, TaskKind } from "./types";

const STEPS: Record<TaskKind, string[]> = {
  text: ["Normalizing text", "Analyzing content", "Preparing result"],
  image: ["Validating image", "Reading metadata", "Preparing result"],
  video: ["Validating video", "Sampling frames", "Preparing result"],
  url: ["Validating URL", "Reading page", "Preparing result"],
};

const STEP_DELAY_MS: Record<TaskKind, number> = {
  text: 350,
  image: 500,
  video: 800,
  url: 450,
};

function updateAndPublish(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): void {
  const task = updateTask(id, patch);
  if (task) publishTask(task);
}

export function scheduleTask(task: Task): void {
  setTimeout(() => {
    void runTask(task.id);
  }, 0);
}

async function runTask(id: string): Promise<void> {
  const task = getTask(id);
  if (!task) return;

  try {
    updateAndPublish(id, {
      status: "running",
      progress: 5,
      step: "Starting",
    });

    const steps = STEPS[task.kind];

    for (const [index, step] of steps.entries()) {
      await Bun.sleep(STEP_DELAY_MS[task.kind]);
      updateAndPublish(id, {
        progress: Math.round(((index + 1) / (steps.length + 1)) * 100),
        step,
      });
    }

    await Bun.sleep(STEP_DELAY_MS[task.kind]);
    updateAndPublish(id, {
      status: "completed",
      progress: 100,
      step: "Completed",
      result: buildResult(task),
    });
  } catch (error) {
    updateAndPublish(id, {
      status: "failed",
      step: "Failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildResult(task: Task): unknown {
  if (task.kind === "text" && "text" in task.input) {
    return {
      characters: task.input.text.length,
      words: task.input.text.trim().split(/\s+/).filter(Boolean).length,
    };
  }

  return {
    kind: task.kind,
    input: task.input,
    simulated: true,
  };
}
