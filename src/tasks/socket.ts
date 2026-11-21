import { Elysia } from "elysia";
import { topicForTask } from "./events";
import { getTask } from "./store";
import type { TaskSnapshotEvent } from "./types";

interface ClientMessage {
  type: "subscribe" | "unsubscribe";
  taskId: string;
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

function parseClientMessage(raw: unknown): ClientMessage | null {
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

  const { type, taskId } = value as Record<string, unknown>;
  if (
    (type === "subscribe" || type === "unsubscribe") &&
    typeof taskId === "string" &&
    taskId.length > 0
  ) {
    return { type, taskId };
  }

  return null;
}

function send(ws: { send: (data: string) => unknown }, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

export const taskSocket = new Elysia().ws("/ws", {
  open(ws) {
    send(ws, { type: "connected" });
  },
  async message(ws, message) {
    const parsed = parseClientMessage(message);

    if (!parsed) {
      send(ws, {
        type: "error",
        message: 'Expected {"type":"subscribe","taskId":"<uuid>"}',
      });
      return;
    }

    if (parsed.type === "unsubscribe") {
      ws.unsubscribe(topicForTask(parsed.taskId));
      send(ws, { type: "unsubscribed", taskId: parsed.taskId });
      return;
    }

    const task = await getTask(parsed.taskId);

    if (!task) {
      send(ws, { type: "error", message: "Task not found" });
      return;
    }

    ws.subscribe(topicForTask(parsed.taskId));
    send(ws, {
      type: "task.snapshot",
      task,
    } satisfies TaskSnapshotEvent);
  },
});
