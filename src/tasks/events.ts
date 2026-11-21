import type { Task, TaskUpdateEvent } from "./types";

type Publisher = (topic: string, event: TaskUpdateEvent) => void;

let publisher: Publisher = () => {};

export function setTaskPublisher(next: Publisher): void {
  publisher = next;
}

export function topicForTask(id: string): string {
  return `task:${id}`;
}

export function publishTask(task: Task): void {
  publisher(topicForTask(task.id), { type: "task.update", task });
}
