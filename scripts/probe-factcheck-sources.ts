/**
 * Probe publicznych źródeł fact-checkingowych — bez tokenów.
 *
 *   bun run scripts/probe-factcheck-sources.ts
 *   bun run scripts/probe-factcheck-sources.ts "Morawiecki"
 *   bun run scripts/probe-factcheck-sources.ts --google
 *
 * Co sprawdza:
 *   1. Demagog: publiczne WP REST search + ClaimReview JSON-LD na stronach
 *      /wypowiedzi/. To jedyne polskie źródło z ClaimReview, które odpowiedziało
 *      bez auth.
 *   2. Google Fact Check Tools — tylko gdy w .env jest GOOGLE_FACT_CHECK_API_KEY
 *      (albo flaga --google); pokazuje, jak rzadko pokrywa proste zdania.
 *   3. Wikidata SPARQL — nie fact-check, ale deterministyczne obalanie faktów
 *      typu stolica/waluta/długość.
 *   4. Szybki test formatu źródeł rządowych (IMGW JSON, CERT RSS, GIOŚ JSON).
 *
 * Nie scrapuje paywalli, nie omija zabezpieczeń. Tylko publiczne endpointy,
 * z własnym User-Agentem i małym limitem żądań.
 */
import "dotenv/config";

const UA = "PrawdowidBot/1.0 (fact-checking prototype; research probe)";
const TIMEOUT_MS = 15_000;

type Review = {
    claim: string;
    rating: string;
    ratingValue: string | null;
    url: string;
    publisher: string;
};

type SearchHit = { title: string; url: string; subtype?: string };

function clean(value: string): string {
    return value
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

async function get(url: string, accept = "*/*"): Promise<Response> {
    return fetch(url, {
        headers: { "user-agent": UA, accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
    });
}

// ---------------------------------------------------------------------------
// 1. Demagog: wyszukiwarka + ClaimReview
// ---------------------------------------------------------------------------

async function demagogSearch(
    query: string,
    perPage = 5,
    subtype = "wypowiedzi",
): Promise<SearchHit[]> {
    const url =
        "https://demagog.org.pl/wp-json/wp/v2/search" +
        `?search=${encodeURIComponent(query)}&per_page=${perPage}&subtype=${subtype}`;
    const response = await get(url, "application/json");
    if (!response.ok) throw new Error(`Demagog search ${response.status}`);

    const body: unknown = await response.json();
    if (!Array.isArray(body)) return [];

    return body.flatMap((item): SearchHit[] => {
        if (typeof item !== "object" || item === null) return [];
        const row = item as Record<string, unknown>;
        const link = typeof row["url"] === "string" ? row["url"] : "";
        if (!link) return [];
        return [
            {
                title: clean(typeof row["title"] === "string" ? row["title"] : link),
                url: link,
                subtype: typeof row["subtype"] === "string" ? row["subtype"] : undefined,
            },
        ];
    });
}

/** Demagog ma w JSON-LD `&nbsp;` w środku JSON-a, więc najpierw go naprawiamy. */
function claimReviewsFromHtml(html: string): Review[] {
    const reviews: Review[] = [];
    const blocks = html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );

    for (const block of blocks) {
        const raw = (block[1] ?? "")
            .replace(/&nbsp;/g, " ")
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .trim();

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            continue; // Inny, zepsuty blok JSON-LD — nie przerywamy całej strony.
        }

        const root = parsed as Record<string, unknown> | unknown[];
        const items = Array.isArray(root)
            ? root
            : Array.isArray((root as Record<string, unknown>)["@graph"])
              ? ((root as Record<string, unknown>)["@graph"] as unknown[])
              : [root];

        for (const item of items) {
            if (typeof item !== "object" || item === null) continue;
            const node = item as Record<string, unknown>;
            if (node["@type"] !== "ClaimReview") continue;

            const rating = (node["reviewRating"] ?? {}) as Record<string, unknown>;
            const author = (node["author"] ?? {}) as Record<string, unknown>;
            reviews.push({
                claim: clean(typeof node["claimReviewed"] === "string" ? node["claimReviewed"] : ""),
                rating: clean(
                    typeof rating["alternateName"] === "string" ? rating["alternateName"] : "",
                ),
                ratingValue:
                    typeof rating["ratingValue"] === "string" ||
                    typeof rating["ratingValue"] === "number"
                        ? String(rating["ratingValue"])
                        : null,
                url: typeof node["url"] === "string" ? node["url"] : "",
                publisher: clean(
                    typeof author["name"] === "string"
                        ? author["name"]
                        : typeof author["url"] === "string"
                          ? author["url"]
                          : "Demagog",
                ),
            });
        }
    }

    return reviews;
}

async function demagogReviewsFor(hit: SearchHit): Promise<Review[]> {
    const response = await get(hit.url, "text/html");
    if (!response.ok) return [];
    return claimReviewsFromHtml(await response.text());
}

