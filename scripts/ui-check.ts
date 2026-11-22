/**
 * Statyczna kontrola dostępności i spójności interfejsu (public/index.html).
 *
 * Nie uruchamia przeglądarki: czyta plik i sprawdza, czy formularz ma etykiety,
 * komunikaty dla czytników ekranu, pięć klas werdyktów, zastrzeżenie i czy nie
 * ciągnie niczego z zewnętrznych CDN.
 *
 * Uruchomienie: bun run scripts/ui-check.ts
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const INDEX = fileURLToPath(new URL("../public/index.html", import.meta.url));

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string): void {
    checks.push({ name, ok, ...(detail ? { detail } : {}) });
}

const VERDICTS: Array<[string, string]> = [
    ["confirmed", "Potwierdzone"],
    ["false", "Fałszywe"],
    ["misleading", "Wprowadzające w błąd"],
    ["insufficient_evidence", "Brak wystarczających dowodów"],
    ["not_verifiable", "Nie podlega weryfikacji"],
];

let html = "";
try {
    html = await readFile(INDEX, "utf8");
    check("plik public/index.html istnieje", true);
} catch (error) {
    console.error(`FAIL: nie mogę odczytać public/index.html (${(error as Error).message})`);
    process.exit(1);
}

const has = (pattern: string | RegExp): boolean =>
    typeof pattern === "string" ? html.includes(pattern) : pattern.test(html);

// --- dokument --------------------------------------------------------------
check('język dokumentu: lang="pl"', has('<html lang="pl">'));
check("kodowanie: charset=utf-8", /<meta charset="utf-8"/i.test(html));
check("widok mobilny: viewport", /<meta name="viewport"/i.test(html));

// --- formularz -------------------------------------------------------------
check("formularz: <form id=\"verify-form\">", has('<form id="verify-form"'));
check("pole tekstowe: <textarea id=\"text\">", has(/<textarea[\s\S]{0,120}id="text"/));
check("pole linku: <input id=\"url\" type=\"url\">", has(/<input[\s\S]{0,160}id="url"[\s\S]{0,160}type="url"/));
check("etykieta dla pola tekstu", has('<label for="text"'));
check("etykieta dla pola linku", has('<label for="url"'));
check("przycisk wysyłki: type=\"submit\"", has(/<button[\s\S]{0,120}type="submit"/));
check(
    "podpowiedzi powiązane przez aria-describedby",
    (html.match(/aria-describedby="(text|url)-hint"/g) ?? []).length === 2,
);

// --- komunikaty dla czytników ekranu --------------------------------------
check("aria-live: status formularza", has('id="form-status"') && has(/id="form-status"[^>]*aria-live="polite"/));
check("aria-live: blok ładowania", has(/id="loading"[\s\S]{0,140}aria-live="polite"/));
check("aria-live: wyniki", has(/id="results"[\s\S]{0,160}aria-live="polite"/));
check("aria-busy na wynikach", has(/id="results"[\s\S]{0,200}aria-busy="false"/));
check("role=status dla postępu", has(/id="form-status"[^>]*role="status"/));
check("role=alert dla błędu", has('role: kind === "error" ? "alert" : "status"'));
check("skip link do wyników", has('href="#results"'));
check("ukrycie wizualne dla czytników (.visually-hidden)", has(".visually-hidden"));

// --- werdykty --------------------------------------------------------------
for (const [id, label] of VERDICTS) {
    check(`werdykt ${id}: etykieta "${label}"`, has(`"${label}"`));
}
check(
    "mapa werdyktów zawiera 5 klas",
    VERDICTS.every(([id]) => new RegExp(`\\b${id}\\s*:`).test(html)),
);

// --- obsługa stanów --------------------------------------------------------
check("status error ma własną etykietę", has('error: "Błąd — to nie jest werdykt"'));
check("status needs_clarification ma etykietę", has('needs_clarification: "Potrzebne doprecyzowanie"'));
check("banner błędu technicznego", has("Błąd techniczny — to nie jest werdykt"));
check("banner nie jest werdyktem (odpowiedź 4xx/5xx)", has("!response.ok && data.status !== \"error\""));
check("brak twierdzeń jest oznaczony jako brak oceny", has("To nie jest ocena prawdziwości doniesienia."));

// --- zastrzeżenie ----------------------------------------------------------
check("sekcja Zastrzeżenie w wyniku", has('el("h2", { text: "Zastrzeżenie" })'));
check("zastrzeżenie awaryjne (FALLBACK_DISCLAIMER)", has("FALLBACK_DISCLAIMER"));
check("stopka: charakter informacyjny", has("charakter informacyjny"));

// --- brak zależności zewnętrznych -----------------------------------------
const externalPatterns: Array<[string, RegExp]> = [
    ["<script src>", /<script[^>]+src=/i],
    ["<link href> do zasobu", /<link[^>]+href="(https?:)?\/\//i],
    ["@import w CSS", /@import\s+(url\()?["']?(https?:)?\/\//i],
    ["url(http...) w CSS", /url\(\s*["']?https?:\/\//i],
    ["@font-face z sieci", /@font-face[\s\S]{0,200}src:\s*url\(\s*["']?https?:/i],
    ["<iframe>", /<iframe/i],
];
for (const [name, pattern] of externalPatterns) {
    check(`brak zewnętrznego zasobu: ${name}`, !pattern.test(html));
}
check("fetch wyłącznie na własny /verify", has('fetch("/verify"'));
check("linki zewnętrzne mają rel=noopener", has('rel: "noopener noreferrer"'));

// --- dostępność interakcji -------------------------------------------------
check("focus-visible z outline", has(":focus-visible"));
check("duży cel dotykowy (min-height: 48px)", has("min-height: 48px"));
check("respektuje prefers-reduced-motion", has("@media (prefers-reduced-motion: reduce)"));
check("obsługa trybu ciemnego", has("@media (prefers-color-scheme: dark)"));
check("noscript: komunikat bez JS", has("<noscript>"));

// --- raport ----------------------------------------------------------------
let failed = 0;
for (const item of checks) {
    if (!item.ok) failed += 1;
    console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"}: ${checks.length - failed}/${checks.length} kontroli przeszło.`);
process.exit(failed === 0 ? 0 : 1);
