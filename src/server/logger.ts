/**
 * Verification log + in-memory metrics.
 *
 * One JSON line per verification goes to data/logs/verify.jsonl, while counters
 * and latencies live in memory for GET /metrics. Neither path may break a request:
 * a disk error is reported to stderr, never thrown at the caller.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ClaimVerdict, OutcomeStatus, Verdict } from "../pipeline/types";

/** backend/data/logs/verify.jsonl, resolved from this file (src/server/logger.ts). */
export const LOG_FILE = fileURLToPath(new URL("../../data/logs/verify.jsonl", import.meta.url));

const LOG_DIR = fileURLToPath(new URL("../../data/logs", import.meta.url));

/** Keep the latency buffer bounded; totals are counted separately. */
const MAX_LATENCIES = 10_000;

const STATUSES: readonly OutcomeStatus[] = ["ok", "error", "needs_clarification", "out_of_scope"];
const VERDICTS: readonly Verdict[] = [
    "confirmed",
    "false",
    "misleading",
    "insufficient_evidence",
    "not_verifiable",
];

export type VerificationLogEntry = {
    sessionId: string;
    status: OutcomeStatus;
    timingMs: number;
    claims: ClaimVerdict[];
    channel: string;
    inputKind: "text" | "url";
    models: string[];
    costUsd: number;
};

export type Metrics = {
    uptimeSec: number;
    total: number;
    statuses: Record<OutcomeStatus, number>;
    verdicts: Record<Verdict, number>;
    /** Claims that ended without enough evidence, summed over all requests. */
    abstained: number;
    p50Ms: number;
    p95Ms: number;
    avgCostUsd: number;
};

const startedAt = Date.now();

const statuses = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<OutcomeStatus, number>;
const verdicts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Record<Verdict, number>;
const latencies: number[] = [];

let total = 0;
let abstained = 0;
let totalCostUsd = 0;

let dirReady: Promise<void> | undefined;
let writeChain: Promise<void> = Promise.resolve();

function ensureDir(): Promise<void> {
    if (!dirReady) {
        dirReady = mkdir(LOG_DIR, { recursive: true }).then(
            () => undefined,
            (error: unknown) => {
                // Reset so the next call retries, but do not poison the chain.
                dirReady = undefined;
                throw error;
            },
        );
    }
    return dirReady;
}

function record(entry: VerificationLogEntry): void {
    total += 1;
    statuses[entry.status] += 1;
    totalCostUsd += Number.isFinite(entry.costUsd) ? entry.costUsd : 0;

    for (const claim of entry.claims) {
        verdicts[claim.verdict] += 1;
        if (claim.verdict === "insufficient_evidence") abstained += 1;
    }

    if (Number.isFinite(entry.timingMs)) {
        latencies.push(entry.timingMs);
        if (latencies.length > MAX_LATENCIES) latencies.splice(0, latencies.length - MAX_LATENCIES);
    }
}

function percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    const index = Math.min(sorted.length - 1, Math.max(0, rank));
    return sorted[index] ?? 0;
}

/** Append one line to the JSONL log and update the in-memory counters. */
export async function logVerification(entry: VerificationLogEntry): Promise<void> {
    record(entry);

    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;

    writeChain = writeChain
        .then(async () => {
            await ensureDir();
            await appendFile(LOG_FILE, line, "utf8");
        })
        .catch((error: unknown) => {
            console.error("[logger] nie udało się zapisać logu:", (error as Error).message);
        });

    await writeChain;
}

export function getMetrics(): Metrics {
    const sorted = [...latencies].sort((a, b) => a - b);
    return {
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        total,
        statuses: { ...statuses },
        verdicts: { ...verdicts },
        abstained,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        avgCostUsd: total > 0 ? Number((totalCostUsd / total).toFixed(6)) : 0,
    };
}
