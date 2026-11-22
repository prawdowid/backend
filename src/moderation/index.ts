/**
 * Information loop (pętla informacji).
 *
 * When a verification ends without a trusted answer, the question is stored and
 * clustered with similar questions by embedding similarity. A cluster that keeps
 * receiving the same unanswered question is escalated once to a moderator.
 *
 * `escalated` is only true when the alert was actually delivered (webhook).
 * Otherwise the case stays `open` with an explicit "recommendation, not sent"
 * reason, so the API never claims a hand-off that did not happen.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenRouterWrapper, cosineSimilarity } from "../modules/openrouter";
import type { ClaimVerdict } from "../pipeline/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(HERE, "..", "..", "data");
const CASES_FILE = resolve(DATA_DIR, "moderation", "cases.json");
const ALERTS_FILE = resolve(DATA_DIR, "alerts", "alerts.jsonl");

const SIMILARITY_THRESHOLD = 0.82;
const ALERT_AT_REPEATS = 3;
const MAX_SAMPLES = 5;

export type CaseStatus = "open" | "acknowledged";

export type UnresolvedCase = {
    id: string;
    question: string;
    claims: string[];
    verdicts: string[];
    count: number;
    firstSeen: string;
    lastSeen: string;
    channels: string[];
    samples: string[];
    status: CaseStatus;
    /** True only when the alert was actually delivered. */
    escalated: boolean;
    escalatedAt: string | null;
    /** Why escalation was or was not performed. */
    alertReason: string | null;
    embedding: number[];
};

type Store = {
    version: 1;
    cases: UnresolvedCase[];
};

let storePromise: Promise<Store> | undefined;
let writeChain: Promise<void> = Promise.resolve();

function normalize(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

async function load(): Promise<Store> {
    storePromise ??= (async () => {
        try {
            const raw = await readFile(CASES_FILE, "utf8");
            const parsed = JSON.parse(raw) as Store;
            if (Array.isArray(parsed.cases)) return { version: 1, cases: parsed.cases };
        } catch {
            // Missing file: first run.
        }
        return { version: 1, cases: [] };
    })();

    return storePromise;
}

function persist(store: Store): Promise<void> {
    writeChain = writeChain
        .then(async () => {
            await mkdir(dirname(CASES_FILE), { recursive: true });
            await writeFile(CASES_FILE, JSON.stringify(store, null, 2), "utf8");
        })
        .catch((error: unknown) => {
            console.error("[moderation] nie udało się zapisać spraw:", (error as Error).message);
        });

    return writeChain;
}

async function embed(text: string): Promise<number[]> {
    try {
        return await OpenRouterWrapper.Embed(text.slice(0, 4000));
    } catch (error) {
        console.error("[moderation] embedding nieudany:", (error as Error).message);
        return [];
    }
}

function unresolvedClaims(claims: ClaimVerdict[]): ClaimVerdict[] {
    return claims.filter(
        (claim) => claim.verdict === "insufficient_evidence" || claim.verdict === "not_verifiable",
    );
}

async function deliverAlert(entry: UnresolvedCase): Promise<{ escalated: boolean; reason: string }> {
    const webhook = process.env["MODERATOR_WEBHOOK_URL"];
    const payload = {
        type: "unresolved_repeated_question",
        caseId: entry.id,
        count: entry.count,
        question: entry.question,
        claims: entry.claims,
        channels: entry.channels,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
        message: `Brak definitywnej odpowiedzi na powtarzające się pytanie (${entry.count} zgłoszeń).`,
    };

    try {
        await mkdir(dirname(ALERTS_FILE), { recursive: true });
        await appendFile(ALERTS_FILE, `${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`, "utf8");
    } catch (error) {
        console.error("[moderation] nie udało się zapisać alertu:", (error as Error).message);
    }

    if (!webhook) {
        return {
            escalated: false,
            reason: "Rekomendacja przekazania: brak MODERATOR_WEBHOOK_URL, alert tylko zapisany lokalnie.",
        };
    }

    try {
        const response = await fetch(webhook, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            return {
                escalated: false,
                reason: `Rekomendacja przekazania: webhook odpowiedział ${response.status}.`,
            };
        }
        return { escalated: true, reason: "Alert przekazany do moderatora przez webhook." };
    } catch (error) {
        return {
            escalated: false,
            reason: `Rekomendacja przekazania: webhook nieosiągalny (${(error as Error).message.slice(0, 120)}).`,
        };
    }
}

export type RecordUnresolvedInput = {
    question: string;
    claims: ClaimVerdict[];
    channel: string;
};

/**
 * Stores an unanswered question, joins a similar open case or opens a new one,
 * and escalates once when the cluster crosses the repeat threshold.
 * Never throws: the verification response must not depend on moderation.
 */
export async function recordUnresolved(input: RecordUnresolvedInput): Promise<UnresolvedCase | null> {
    const pending = unresolvedClaims(input.claims);
    if (pending.length === 0) return null;

    const question = input.question.slice(0, 500);
    const claimTexts = pending.map((claim) => claim.claim).slice(0, 10);
    const verdicts = [...new Set(pending.map((claim) => claim.verdict))];
    const now = new Date().toISOString();

    try {
        const store = await load();
        const open = store.cases.filter((item) => item.status === "open");
        const normalized = normalize(question);

        let match = open.find((item) => normalize(item.question) === normalized);

        if (!match) {
            const vector = await embed(`${question} ${claimTexts.join("; ")}`);
            let best: { item: UnresolvedCase; score: number } | null = null;

            if (vector.length > 0) {
                for (const item of open) {
                    if (item.embedding.length !== vector.length) continue;
                    const score = cosineSimilarity(vector, item.embedding);
                    if (!Number.isFinite(score) || score < SIMILARITY_THRESHOLD) continue;
                    if (!best || score > best.score) best = { item, score };
                }
            }

            if (best) {
                match = best.item;
            } else {
                const created: UnresolvedCase = {
                    id: randomUUID(),
                    question,
                    claims: claimTexts,
                    verdicts,
                    count: 1,
                    firstSeen: now,
                    lastSeen: now,
                    channels: [input.channel],
                    samples: [question],
                    status: "open",
                    escalated: false,
                    escalatedAt: null,
                    alertReason: null,
                    embedding: vector,
                };
                store.cases.push(created);
                await persist(store);
                return created;
            }
        }

        match.count += 1;
        match.lastSeen = now;
        if (!match.channels.includes(input.channel)) match.channels.push(input.channel);
        if (match.samples.length < MAX_SAMPLES && !match.samples.includes(question)) {
            match.samples.push(question);
        }

        if (match.count >= ALERT_AT_REPEATS && !match.escalated && match.alertReason === null) {
            const result = await deliverAlert(match);
            match.escalated = result.escalated;
            match.escalatedAt = result.escalated ? now : null;
            match.alertReason = result.reason;
        }

        await persist(store);
        return match;
    } catch (error) {
        console.error("[moderation] recordUnresolved failed:", (error as Error).message);
        return null;
    }
}

export async function listCases(): Promise<UnresolvedCase[]> {
    const store = await load();
    return [...store.cases].sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
}

export async function acknowledgeCase(id: string): Promise<UnresolvedCase | null> {
    const store = await load();
    const found = store.cases.find((item) => item.id === id);
    if (!found) return null;
    found.status = "acknowledged";
    await persist(store);
    return found;
}
