import { describe, expect, it, spyOn } from "bun:test";
import { assessFact } from "../src/modules/assessment";
import { DeepSeek } from "../src/modules/deepseek";
import { cleanExcerpt, type FactCheckResult } from "../src/modules/fact-check";

function result(overrides: Partial<FactCheckResult> = {}): FactCheckResult {
    return {
        claim: "Testowe twierdzenie.",
        status: "sources_found",
        statusMessage: "",
        reviews: [],
        sources: [{ title: "A", url: "https://www.gov.pl/a", domain: "www.gov.pl", trusted: true, excerpt: "a" }],
        providers: { googleFactCheck: "not_configured", jinaSearch: "available" },
        providerMessages: { googleFactCheck: "", jinaSearch: "" },
        providerErrors: [],
        checkedAt: new Date().toISOString(),
        ...overrides,
    };
}

describe("cleanExcerpt", () => {
    it("removes markdown navigation and truncates long text", () => {
        const text = `*   [Przejdź do treści](https://example.gov.pl/#main)\n![logo](https://x/y.png)\n## Szczepionki nie wywołują autyzmu. ${"Zdanie testowe. ".repeat(40)}`;
        const cleaned = cleanExcerpt(text);

        expect(cleaned).not.toContain("](");
        expect(cleaned).not.toContain("http");
        expect(cleaned).toContain("Szczepionki nie wywołują autyzmu.");
        expect(cleaned.length).toBeLessThanOrEqual(301);
        expect(cleaned.endsWith("…")).toBe(true);
    });
});

describe("assessFact", () => {
    it("does not call the model and stays unclear when there is no evidence", async () => {
        const spy = spyOn(DeepSeek, "AssessClaim");
        try {
            const assessed = await assessFact(result({ status: "no_evidence_found", sources: [] }), "Czy to prawda?");

            expect(assessed.verdict).toBe("unclear");
            expect(assessed.question).toBe("Czy to prawda?");
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    it("keeps only the sources the assessment cites", async () => {
        const sources = [1, 2, 3].map((n) => ({
            title: `Źródło ${n}`, url: `https://www.gov.pl/${n}`, domain: "www.gov.pl", trusted: true,
        }));
        const spy = spyOn(DeepSeek, "AssessClaim").mockResolvedValue({
            verdict: "contradicted", summary: "Źródła przeczą twierdzeniu.", relevantSources: [3],
        });
        try {
            const assessed = await assessFact(result({ sources }), "Czy to prawda?");

            expect(assessed.verdict).toBe("contradicted");
            expect(assessed.sources.map((source) => source.title)).toEqual(["Źródło 3"]);
        } finally {
            spy.mockRestore();
        }
    });

    it("reports an unclear, unassessed result when the model fails", async () => {
        const errorSpy = spyOn(console, "error").mockImplementation(() => {});
        const spy = spyOn(DeepSeek, "AssessClaim").mockRejectedValue(new Error("boom"));
        try {
            const assessed = await assessFact(result(), "Czy to prawda?");

            expect(assessed.verdict).toBe("unclear");
            expect(assessed.assessed).toBe(false);
            expect(assessed.sources).toEqual([]);
        } finally {
            spy.mockRestore();
            errorSpy.mockRestore();
        }
    });
});
