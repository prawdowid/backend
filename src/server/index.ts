/**
 * HTTP API for the fact-checking pipeline: /verify, /health, /metrics and the web UI.
 * Mount it on the main app with `app.use(verificationApi)`.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Elysia, t } from "elysia";
import { defaultCache, verifyInput } from "../pipeline/verify";
import { DISCLAIMER_PL, type VerifyRequest, type VerifyResponse } from "../pipeline/types";
import { getMetrics, logVerification } from "./logger";
import { acknowledgeCase, listCases, recordUnresolved } from "../moderation";

const MAX_TEXT = 100_000;
const VERSION = "0.1.0";

const PUBLIC_INDEX = fileURLToPath(new URL("../../public/index.html", import.meta.url));

const VALIDATION_LIMITATIONS = [
    "Przyjmuję tekst do 100 000 znaków albo poprawny adres URL (http/https).",
    "Nic nie zostało sprawdzone. To nie jest werdykt.",
];

const BAD_INPUT = {
    status: "error" as const,
    summary: "Podaj tekst albo poprawny link.",
    limitations: VALIDATION_LIMITATIONS,
};

const channelSchema = t.Optional(
    t.Union([t.Literal("web"), t.Literal("discord"), t.Literal("api"), t.Literal("sms")]),
);

const verifyBodySchema = t.Object({
    text: t.Optional(
        t.String({ maxLength: MAX_TEXT, error: "Treść jest zbyt długa (limit 100 000 znaków)." }),
    ),
    url: t.Optional(t.String({ format: "uri" })),
    channel: channelSchema,
});

type VerifyBody = {
    text?: string;
    url?: string;
    channel?: VerifyRequest["channel"];
};

function errorResponse(summary: string, limitations: string[], input?: VerifyResponse["input"]): VerifyResponse {
    return {
        status: "error",
        language: "pl",
        input: input ?? { kind: "text", preview: "" },
        summary,
        claims: [],
        limitations,
        timingMs: 0,
        costUsd: 0,
        models: [],
        sourcesUsed: [],
        sessionId: randomUUID(),
        disclaimer: DISCLAIMER_PL,
    };
}

function isHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function html(body: string): Response {
    return new Response(body, {
        headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Fixed-window limiter per client IP. Demo-grade, in-memory. */
function isRateLimited(key: string): boolean {
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
        return false;
    }

    bucket.count += 1;
    return bucket.count > RATE_MAX;
}

export const verificationApi = new Elysia({ name: "verification-api" })
    .onError({ as: "local" }, ({ code, set, error }) => {
        if (code === "VALIDATION" || code === "PARSE") {
            set.status = 400;
            return BAD_INPUT;
        }

        // Anything else is a technical failure of the request, never a verdict.
        console.error("[verification-api]", code, (error as Error)?.message ?? error);
        set.status = 500;
        return errorResponse("Nie udało się przetworzyć zgłoszenia. To nie jest werdykt.", [
            "Błąd techniczny po stronie serwera.",
        ]);
    })
    .post(
        "/verify",
        async ({ body, set, request, server }) => {
            const input = body as VerifyBody;
            const ip =
                server?.requestIP(request)?.address ??
                request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                "unknown";

            if (isRateLimited(ip)) {
                set.status = 429;
                return errorResponse("Zbyt wiele zapytań. Spróbuj ponownie za chwilę.", [
                    `Limit: ${RATE_MAX} zapytań na minutę.`,
                    "Nic nie zostało sprawdzone. To nie jest werdykt.",
                ]);
            }

            const text = typeof input.text === "string" ? input.text.trim() : "";
            const url = typeof input.url === "string" ? input.url.trim() : "";
            const channel = input.channel ?? "api";

            if (!text && !url) {
                set.status = 400;
                return BAD_INPUT;
            }

            if (url && !isHttpUrl(url)) {
                set.status = 400;
                return {
                    status: "error" as const,
                    summary: "Podaj tekst albo poprawny link.",
                    limitations: [
                        "Link musi być pełnym adresem http:// lub https://.",
                        "Nic nie zostało sprawdzone. To nie jest werdykt.",
                    ],
                };
            }

            try {
                const response = await verifyInput(
                    {
                        ...(text ? { text } : {}),
                        ...(url ? { url } : {}),
                        channel,
                    },
                    { cache: defaultCache },
                );

                void logVerification({
                    sessionId: response.sessionId,
                    question: response.input.preview,
                    status: response.status,
                    timingMs: response.timingMs,
                    claims: response.claims,
                    channel,
                    inputKind: response.input.kind,
                    models: response.models,
                    costUsd: response.costUsd,
                }).catch((error: unknown) => {
                    console.error("[verification-api] log nie zapisany:", (error as Error).message);
                });

                // Information loop: unanswered questions are clustered and escalated later.
                void recordUnresolved({
                    question: response.input.preview,
                    claims: response.claims,
                    channel,
                }).catch((error: unknown) => {
                    console.error("[verification-api] pętla informacji:", (error as Error).message);
                });

                if (response.status === "error") set.status = 500;
                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error("[verification-api] verifyInput threw:", message);
                set.status = 500;

                const failed = errorResponse("Nie udało się wykonać sprawdzenia. To nie jest werdykt.", [
                    "Błąd techniczny po stronie serwera.",
                ], {
                    kind: url && !text ? "url" : "text",
                    preview: (url || text).slice(0, 200),
                });

                void logVerification({
                    sessionId: failed.sessionId,
                    question: failed.input.preview,
                    status: "error",
                    timingMs: 0,
                    claims: [],
                    channel,
                    inputKind: failed.input.kind,
                    models: [],
                    costUsd: 0,
                }).catch(() => undefined);

                return failed;
            }
        },
        { body: verifyBodySchema },
    )
    .get("/health", () => ({
        ok: true,
        uptimeSec: getMetrics().uptimeSec,
        version: VERSION,
    }))
    .get("/cases", async () => {
        const cases = await listCases();
        return {
            total: cases.length,
            open: cases.filter((item) => item.status === "open").length,
            escalated: cases.filter((item) => item.escalated).length,
            recommended: cases.filter((item) => item.alertReason !== null && !item.escalated).length,
            cases,
        };
    })
    .post("/cases/:id/ack", async ({ params, set }) => {
        const acknowledged = await acknowledgeCase(params.id);
        if (!acknowledged) {
            set.status = 404;
            return { error: "Nie znaleziono sprawy." };
        }
        return { ok: true, case: acknowledged };
    })
    .get("/metrics", () => getMetrics())
    .get("/", async () => {
        try {
            return html(await readFile(PUBLIC_INDEX, "utf8"));
        } catch {
            return new Response("Brak interfejsu.", {
                status: 500,
                headers: { "content-type": "text/plain; charset=utf-8" },
            });
        }
    })
    .get("/index.html", async () => {
        try {
            return html(await readFile(PUBLIC_INDEX, "utf8"));
        } catch {
            return new Response("Brak interfejsu.", {
                status: 500,
                headers: { "content-type": "text/plain; charset=utf-8" },
            });
        }
    });
