/**
 * Ingest a local snapshot of the EUvsDisinfo case base via their MCP server.
 *
 *   EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
 *   EUVD_LIMIT=5000 EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
 *
 * Writes data/euvsdisinfo/cases.ndjson. Runtime search needs no token.
 * The MCP server exposes list tools only (no search), hence the local snapshot.
 */
import "dotenv/config";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = process.env["EUVD_MCP_URL"] ?? "https://mcp.euvsd.info/mcp";
const TOKEN = process.env["EUVD_TOKEN"] ?? process.env["EUVD_MCP_TOKEN"] ?? "";
const MAX_TOTAL = 19_248;
const DEFAULT_LIMIT = 2000;
/** The server caps a single page at 100 rows. */
const PAGE = 100;

const parsedLimit = Number(process.env["EUVD_LIMIT"] ?? DEFAULT_LIMIT);
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit >= 1
    ? Math.min(MAX_TOTAL, Math.floor(parsedLimit))
    : DEFAULT_LIMIT;

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "euvsdisinfo", "cases.ndjson");
const TMP = `${OUT}.tmp`;

type DisinfoCase = {
    id: string;
    title: string;
    claim: string;
    fact: string;
    date: number | null;
    url: string;
};

type Json = Record<string, unknown>;

type Page = { items: Json[]; hasNext: boolean | null; total: number | null };

function isJson(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(record: Json, keys: string[]): string {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return "";
}

function numberField(record: Json, keys: string[]): number | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return null;
}

function booleanField(record: Json, keys: string[]): boolean | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "boolean") return value;
    }
    return null;
}

/** MCP streamable HTTP answers either plain JSON or an SSE stream. */
function parseMessages(body: string): Json[] {
    const trimmed = body.trim();
    if (!trimmed) return [];

    const messages: Json[] = [];
    const push = (text: string) => {
        try {
            const parsed: unknown = JSON.parse(text);
            if (Array.isArray(parsed)) messages.push(...parsed.filter(isJson));
            else if (isJson(parsed)) messages.push(parsed);
        } catch {
            // Not JSON (HTML error page, keep-alive comment): ignore here, the
            // caller reports an empty/unreadable response.
        }
    };

    // Plain JSON body.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) push(trimmed);

    // SSE: events separated by a blank line, payload in one or more `data:` lines.
    for (const block of trimmed.split(/\r?\n\r?\n/)) {
        const data = block
            .split(/\r?\n/)
            .filter((line) => line.trimStart().startsWith("data:"))
            .map((line) => line.trimStart().slice("data:".length).trim())
            .join("\n");
        if (data) push(data);
    }

    return messages;
}

function errorMessageOf(message: Json | undefined): string | null {
    const error = message?.["error"];
    if (!isJson(error)) return null;
    return typeof error["message"] === "string" ? error["message"] : "nieznany błąd MCP";
}

async function rpc(
    method: string,
    params: Json,
    sessionId: string | undefined,
    id: number,
): Promise<{ message: Json; sessionId?: string }> {
    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${TOKEN}`,
            ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text();
    const nextSession = response.headers.get("mcp-session-id") ?? sessionId;

    if (response.status === 401) {
        throw new Error(
            "MCP odrzucił token (401). Sprawdź EUVD_TOKEN w .env (nagłówek Authorization: Bearer <token>).",
        );
    }

    const messages = parseMessages(text);
    const message = messages.find((item) => item["id"] === id) ??
        messages.find((item) => "result" in item || "error" in item);

    if (!response.ok) {
        const detail = errorMessageOf(message) ?? text.replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(`MCP ${method}: HTTP ${response.status}${detail ? ` — ${detail}` : ""}`);
    }
    if (!message) {
        throw new Error(`MCP ${method}: pusta lub nieczytelna odpowiedź (${text.slice(0, 120)})`);
    }

    const error = errorMessageOf(message);
    if (error) throw new Error(`MCP ${method}: ${error}`);

    return { message, sessionId: nextSession };
}

/**
 * Lifecycle notification required after `initialize`. Servers that do not care
 * may answer 202/204 or reject it; that must not kill the ingest, so only auth
 * failures are fatal here.
 */
async function notify(method: string, sessionId: string | undefined): Promise<void> {
    const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${TOKEN}`,
            ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", method }),
        signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401) {
        throw new Error("MCP odrzucił token (401) przy notifications/initialized.");
    }
    if (!response.ok) {
        console.warn(`[euvsdisinfo] ${method} zwróciło HTTP ${response.status} — kontynuuję.`);
    }
}

const ITEM_KEYS = ["cases", "articles", "items", "results", "records", "data"];

/** Finds the row array at the top level or one level down. */
function findItems(value: unknown, depth = 0): { rows: Json[]; holder: Json } | null {
    if (Array.isArray(value)) {
        const rows = value.filter(isJson);
        return { rows, holder: {} };
    }
    if (!isJson(value) || depth > 1) return null;

    for (const key of ITEM_KEYS) {
        const candidate = value[key];
        if (Array.isArray(candidate)) {
            return { rows: candidate.filter(isJson), holder: value };
        }
        if (isJson(candidate)) {
            const nested = findItems(candidate, depth + 1);
            if (nested) {
                // Pagination flags may sit on the outer object instead.
                return { rows: nested.rows, holder: { ...nested.holder, ...value } };
            }
        }
    }

    return null;
}

function withFlags(rows: Json[], holder: Json, envelope?: Json): Page {
    const sources = envelope ? [holder, envelope] : [holder];
    const pick = <T>(read: (record: Json) => T | null): T | null => {
        for (const source of sources) {
            const value = read(source);
            if (value !== null) return value;
        }
        return null;
    };

    return {
        items: rows,
        hasNext: pick((record) =>
            booleanField(record, ["hasNextPage", "has_next_page", "hasNext", "has_more"]),
        ),
        total: pick((record) =>
            numberField(record, ["total", "totalCount", "total_count", "count"]),
        ),
    };
}

