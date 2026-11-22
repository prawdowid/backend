import "dotenv/config";
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { verificationApi } from "./server";

const port = Number(process.env.PORT ?? 3000);

const CORS_ORIGINS = new Set(
    (
        process.env["CORS_ORIGINS"] ??
        "https://prawdowid.org,https://www.prawdowid.org,http://localhost:3001,http://localhost:3000"
    )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
);

function corsHeaders(origin: string | null): Record<string, string> {
    if (!origin || !CORS_ORIGINS.has(origin)) return {};
    return {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, x-request-id",
        "access-control-max-age": "86400",
        vary: "Origin",
    };
}

const app = new Elysia()
    .onRequest(({ request, set }) => {
        const origin = request.headers.get("origin");
        for (const [key, value] of Object.entries(corsHeaders(origin))) {
            set.headers[key] = value;
        }
        if (request.method === "OPTIONS") {
            const headers = new Headers();
            for (const [key, value] of Object.entries(set.headers)) {
                if (value !== undefined) headers.set(key, String(value));
            }
            return new Response(null, { status: 204, headers });
        }
    })
    .use(swagger({ path: "/docs" }))
    .use(verificationApi)
    .listen(port);

console.log(`Prawdowid działa: http://${app.server?.hostname}:${app.server?.port}`);

export default app;
