import { Elysia } from "elysia";
import {
  parseClientAction,
  taskTopic,
  type ServerEvent,
  type SocketErrorCode,
  type TaskCompletedEvent,
  type TaskFailedEvent,
  type TaskSnapshotEvent,
} from "./protocol";
import { getTask } from "./store";

function send(ws: { send: (data: string) => unknown }, event: ServerEvent): void {
  ws.send(JSON.stringify(event));
}

function sendError(
  ws: { send: (data: string) => unknown },
  code: SocketErrorCode,
  message: string,
): void {
  send(ws, { type: "error", data: { code, message } });
}

export const taskSocket = new Elysia().ws("/ws", {
  open(ws) {
    send(ws, {
      type: "connected",
      data: { message: "Send a subscribe or unsubscribe action." },
    });
  },
  async message(ws, message) {
    const action = parseClientAction(message);

    if (!action) {
      sendError(
        ws,
        "invalid_action",
        'Expected {"action":"subscribe","taskId":"<uuid>"} or {"action":"unsubscribe","taskId":"<uuid>"}',
      );
      return;
    }

    const topic = taskTopic(action.taskId);

    if (action.action === "unsubscribe") {
      ws.unsubscribe(topic);
      send(ws, {
        type: "unsubscribed",
        data: { taskId: action.taskId, topic },
      });
      return;
    }

    const task = await getTask(action.taskId);

    if (!task) {
      sendError(ws, "task_not_found", "Task not found");
      return;
    }

    ws.subscribe(topic);
    send(ws, {
      type: "subscribed",
      data: { taskId: action.taskId, topic },
    });
    send(ws, {
      type: "task.snapshot",
      data: { task },
    } satisfies TaskSnapshotEvent);

    if (task.status === "completed" && task.result) {
      send(ws, {
        type: "task.completed",
        data: {
          taskId: task.id,
          result: task.result,
          completedAt: task.updatedAt,
        },
      } satisfies TaskCompletedEvent);
    } else if (task.status === "failed") {
      send(ws, {
        type: "task.failed",
        data: {
          taskId: task.id,
          error: task.error ?? "Task failed",
          failedAt: task.updatedAt,
        },
      } satisfies TaskFailedEvent);
    }
  },
});
