import { expect, test } from "bun:test";
import { parseClientAction, taskTopic } from "./protocol";

test("parses subscribe actions from objects and JSON strings", () => {
  const taskId = "6ecd4e14-6dd5-45e2-99e6-d2b19cb3a98a";

  expect(parseClientAction({ action: "subscribe", taskId })).toEqual({
    action: "subscribe",
    taskId,
  });

  expect(
    parseClientAction(JSON.stringify({ action: "unsubscribe", taskId })),
  ).toEqual({ action: "unsubscribe", taskId });

  expect(
    parseClientAction(Buffer.from(JSON.stringify({ action: "subscribe", taskId }))),
  ).toEqual({ action: "subscribe", taskId });
});

test("rejects malformed actions", () => {
  expect(parseClientAction(null)).toBeNull();
  expect(parseClientAction("{")).toBeNull();
  expect(parseClientAction({ action: "subscribe" })).toBeNull();
  expect(parseClientAction({ action: "watch", taskId: "x" })).toBeNull();
  expect(parseClientAction({ action: "subscribe", taskId: "  " })).toBeNull();
});

test("builds task topics", () => {
  expect(taskTopic("abc")).toBe("task:abc");
});
