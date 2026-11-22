/**
 * Discord message formatting for VerifyResponse.
 * Pure functions only: no Discord client, no network, no side effects.
 */
import {
    DISCLAIMER_PL,
    VERDICT_LABELS_PL,
    type ClaimVerdict,
    type Verdict,
    type VerifyResponse,
} from "../pipeline/types";

/** Hard budget per chunk. Discord's limit is 2000; we keep a safety margin. */
const MAX_CHUNK_CHARS = 1900;
const MAX_CLAIM_CHARS = 300;
const MAX_REASONING_CHARS = 420;
const MAX_TITLE_CHARS = 120;
const MAX_EVIDENCE_ITEMS = 3;

const VERDICT_EMOJI: Record<Verdict, string> = {
    confirmed: "✅",
    false: "❌",
    misleading: "⚠️",
    insufficient_evidence: "❔",
    not_verifiable: "ℹ️",
};

/** When claims disagree, the header shows the most alarming verdict first. */
const VERDICT_PRIORITY: Verdict[] = [
    "false",
    "misleading",
    "insufficient_evidence",
    "confirmed",
    "not_verifiable",
];

function oneLine(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
    const text = oneLine(value);
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Keep at most `maxSentences` sentences, so reasoning stays short. */
function firstSentences(value: string, maxSentences: number): string {
    const text = oneLine(value);
    if (!text) return "";
    const sentences = text.split(/(?<=[.!?])\s+/).slice(0, maxSentences).join(" ");
    return clip(sentences, MAX_REASONING_CHARS);
}

function pluralize(count: number, one: string, few: string, many: string): string {
    if (count === 1) return one;
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
}

function formatNumber(value: number, digits: number): string {
    return value.toFixed(digits).replace(".", ",");
}

export function overallVerdict(claims: ClaimVerdict[]): Verdict {
    for (const candidate of VERDICT_PRIORITY) {
        if (claims.some((claim) => claim.verdict === candidate)) return candidate;
    }
    return "insufficient_evidence";
}

function headerBlock(result: VerifyResponse): string {
    if (result.claims.length === 0) {
        return "❔ Nie znalazłem twierdzeń do sprawdzenia";
    }
    const verdict = overallVerdict(result.claims);
    const count = result.claims.length;
    const label = VERDICT_LABELS_PL[verdict];
    const suffix = count > 1 ? ` — ${count} ${pluralize(count, "twierdzenie", "twierdzenia", "twierdzeń")}` : "";
    return `${VERDICT_EMOJI[verdict]} ${label}${suffix}`;
}

function evidenceLine(claim: ClaimVerdict): string[] {
    const items = claim.evidence.slice(0, MAX_EVIDENCE_ITEMS);
    if (items.length === 0) return ["• brak źródeł w odpowiedzi"];

    return items.map((item) => {
        const title = clip(item.title, MAX_TITLE_CHARS) || "źródło bez tytułu";
        const publisher = clip(item.publisher, 60) || "wydawca nieznany";
        const date = item.publishedAt ? item.publishedAt.slice(0, 10) : "brak daty";
        return `• ${title} — ${publisher} (${date}) — ${item.url}`;
    });
}

function claimBlock(claim: ClaimVerdict, index: number): string {
    const lines: string[] = [];
    lines.push(`${index + 1}. ${VERDICT_EMOJI[claim.verdict]} ${VERDICT_LABELS_PL[claim.verdict]}`);
    lines.push(`„${clip(claim.claim, MAX_CLAIM_CHARS)}”`);

    const reasoning = firstSentences(claim.reasoning, 2);
    if (reasoning) lines.push(reasoning);

    lines.push(...evidenceLine(claim));
    return lines.join("\n");
}

function footerBlock(result: VerifyResponse): string {
    const disclaimer = oneLine(result.disclaimer || DISCLAIMER_PL) || DISCLAIMER_PL;
    const seconds = formatNumber(result.timingMs / 1000, 1);
    const cost = formatNumber(result.costUsd, 4);
    return `${disclaimer}\n⏱ Czas: ${seconds} s · Koszt: ${cost} USD`;
}

function limitationBlock(result: VerifyResponse): string {
    const items = result.limitations.filter((item) => oneLine(item).length > 0).slice(0, 3);
    if (items.length === 0) return "";
    return ["Ograniczenia:", ...items.map((item) => `• ${clip(item, 200)}`)].join("\n");
}

/** Messages for statuses that must never look like a verdict. */
function statusBlocks(result: VerifyResponse): string[] {
    const summary = oneLine(result.summary) || "Brak szczegółów.";

    switch (result.status) {
        case "needs_clarification":
            return [
                ["❔ Nie mam czego sprawdzić", summary, "Wklej twierdzenie albo link — wtedy sprawdzę."].join("\n"),
            ];
        case "error":
            return [
                [
                    "❗ Nie udało się sprawdzić — to nie jest werdykt.",
                    summary,
                    limitationBlock(result),
                ]
                    .filter(Boolean)
                    .join("\n"),
            ];
        case "out_of_scope":
            return [
                [
                    "🚧 Poza zakresem — to nie jest werdykt.",
                    summary,
                    "Sprawdzam twierdzenia faktograficzne; opinii i prognoz nie oceniam.",
                ].join("\n"),
            ];
        default:
            return [];
    }
}

/** Split text that is longer than one chunk, preferring line and word boundaries. */
function splitLongBlock(block: string): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const token of block.split(/(\s+)/)) {
        if (token.length > MAX_CHUNK_CHARS) {
            if (current.trim()) chunks.push(current.trim());
            current = "";
            for (let i = 0; i < token.length; i += MAX_CHUNK_CHARS) {
                chunks.push(token.slice(i, i + MAX_CHUNK_CHARS));
            }
            continue;
        }
        if (current.length + token.length > MAX_CHUNK_CHARS) {
            if (current.trim()) chunks.push(current.trim());
            current = token.trimStart();
        } else {
            current += token;
        }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/** Pack logical blocks into chunks that fit Discord's limit (1900 < 2000). */
function packBlocks(blocks: string[]): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const block of blocks) {
        const text = block.trim();
        if (!text) continue;

        const pieces = text.length > MAX_CHUNK_CHARS ? splitLongBlock(text) : [text];
        for (const piece of pieces) {
            if (!piece) continue;
            const candidate = current ? `${current}\n\n${piece}` : piece;
            if (candidate.length <= MAX_CHUNK_CHARS) {
                current = candidate;
            } else {
                if (current) chunks.push(current);
                current = piece;
            }
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

/**
 * Render a VerifyResponse as one or more Discord-safe chunks.
 * Every chunk is <= 1900 characters; the caller must still not merge chunks.
 */
export function formatVerdictMessage(result: VerifyResponse): string[] {
    if (result.status !== "ok") {
        const rejected = statusBlocks(result);
        if (rejected.length > 0) return packBlocks(rejected);
    }

    const blocks: string[] = [headerBlock(result)];

    for (const [index, claim] of result.claims.entries()) {
        blocks.push(claimBlock(claim, index));
    }

    const limitations = limitationBlock(result);
    if (limitations) blocks.push(limitations);

    blocks.push(footerBlock(result));

    const chunks = packBlocks(blocks);
    if (chunks.length > 0) return chunks;
    return packBlocks(["❗ Nie udało się zbudować odpowiedzi. To nie jest werdykt."]);
}