function textFromContent(result: Json): string {
    const content = result["content"];
    if (!Array.isArray(content)) return "";
    return content
        .filter(isJson)
        .map((block) => (typeof block["text"] === "string" ? block["text"] : ""))
        .filter(Boolean)
        .join("\n");
}

function pageFromResult(result: unknown): Page {
    if (!isJson(result)) throw new Error("odpowiedź nie zawiera obiektu result");

    if (result["isError"] === true) {
        const detail = textFromContent(result).replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(`narzędzie zwróciło błąd${detail ? `: ${detail}` : ""}`);
    }

    const structured = findItems(result["structuredContent"]);
    if (structured) return withFlags(structured.rows, structured.holder, result);

    // Spec says structured tools also echo serialized JSON in a text block.
    for (const block of Array.isArray(result["content"]) ? result["content"] : []) {
        if (!isJson(block) || typeof block["text"] !== "string") continue;
        try {
            const parsed: unknown = JSON.parse(block["text"]);
            const page = findItems(parsed);
            if (page) return withFlags(page.rows, page.holder, result);
        } catch {
            // Plain prose, not JSON.
        }
    }

    const direct = findItems(result);
    if (direct) return withFlags(direct.rows, direct.holder);

    throw new Error("nie rozpoznano formatu odpowiedzi (brak structuredContent/cases)");
}

function toEpochSeconds(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        // Heuristic: 13+ digits means milliseconds.
        return Math.round(value > 100_000_000_000 ? value / 1000 : value);
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return Math.round(parsed / 1000);
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) return toEpochSeconds(numeric);
    }
    return null;
}

function toCase(record: Json): DisinfoCase | null {
    const claim = textField(record, ["claim", "false_claim", "disinfo_claim"]);
    const url = textField(record, ["url", "link", "article_url", "source_url"]);
    if (!claim || !url) return null;

    return {
        id: textField(record, ["id", "case_id", "slug"]) || url,
        title: textField(record, ["title", "name"]) || claim.slice(0, 200),
        claim,
        fact: textField(record, ["fact", "debunk", "correction", "explanation", "summary", "description"]),
        date: toEpochSeconds(record["date"] ?? record["published_at"] ?? record["publishedAt"]),
        url,
    };
}

async function main(): Promise<void> {
    console.log(`EUvsDisinfo: ${ENDPOINT} (limit ${LIMIT}, strona ${PAGE})`);

    const init = await rpc(
        "initialize",
        {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "prawdowid", version: "0.1.0" },
        },
        undefined,
        1,
    );
    const session = init.sessionId;
    await notify("notifications/initialized", session);

    const out: DisinfoCase[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let total: number | null = null;
    let missingFact = 0;
    let duplicatePages = 0;
    let requestId = 2;

    while (offset < LIMIT && offset < MAX_TOTAL) {
        const limit = Math.min(PAGE, LIMIT - offset, MAX_TOTAL - offset);
        const { message } = await rpc(
            "tools/call",
            { name: "cases", arguments: { offset, limit } },
            session,
            requestId++,
        );

        const page = pageFromResult(message["result"]);
        if (page.total !== null) total = page.total;

        const rows = page.items.slice(0, limit);
        if (rows.length === 0) break;

        let added = 0;
        for (const record of rows) {
            const item = toCase(record);
            if (!item) continue;

            const key = item.id || item.url;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
            added++;
            if (!item.fact) missingFact++;
        }

        offset += rows.length;
        duplicatePages = added === 0 ? duplicatePages + 1 : 0;

        const target = Math.min(LIMIT, total ?? LIMIT);
        process.stdout.write(`\r${out.length}/${target} przypadków (offset ${offset})`);

        if (page.hasNext === false) break;
        if (rows.length < limit && page.hasNext !== true) break;
        if (duplicatePages >= 2) {
            console.warn("\n[euvsdisinfo] serwer zwraca te same wiersze — przerywam paginację.");
            break;
        }
    }

    if (out.length === 0) {
        throw new Error(
            "nie pobrano żadnego przypadku — nie nadpisuję istniejącego snapshotu w data/euvsdisinfo/cases.ndjson",
        );
    }

    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(TMP, out.map((item) => JSON.stringify(item)).join("\n") + "\n", "utf8");
    await rename(TMP, OUT);

    const base = total !== null ? `, baza: ${total}` : "";
    console.log(`\nZapisano ${out.length} przypadków do ${OUT}${base}`);
    if (missingFact > 0) {
        console.log(
            `Uwaga: ${missingFact} przypadków bez pola "fact" — runtime ich nie użyje jako dowodu.`,
        );
    }
}

if (!TOKEN) {
    console.error(
        [
            "EUvsDisinfo: brak EUVD_TOKEN — ingest pominięty.",
            "Ustaw EUVD_TOKEN w .env (token do MCP EUvsDisinfo), potem:",
            "  bun run scripts/ingest-euvsdisinfo.ts",
            "Runtime nie potrzebuje tokenu: czyta gotowy snapshot data/euvsdisinfo/cases.ndjson.",
        ].join("\n"),
    );
    process.exit(1);
}

try {
    await main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nEUvsDisinfo: ingest nieudany — ${message}`);
    if (/fetch failed|ECONN|ENOTFOUND|timeout/i.test(message)) {
        console.error("Sprawdź połączenie z siecią oraz EUVD_MCP_URL.");
    }
    process.exit(1);
}
