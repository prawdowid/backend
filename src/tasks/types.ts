export type TaskKind = "text" | "image" | "video" | "url";

export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface TextInput {
  text: string;
}

export interface UrlInput {
  url: string;
}

export type TaskInput = TextInput | UrlInput;

export interface Task {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  progress: number;
  step: string;
  input: TaskInput;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
