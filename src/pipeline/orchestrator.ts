import { gateWithDeepSeek, summarizeWithDeepSeek } from "../ai/deepseek";
import { gateWithJev } from "../ai/jev";
import { env } from "../env";
import { lookup } from "../rag";
import {
  publishTaskCompleted,
  publishTaskUpdate,
} from "../tasks/events";
import { updateTask } from "../tasks/store";
import type { Task } from "../tasks/types";
import { ingest } from "./ingest";
import type {
  ClaimBundle,
  FactCheckResult,
  GateResult,
  PipelineStage,
  SummaryResult,
} from "./types";

function providerFallback(stage: string, error: unknown): void {
  console.warn(
    `[pipeline] ${stage} provider failed; using fallback:`,
    error instanceof Error ? error.message : error,
  );
}

function heuristicGate(bundle: ClaimBundle): GateResult {
  const checkable =
    bundle.text.length >= 40 &&
    /\b\d{4}\b|\d+(?:\.\d+)?%|["“”]|\b(according to|said|stated|reportedly|study|survey|report|data|percent)\b/i.test(
      bundle.text,
    );

  return {
    checkable,
    probability: checkable ? 0.6 : 0.4,
    model: "heuristic-gate",
    costUsd: 0,
    reason: checkable
      ? undefined
      : "No checkable claim signals found by the local heuristic",
  };
}

async function gateClaim(bundle: ClaimBundle): Promise<GateResult> {
  if (env.typeSafeApiKey) {
    try {
      return await gateWithJev(bundle);
    } catch (error) {
      providerFallback("Jev gate", error);
    }
  }

  if (env.deepseekApiKey) {
    try {
      return await gateWithDeepSeek(bundle);
    } catch (error) {
      providerFallback("DeepSeek gate", error);
    }
  }

  return heuristicGate(bundle);
}

function extractiveSummary(bundle: ClaimBundle): SummaryResult {
  const sentences =
    bundle.text
      .match(/[^.!?\n]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [bundle.text];

  return {
    summary: sentences.slice(0, 2).join(" ").slice(0, 600),
    claims: sentences.slice(0, 3),
    model: "extractive-summary",
    costUsd: 0,
  };
}

async function summarizeClaim(bundle: ClaimBundle): Promise<SummaryResult> {
  if (env.deepseekApiKey) {
    try {
      return await summarizeWithDeepSeek(bundle);
    } catch (error) {
      providerFallback("DeepSeek summary", error);
    }
  }

  return extractiveSummary(bundle);
}

function uniqueModels(...models: string[]): string {
  return [...new Set(models.filter(Boolean))].join("+");
}

export async function runPipeline(task: Task): Promise<void> {
  let costUsd = 0;

  const stage = async (
    next: PipelineStage,
    progress: number,
    step: string,
  ): Promise<void> => {
    const updated = await updateTask(task.id, {
      status: "running",
      stage: next,
      progress,
      step,
      costUsd,
    });

    if (updated) publishTaskUpdate(updated);
  };

  const finish = async (
    result: FactCheckResult,
    finalStage: PipelineStage = "verdict",
  ): Promise<void> => {
    const updated = await updateTask(task.id, {
      status: "completed",
      stage: finalStage,
      progress: 100,
      step: "Completed",
      result,
      costUsd: result.costUsd,
    });

    if (updated) {
      publishTaskUpdate(updated);
      publishTaskCompleted(updated);
    }
  };

  const overBudget = (): boolean => costUsd > env.requestBudgetUsd;

  const baseResult = {
    confidence: 0,
    summary: "",
    claims: [] as string[],
    evidence: [],
    cached: false,
    modelVersion: "local",
  } satisfies Partial<FactCheckResult>;

  await stage("ingest", 10, "Extracting content");
  const bundle = await ingest(task);

  if (!bundle.text.trim()) {
    await finish(
      {
        ...baseResult,
        checkable: false,
        verdict: "unverifiable",
        costUsd,
        reason: `${task.kind} ingest adapter is not implemented yet`,
      },
      "ingest",
    );
    return;
  }

  await stage("gate", 25, "Checking for disprovable claims");
  const gate = await gateClaim(bundle);
  costUsd += gate.costUsd;

  if (!gate.checkable) {
    await finish(
      {
        ...baseResult,
        checkable: false,
        verdict: "unverifiable",
        confidence: gate.probability,
        costUsd,
        modelVersion: gate.model,
        reason: gate.reason ?? "No disprovable claim detected",
      },
      "gate",
    );
    return;
  }

  if (overBudget()) {
    await finish(
      {
        ...baseResult,
        checkable: true,
        verdict: "unverifiable",
        costUsd,
        modelVersion: gate.model,
        reason: `Request budget exceeded ($${costUsd.toFixed(4)} > $${env.requestBudgetUsd})`,
      },
      "gate",
    );
    return;
  }

  await stage("summary", 40, "Summarizing the claim");
  const summary = await summarizeClaim(bundle);
  costUsd += summary.costUsd;

  if (overBudget()) {
    await finish(
      {
        ...baseResult,
        checkable: true,
        verdict: "unverifiable",
        summary: summary.summary,
        claims: summary.claims,
        costUsd,
        modelVersion: uniqueModels(gate.model, summary.model),
        reason: `Request budget exceeded ($${costUsd.toFixed(4)} > $${env.requestBudgetUsd})`,
      },
      "summary",
    );
    return;
  }

  await stage("rag", 60, "Searching the fact-check cache");
  const rag = await lookup(summary.summary || bundle.text);
  costUsd += rag.costUsd;

  if (rag.hit) {
    const { entry, score } = rag.hit;

    await finish(
      {
        checkable: true,
        verdict: entry.verdict,
        confidence: entry.confidence,
        summary: entry.summary,
        claims: entry.claims,
        evidence: entry.evidence,
        cached: true,
        cacheScore: score,
        costUsd,
        modelVersion: entry.modelVersion,
      },
      "cache_write",
    );
    return;
  }

  if (overBudget()) {
    await finish(
      {
        ...baseResult,
        checkable: true,
        verdict: "unverifiable",
        summary: summary.summary,
        claims: summary.claims,
        costUsd,
        modelVersion: uniqueModels(gate.model, summary.model, rag.model),
        reason: `Request budget exceeded ($${costUsd.toFixed(4)} > $${env.requestBudgetUsd})`,
      },
      "rag",
    );
    return;
  }

  await stage("fact_check", 80, "Full fact-check is not configured");

  await finish(
    {
      ...baseResult,
      checkable: true,
      verdict: "unverifiable",
      summary: summary.summary,
      claims: summary.claims,
      costUsd,
      modelVersion: uniqueModels(gate.model, summary.model, rag.model),
      reason:
        "Tier 2 search/fact-check is not wired yet; returning unverifiable instead of guessing",
    },
    "fact_check",
  );
}
