import type { TaskKind } from "../tasks/types";

export type Verdict = "true" | "fake" | "misleading" | "unverifiable";

export type PipelineStage =
  | "queued"
  | "ingest"
  | "gate"
  | "summary"
  | "rag"
  | "fact_check"
  | "verdict"
  | "cache_write";

export type EvidenceStance = "supports" | "refutes" | "neutral";

export interface Evidence {
  title: string;
  url: string;
  snippet: string;
  stance: EvidenceStance;
}

export interface MediaRef {
  kind: "image" | "video" | "url";
  url: string;
}

export interface SourceSignals {
  domain?: string;
  trusted?: boolean;
  punycode?: boolean;
  faviconHash?: string;
}

export interface ClaimBundle {
  kind: TaskKind;
  text: string;
  media: MediaRef[];
  metadata: Record<string, unknown>;
  sourceSignals: SourceSignals;
}

export interface FactCheckResult {
  checkable: boolean;
  verdict: Verdict;
  confidence: number;
  summary: string;
  claims: string[];
  evidence: Evidence[];
  cached: boolean;
  cacheScore?: number;
  costUsd: number;
  modelVersion: string;
  reason?: string;
}

export interface GateResult {
  checkable: boolean;
  probability: number;
  model: string;
  costUsd: number;
  reason?: string;
}

export interface SummaryResult {
  summary: string;
  claims: string[];
  model: string;
  costUsd: number;
}

export interface TranscriptResult {
  text: string;
  model: string;
  costUsd: number;
}

export interface RagEntryInput {
  text: string;
  verdict: Verdict;
  confidence: number;
  summary: string;
  claims: string[];
  evidence: Evidence[];
  modelVersion: string;
}

export interface RagEntry extends RagEntryInput {
  key: string;
  embedding: number[];
  embeddingModel: string;
  createdAt: string;
}

export interface RagHit {
  entry: RagEntry;
  score: number;
}

export interface RagLookup {
  hit: RagHit | null;
  model: string;
  costUsd: number;
  bestScore?: number;
}