async function probeDemagog(query: string): Promise<void> {
    console.log(`\n=== Demagog: "${query}" ===`);
    const hits = await demagogSearch(query, 5);
    console.log(`wyników search: ${hits.length}`);

    for (const hit of hits.slice(0, 3)) {
        console.log(`  • [${hit.subtype ?? "?"}] ${hit.title.slice(0, 90)}`);
        const reviews = await demagogReviewsFor(hit);
        console.log(`    ClaimReview: ${reviews.length}`);
        for (const review of reviews.slice(0, 2)) {
            console.log(
                `      ocena="${review.rating}" (${review.ratingValue ?? "brak ratingValue"})` +
                    ` | ${review.claim.slice(0, 110)}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 2. Google Fact Check Tools
// ---------------------------------------------------------------------------

async function probeGoogle(queries: string[]): Promise<void> {
    const key = process.env["GOOGLE_FACT_CHECK_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
    console.log("\n=== Google Fact Check Tools ===");
    if (!key) {
        console.log("brak GOOGLE_FACT_CHECK_API_KEY — pomijam");
        return;
    }

    for (const query of queries) {
        const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
        url.searchParams.set("query", query);
        url.searchParams.set("languageCode", "pl");
        url.searchParams.set("pageSize", "5");
        url.searchParams.set("key", key);

        try {
            const response = await get(url.toString(), "application/json");
            const body = (await response.json()) as {
                claims?: Array<{ text?: string; claimReview?: Array<Record<string, unknown>> }>;
            };
            const claims = body.claims ?? [];
            console.log(`  ${claims.length === 0 ? "BRAK" : `${claims.length} hit`} — ${query}`);
            for (const claim of claims.slice(0, 2)) {
                const review = (claim.claimReview ?? [])[0] ?? {};
                const publisher = (review["publisher"] ?? {}) as Record<string, unknown>;
                console.log(
                    `    "${clean(claim.text ?? "").slice(0, 70)}" -> ` +
                        `${String(review["textualRating"] ?? "?")} @${String(publisher["site"] ?? "?")}`,
                );
            }
        } catch (error) {
            console.log(`  ERR ${query}: ${(error as Error).message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Wikidata SPARQL — deterministyczne fakty
// ---------------------------------------------------------------------------

async function sparql(name: string, query: string): Promise<void> {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    try {
        const response = await get(url, "application/sparql-results+json");
        const body = (await response.json()) as {
            results?: { bindings?: Array<Record<string, { value: string }>> };
        };
        const rows = body.results?.bindings ?? [];
        console.log(`  ${name}: ${rows.length === 0 ? "BRAK DANYCH" : ""}`);
        for (const row of rows.slice(0, 3)) {
            console.log(
                "    " +
                    Object.entries(row)
                        .map(([key, value]) => `${key}=${value.value}`)
                        .join("  "),
            );
        }
    } catch (error) {
        console.log(`  ${name}: ERR ${(error as Error).message}`);
    }
}

async function probeWikidata(): Promise<void> {
    console.log("\n=== Wikidata SPARQL (CC0, bez klucza) ===");
    await sparql(
        "stolica Polski (P36)",
        `SELECT ?vLabel WHERE {
            wd:Q36 wdt:P36 ?v.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
        }`,
    );
    await sparql(
        "waluta Polski (P38)",
        `SELECT ?vLabel WHERE {
            wd:Q36 wdt:P38 ?v.
            SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
        }`,
    );
    await sparql(
        "członkostwo w NATO (P463 + P580)",
        `SELECT ?orgLabel ?start WHERE {
            wd:Q36 p:P463 ?st.
            ?st ps:P463 ?org; pq:P580 ?start.
            VALUES ?org { wd:Q7184 }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }
        }`,
    );
}

// ---------------------------------------------------------------------------
// 4. Źródła rządowe — tylko format, nie treść
// ---------------------------------------------------------------------------

async function probeGov(): Promise<void> {
    console.log("\n=== Format źródeł rządowych ===");
    const endpoints: Array<[string, string]> = [
        ["IMGW meteo", "https://danepubliczne.imgw.pl/api/data/meteo"],
        ["IMGW hydro", "https://danepubliczne.imgw.pl/api/data/hydro"],
        ["CERT Polska RSS", "https://cert.pl/feed/"],
        ["GIOŚ powietrze", "https://api.gios.gov.pl/pjp-api/rest/station/findAll"],
        [
            "gov.pl ostrzeżenia",
            "https://www.gov.pl/web/gov/ostrzezenia",
        ],
    ];

    for (const [name, url] of endpoints) {
        try {
            const response = await get(url);
            const text = await response.text();
            console.log(
                `  ${response.status} ${response.headers.get("content-type") ?? "?"} ` +
                    `${text.length}B — ${name}`,
            );
        } catch (error) {
            console.log(`  ERR — ${name}: ${(error as Error).message}`);
        }
    }
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const custom = args.find((arg) => !arg.startsWith("--"));
const wantGoogle = args.includes("--google") || process.env["GOOGLE_FACT_CHECK_API_KEY"];
const wantGov = args.includes("--gov");

await probeDemagog(custom ?? "Morawiecki");

if (wantGoogle) {
    await probeGoogle([
        "Polska jest obecnie członkiem strefy euro",
        "Polska przystąpiła do NATO w 2004 roku",
        "Wisła ma 2047 kilometrów długości",
    ]);
}

await probeWikidata();
if (wantGov) await probeGov();
