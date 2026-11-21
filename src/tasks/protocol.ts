import type { FactCheckResult } from "../pipeline/types";
import type { Task } from "./types";

export type TaskTopic = `task:${string}`;

export type SocketErrorCode = "invalid_action" | "task_not_found";

export interface SubscribeAction {
  action: "subscribe";
  taskId: string;
}

export interface UnsubscribeAction {
  action: "unsubscribe";
  taskId: string;
}

export type ClientAction = SubscribeAction | UnsubscribeAction;

export interface ConnectedEvent {
  type: "connected";
  data: {
    message: string;
  };
}

export interface SubscribedEvent {
  type: "subscribed";
  data: {
    taskId: string;
    topic: TaskTopic;
  };
}

export interface UnsubscribedEvent {
  type: "unsubscribed";
  data: {
    taskId: string;
    topic: TaskTopic;
  };
}

export interface TaskSnapshotEvent {
  type: "task.snapshot";
  data: {
    task: Task;
  };
}

export interface TaskUpdateEvent {
  type: "task.update";
  data: {
    task: Task;
  };
}

export interface TaskCompletedEvent {
  type: "task.completed";
  data: {
    taskId: string;
    result: FactCheckResult;
    completedAt: string;
  };
}

export interface TaskFailedEvent {
  type: "task.failed";
  data: {
    taskId: string;
    error: string;
    failedAt: string;
  };
}

export interface SocketErrorEvent {
  type: "error";
  data: {
    code: SocketErrorCode;
    message: string;
  };
}

export type ServerEvent =
  | ConnectedEvent
  | SubscribedEvent
  | UnsubscribedEvent
  | TaskSnapshotEvent
  | TaskUpdateEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | SocketErrorEvent;

export function taskTopic(taskId: string): TaskTopic {
  return `task:${taskId}`;
}

function decodeMessage(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw);

  if (ArrayBuffer.isView(raw)) {
    return Buffer.from(
      raw.buffer as ArrayBuffer,
      raw.byteOffset,
      raw.byteLength,
    ).toString("utf8");
  }

  return null;
}

function toRecord(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;

  if (
    typeof raw === "string" ||
    raw instanceof ArrayBuffer ||
    ArrayBuffer.isView(raw)
  ) {
    const text = decodeMessage(raw);
    if (text === null) return null;

    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function parseClientAction(raw: unknown): ClientAction | null {
  const value = toRecord(raw);
  if (!value) return null;

  const { action, taskId } = value;

  if (
    (action === "subscribe" || action === "unsubscribe") &&
    typeof taskId === "string" &&
    taskId.trim().length > 0
  ) {
    return { action, taskId };
  }

  return null;
}
