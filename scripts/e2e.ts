/**
 * E2E: podnosi prawdziwy serwer na PORCIE 3110 i sprawdza kontrakt HTTP.
 *
 * Zero zależności: Bun.spawn + fetch. Każdy punkt to jedno twierdzenie PASS/FAIL.
 * Uwaga: /verify woła prawdziwe modele i źródła, więc test trwa 1-3 minuty.
 *
 * Uruchomienie: bun run scripts/e2e.ts
 * Kod wyjścia 1, jeśli cokolwiek nie zagra.
 */
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env["E2E_PORT"] ?? 3110);
const BASE = `http://127.0.0.1:${PORT}`;

const VERDICT_CLASSES = new Set([
    "confirmed",
    "false",
    "misleading",
    "insufficient_evidence",
    "not_verifiable",
]);

/** Pytanie, na które pipeline nie ma odpowiedzi w bazie — musi wracać jako nierozstrzygnięte. */
const EMPTY_QUESTION = "W 2026 roku Sejm uchwalił podatek od posiadania kota.";
const SAMPLE_TEXT = "Rafał Brzoska został postrzelony na Alejach Jerozolimskich w Warszawie.";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function check(name: string, ok: boolean, detail = ""): void {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

type Json = Record<string, unknown> | null;

type Reply = {
    status: number;
    contentType: string;
    text: string;
    json: Json;
};

async function request(path: string, init: RequestInit = {}, timeoutMs = 240_000): Promise<Reply> {
    const response = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let json: Json = null;
    try {
        json = JSON.parse(text) as Json;
    } catch {
        json = null;
    }
    return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        text,
        json,
    };
}

function postVerify(body: unknown, timeoutMs = 240_000): Promise<Reply> {
    return request(
        "/verify",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        },
        timeoutMs,
    );
}

function verdictsOf(reply: Reply): string[] {
    const claims = Array.isArray(reply.json?.["claims"]) ? (reply.json?.["claims"] as Array<Record<string, unknown>>) : [];
    return claims.map((claim) => String(claim["verdict"] ?? "brak"));
}

function isVerdictBody(reply: Reply): boolean {
    const status = reply.json?.["status"];
    return status === "ok" || status === "needs_clarification";
}

// --- serwer ----------------------------------------------------------------
let server: ReturnType<typeof Bun.spawn> | null = null;
const serverLog: string[] = [];

async function portAlreadyBusy(): Promise<boolean> {
    try {
        const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
        return response.ok;
    } catch {
        return false;
    }
}

async function waitForHealth(totalMs = 10_000): Promise<boolean> {
    const deadline = Date.now() + totalMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
            if (response.ok) return true;
        } catch {
            // serwer jeszcze nie wstał
        }
        await sleep(250);
    }
    return false;
}

async function stopServer(): Promise<void> {
    if (!server) return;
    const child = server;
    server = null;
    try {
        child.kill();
    } catch {
        // już martwy
    }

    const exited = await Promise.race([
        child.exited.then(() => "exited" as const),
        sleep(5000).then(() => "timeout" as const),
    ]);

    if (exited === "timeout") {
        try {
            Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], {
                stdout: "ignore",
                stderr: "ignore",
            });
        } catch (error) {
            console.error(`[e2e] nie udało się dobić procesu ${child.pid}: ${(error as Error).message}`);
        }
    }
}

