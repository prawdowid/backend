import type { Task } from "../tasks/types";
import type { ClaimBundle, MediaRef } from "./types";

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function ingest(task: Task): Promise<ClaimBundle> {
  if (task.kind === "text" && "text" in task.input) {
    const text = normalizeText(task.input.text);

    return {
      kind: task.kind,
      text,
      media: [],
      metadata: {
        characters: text.length,
        words: text ? text.split(/\s+/).length : 0,
      },
      sourceSignals: {},
    };
  }

  const media: MediaRef[] = [];

  if ("url" in task.input) {
    media.push({
      kind: task.kind === "text" ? "url" : task.kind,
      url: task.input.url,
    });
  }

  return {
    kind: task.kind,
    text: "",
    media,
    metadata: { adapter: "not_implemented" },
    sourceSignals: {},
  };
}
