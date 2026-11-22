/**
 * Shared contract for every layer: pipeline, sources, research, API, channels.
 * Do not rename fields without updating docs/CONTRACT.md and all adapters.
 */

/** Task verdict classes (PRAWDOWID): confirmed / false / misleading / insufficient / not-verifiable. */
export type Verdict =
    | "confirmed"
    | "false"
    | "misleading"
    | "insufficient_evidence"
    | "not_verifiable";

/** Outcome of the request itself. Never mix these with a substantive verdict. */
export type OutcomeStatus = "ok" | "error" | "needs_clarification" | "out_of_scope";

export type EvidenceType = "primary" | "secondary" | "fact_check";
export type EvidenceRelation = "supports" | "refutes" | "context";

export type Evidence = {
    title: string;
    publisher: string;
    publishedAt: string | null;
    retrievedAt: string;
    url: string;
    excerpt: string;
    type: EvidenceType;
    relation: EvidenceRelation;
};

export type Strength = "high" | "medium" | "low";

export type ClaimVerdict = {
    id: string;
    claim: string;
    verdict: Verdict;
    /** 0..1, precomputed from evidence quality, recency and agreement. */
    confidence: number;
    strength: Strength;
    /** Short, plain-Polish explanation (1-3 sentences). */
    reasoning: string;
    evidence: Evidence[];
    limitations: string[];
    /** Date the verdict is evaluated at (article date or today). */
    asOf: string;
    /** True when the verdict came from the verified cache. */
    cached: boolean;
};

/** Minimal claim shape shared with the pipeline (structurally compatible with pipeline Claim). */
export type ClaimInput = {
    id: string;
    text: string;
    quote: string;
    details: string;
    fact: {
        s: string;
        p: string;
        o: string | number;
        t?: string;
        by?: string;
        m?: string;
        neg?: boolean;
    };
};

export type SourceDoc = {
    id: string;
    title: string;
    publisher: string;
    url: string;
    publishedAt: string | null;
    retrievedAt: string | null;
    type: EvidenceType;
    lang: string;
    /** 1-3 sentence neutral description of what the page/document establishes. */
    summary: string;
    topics: string[];
    /** Set by scripts/ingest-sources.ts after a successful fetch. */
    verified: boolean;
};

export type SourceHit = {
    doc: SourceDoc;
    score: number;
};

export type ResearchOptions = {
    /** ISO date used for temporal filtering; defaults to today. */
    asOf?: string;
    /** Optional cap on claims to research. */
    maxClaims?: number;
    /** Skip network calls and use only the local corpus. */
    offline?: boolean;
};

export type ResearchResult = {
    claims: ClaimVerdict[];
    sourcesUsed: string[];
    models: string[];
    costUsd: number;
};

/** Per-stage cost split, USD. An estimate, never presented as exact billing. */
export type CostBreakdown = {
    /** DeepSeek extraction (real tokens from ChatDetailed × list prices). */
    extractionUsd: number;
    /** DeepSeek gate + statement matching (real token usage). */
    matchUsd: number;
    /** Local hashed embeddings (free). */
    embeddingUsd: number;
};

/** verifyInput adds the research stage on top of the pipeline stages. */
export type VerifyCostBreakdown = CostBreakdown & {
    /** Research (Google Fact Check / Wikipedia / EUvsDisinfo), as reported by research. */
    researchUsd: number;
};

export type VerifyRequest = {
    text?: string;
    url?: string;
    /** Image as raw base64 or a `data:<mime>;base64,` URI. Text is read via OCR. */
    image?: string;
    channel?: "web" | "discord" | "api" | "sms";
};

export type VerifyResponse = {
    status: OutcomeStatus;
    language: "pl";
    input: { kind: "text" | "url" | "image"; preview: string };
    summary: string;
    claims: ClaimVerdict[];
    /** Verdict for the whole statement when it contains several claims. */
    overallVerdict?: Verdict | null;
    limitations: string[];
    timingMs: number;
    costUsd: number;
    /** Stage split behind `costUsd`; sums to it (estimated). */
    costBreakdown?: VerifyCostBreakdown;
    models: string[];
    sourcesUsed: string[];
    sessionId: string;
    disclaimer: string;
};

export const DISCLAIMER_PL =
    "To nie jest wyrok sądu. System pokazuje, co wynika z dostępnych źródeł i gdzie kończy się jego wiedza. Sprawdź linki do źródeł.";

export const VERDICT_LABELS_PL: Record<Verdict, string> = {
    confirmed: "Potwierdzone",
    false: "Fałszywe",
    misleading: "Wprowadzające w błąd",
    insufficient_evidence: "Brak wystarczających dowodów",
    not_verifiable: "Nie podlega weryfikacji",
};