try {
    if (await portAlreadyBusy()) {
        console.error(`FAIL: port ${PORT} już odpowiada na /health — zatrzymaj stary serwer i spróbuj ponownie.`);
        process.exit(1);
    }

    console.log(`[e2e] start serwera: PORT=${PORT}`);
    server = Bun.spawn([process.execPath, "run", "src/index.ts"], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdout: "ignore",
        stderr: "pipe",
    });

    void (async () => {
        const decoder = new TextDecoder();
        try {
            for await (const chunk of server!.stderr as AsyncIterable<Uint8Array>) {
                serverLog.push(decoder.decode(chunk).trimEnd());
            }
        } catch {
            // strumień zamknięty przy killu
        }
    })();

    if (!(await waitForHealth(10_000))) {
        check("serwer wstaje w 10 s i odpowiada na /health", false, "brak odpowiedzi");
        throw new Error("serwer nie wystartował");
    }
    check("serwer wstaje w 10 s i odpowiada na /health", true, `pid ${server.pid}`);

    // --- a) podstawowe endpointy ------------------------------------------
    const health = await request("/health", {}, 5_000);
    check(
        "a) GET /health -> 200, ok:true",
        health.status === 200 && health.json?.["ok"] === true,
        `HTTP ${health.status}, body=${health.text.slice(0, 120)}`,
    );

    const metrics = await request("/metrics", {}, 5_000);
    const metricsOk =
        metrics.status === 200 &&
        metrics.contentType.includes("application/json") &&
        typeof metrics.json?.["total"] === "number" &&
        typeof metrics.json?.["verdicts"] === "object";
    check(
        "a) GET /metrics -> 200, JSON z total i verdicts",
        metricsOk,
        `HTTP ${metrics.status}, content-type=${metrics.contentType}`,
    );

    const docs = await request("/docs", {}, 5_000);
    check(
        "a) GET /docs -> 200, dokumentacja HTML",
        docs.status === 200 && docs.contentType.includes("text/html") && docs.text.length > 200,
        `HTTP ${docs.status}, content-type=${docs.contentType}`,
    );

    // --- b) /verify z tekstem ---------------------------------------------
    const web = await postVerify({ text: SAMPLE_TEXT, channel: "web" });
    const webVerdicts = verdictsOf(web);
    const classesOk = webVerdicts.every((verdict) => VERDICT_CLASSES.has(verdict));
    check(
        "b) POST /verify (tekst) -> 200, status ok/needs_clarification",
        web.status === 200 && isVerdictBody(web),
        `HTTP ${web.status}, status=${String(web.json?.["status"])}, claims=${webVerdicts.length}`,
    );
    check(
        "b) każdy werdykt w jednej z 5 klas",
        classesOk,
        webVerdicts.length === 0 ? "brak twierdzeń (też dopuszczalne)" : webVerdicts.join(", "),
    );
    check(
        "b) odpowiedź zawsze ma zastrzeżenie (disclaimer)",
        typeof web.json?.["disclaimer"] === "string" && (web.json?.["disclaimer"] as string).length > 20,
        String(web.json?.["disclaimer"] ?? "brak").slice(0, 80),
    );

    // --- c) spójność kanałów ----------------------------------------------
    const api = await postVerify({ text: SAMPLE_TEXT, channel: "api" });
    const apiVerdicts = verdictsOf(api);
    const sameVerdicts = webVerdicts.length === apiVerdicts.length && webVerdicts.every((v, i) => v === apiVerdicts[i]);
    check(
        "c) kanał web i api dają identyczną listę werdyktów",
        api.status === 200 && sameVerdicts,
        `web=[${webVerdicts.join(",")}] api=[${apiVerdicts.join(",")}]`,
    );

    // --- d) puste wejście -------------------------------------------------
    // Uwaga: odrzucenie walidacyjne zwraca BAD_INPUT (status/summary/limitations) bez pola `claims`.
    const empty = await postVerify({});
    const emptyClaims = empty.json?.["claims"];
    const noVerdictPayload = emptyClaims === undefined || (Array.isArray(emptyClaims) && emptyClaims.length === 0);
    check(
        "d) POST /verify {} -> 4xx, status error, zero werdyktów",
        empty.status >= 400 && empty.status < 500 && empty.json?.["status"] === "error" && noVerdictPayload,
        `HTTP ${empty.status}, status=${String(empty.json?.["status"])}, claims=${JSON.stringify(emptyClaims)}`,
    );

    // --- e) za długi tekst ------------------------------------------------
    const tooLong = await postVerify({ text: "a".repeat(100_001) });
    check(
        "e) 100 001 znaków -> 4xx, nie werdykt",
        tooLong.status >= 400 && tooLong.status < 500 && !isVerdictBody(tooLong),
        `HTTP ${tooLong.status}, status=${String(tooLong.json?.["status"])}`,
    );

    // --- f) niebezpieczne schematy URL ------------------------------------
    const fileUrl = await postVerify({ url: "file:///etc/passwd" });
    check(
        "f) url file:/// -> 4xx",
        fileUrl.status >= 400 && fileUrl.status < 500 && !isVerdictBody(fileUrl),
        `HTTP ${fileUrl.status}`,
    );

    const jsUrl = await postVerify({ url: "javascript:alert(1)" });
    check(
        "f) url javascript: -> 4xx",
        jsUrl.status >= 400 && jsUrl.status < 500 && !isVerdictBody(jsUrl),
        `HTTP ${jsUrl.status}`,
    );

    // --- g) pętla informacji: 3x to samo nierozstrzygnięte pytanie ---------
    const casesBefore = await request("/cases", {}, 5_000);
    const beforeCases = Array.isArray(casesBefore.json?.["cases"])
        ? (casesBefore.json?.["cases"] as Array<Record<string, unknown>>)
        : [];
    const normalize = (value: unknown) => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const countBefore = Number(
        beforeCases.find((item) => normalize(item["question"]) === normalize(EMPTY_QUESTION))?.["count"] ?? 0,
    );

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const reply = await postVerify({ text: EMPTY_QUESTION, channel: "web" });
        check(
            `g) zgłoszenie ${attempt}/3 nierozstrzygniętego pytania -> 200`,
            reply.status === 200,
            `HTTP ${reply.status}, status=${String(reply.json?.["status"])}`,
        );
    }

    type CaseRow = Record<string, unknown>;
    let match: CaseRow | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const cases = await request("/cases", {}, 5_000);
        const rows = Array.isArray(cases.json?.["cases"]) ? (cases.json?.["cases"] as CaseRow[]) : [];
        match = rows.find((item) => normalize(item["question"]) === normalize(EMPTY_QUESTION));
        const current = Number(match?.["count"] ?? 0);
        const alerted = match?.["escalated"] === true || (match?.["alertReason"] ?? null) !== null;
        // count rośnie w pamięci chwilę przed alertem (recordUnresolved jest fire-and-forget),
        // więc czekamy na oba warunki, nie tylko na licznik.
        if (match && current >= countBefore + 3 && alerted) break;
        await sleep(500);
    }

    const count = Number(match?.["count"] ?? 0);
    const escalated = match?.["escalated"] === true;
    const recommended = match?.["alertReason"] !== null && match?.["alertReason"] !== undefined;
    check(
        "g) GET /cases: to samo pytanie ma count>=3",
        count >= 3,
        `count=${count} (przed testem ${countBefore})`,
    );
    check(
        "g) sprawa jest eskalowana albo ma rekomendację przekazania",
        escalated || recommended,
        `escalated=${escalated}, alertReason=${String(match?.["alertReason"] ?? "brak").slice(0, 100)}`,
    );
    check(
        "g) każde z 3 zgłoszeń zostało policzone",
        count >= countBefore + 3,
        `przyrost=${count - countBefore}`,
    );

    // --- h) rate limit ----------------------------------------------------
    const burst = await Promise.all(
        Array.from({ length: 21 }, () => postVerify({}, 10_000).catch(() => null)),
    );
    const throttled = burst.filter((reply) => reply?.status === 429).length;
    check(
        "h) 21 szybkich żądań -> przynajmniej jedno 429",
        throttled >= 1,
        `429: ${throttled}/21`,
    );
} catch (error) {
    check("przebieg E2E bez wyjątku", false, (error as Error).message);
} finally {
    await stopServer();
    await sleep(200);
}

if (serverLog.length > 0) {
    const tail = serverLog.join("").split("\n").filter(Boolean).slice(-15);
    if (results.some((item) => !item.ok)) {
        console.log("\nOstatnie logi serwera:");
        for (const line of tail) console.log(`  ${line}`);
    }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"}: ${results.length - failed.length}/${results.length} kontroli.`);
process.exit(failed.length === 0 ? 0 : 1);
