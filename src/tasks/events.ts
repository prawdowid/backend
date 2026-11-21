import { taskTopic } from "./protocol";
import type {
  ServerEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskTopic,
  TaskUpdateEvent,
} from "./protocol";
import type { Task } from "./types";

type Publisher = (topic: TaskTopic, event: ServerEvent) => void;

let publisher: Publisher = () => {};

export function setTaskPublisher(next: Publisher): void {
  publisher = next;
}

function publish(topic: TaskTopic, event: ServerEvent): void {
  publisher(topic, event);
}

export function publishTaskUpdate(task: Task): void {
  publish(taskTopic(task.id), {
    type: "task.update",
    data: { task },
  } satisfies TaskUpdateEvent);
}

export function publishTaskCompleted(task: Task): void {
  publish(taskTopic(task.id), {
    type: "task.completed",
    data: {
      taskId: task.id,
      result: task.result,
      completedAt: task.updatedAt,
    },
  } satisfies TaskCompletedEvent);
}

export function publishTaskFailed(task: Task): void {
  publish(taskTopic(task.id), {
    type: "task.failed",
    data: {
      taskId: task.id,
      error: task.error ?? "Task failed",
      failedAt: task.updatedAt,
    },
  } satisfies TaskFailedEvent);
}
