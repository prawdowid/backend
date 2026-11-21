import type { FactCheckResult, PipelineStage } from "../pipeline/types";

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
  stage?: PipelineStage;
  progress: number;
  step: string;
  input: TaskInput;
  result?: FactCheckResult;
  error?: string;
  costUsd?: number;
  createdAt: string;
  updatedAt: string;
}
