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
        async ({ body, set }) => {
            const request = body as VerifyBody;
            const text = typeof request.text === "string" ? request.text.trim() : "";
            const url = typeof request.url === "string" ? request.url.trim() : "";
            const channel = request.channel ?? "api";

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

                if (response.status === "error") set.status = 500;
                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error("[verification-api] verifyInput threw:", message);
                set.status = 500;

                const failed = errorResponse("Nie udało się wykonać sprawdzenia. To nie jest werdykt.", [
                    message.slice(0, 300),
                ], {
                    kind: url && !text ? "url" : "text",
                    preview: (url || text).slice(0, 200),
                });

                void logVerification({
                    sessionId: failed.sessionId,
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
