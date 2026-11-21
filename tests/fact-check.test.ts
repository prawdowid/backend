import { describe, expect, it, spyOn } from "bun:test";
import { researchFact } from "../src/modules/fact-check";

async function withEnvironment<T>(
    values: Record<string, string | undefined>,
    action: () => Promise<T>,
): Promise<T> {
    const previous = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(values)) {
        previous.set(key, process.env[key]);
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        return await action();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("researchFact", () => {
    it("uses Jina Search when Google Fact Check is not configured", async () => {
        await withEnvironment({
            GOOGLE_FACT_CHECK_API_KEY: undefined,
            JINA_API_KEY: "test-jina-key",
        }, async () => {
            let requestUrl = "";
            const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
                expect(String(input)).toContain("s.jina.ai");
                requestUrl = String(input);
                expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-jina-key");
                return jsonResponse({
                    data: [
                        {
                            title: "Government source",
                            url: "https://www.gov.pl/web/premier/example",
                            content: "Published source excerpt",
                        },
                        {
                            title: "Unlisted source",
                            url: "https://example.com/story",
                            content: "This must not be marked trusted.",
                        },
                    ],
                });
            });

            try {
                const result = await researchFact("A harmless test claim");

                expect(result.status).toBe("sources_found");
                expect(result.providers.googleFactCheck).toBe("not_configured");
                expect(result.providers.jinaSearch).toBe("available");
                const governmentSource = result.sources.find((source) => source.url.includes("gov.pl"));
                expect(governmentSource).toBeDefined();
                if (!governmentSource) {
                    throw new Error("Expected Jina Search to return the government source");
                }
                expect(governmentSource.trusted).toBe(true);
                expect(result.sources.every((source) => typeof source.trusted === "boolean")).toBe(true);
                const unlistedSource = result.sources.find((source) => source.url.includes("example.com"));
                expect(decodeURIComponent(new URL(requestUrl).pathname)).toContain("site:gov.pl");
                expect(unlistedSource).toBeUndefined();
            } finally {
                fetchSpy.mockRestore();
            }
        });
    });

    it("combines Google reviews with Jina sources when both are configured", async () => {
        await withEnvironment({
            GOOGLE_FACT_CHECK_API_KEY: "test-google-key",
            JINA_API_KEY: "test-jina-key",
        }, async () => {
            const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
                if (String(input).includes("factchecktools.googleapis.com")) {
                    return jsonResponse({
                        claims: [{
                            text: "A reviewed claim",
                            claimReview: [{
                                publisher: { name: "Fact checker" },
                                title: "Review title",
                                url: "https://fact-checker.example/review",
                                textualRating: "False",
                            }],
                        }],
                    });
                }

                return jsonResponse({
                    data: [{
                        title: "Government source",
                        url: "https://www.gov.pl/web/premier/example",
                        content: "Official source excerpt",
                    }],
                });
            });

            try {
                const result = await researchFact("A reviewed claim");

                expect(result.status).toBe("review_found");
                expect(result.reviews[0]?.textualRating).toBe("False");
                expect(result.sources.some((source) => source.url.includes("gov.pl"))).toBe(true);
                expect(result.providers.googleFactCheck).toBe("available");
                expect(result.providers.jinaSearch).toBe("available");
            } finally {
                fetchSpy.mockRestore();
            }
        });
    });

    it("keeps successful provider results when the other provider fails", async () => {
        await withEnvironment({
            GOOGLE_FACT_CHECK_API_KEY: "test-google-key",
            JINA_API_KEY: "test-jina-key",
        }, async () => {
            const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
                if (String(input).includes("factchecktools.googleapis.com")) {
                    return jsonResponse({ claims: [] });
                }
                return jsonResponse({}, 401);
            });

            try {
                const result = await researchFact("A claim with no review");

                expect(result.providers.googleFactCheck).toBe("available");
                expect(result.providers.jinaSearch).toBe("unavailable");
                expect(result.providerErrors).toContain("Jina Search request failed (HTTP 401).");
            } finally {
                fetchSpy.mockRestore();
            }
        });
    });

    it("fails explicitly when neither provider is configured", async () => {
        await withEnvironment({
            GOOGLE_FACT_CHECK_API_KEY: undefined,
            JINA_API_KEY: undefined,
        }, async () => {
            await expect(researchFact("A test claim")).rejects.toThrow(
                "No research provider is configured.",
            );
        });
    });
});
