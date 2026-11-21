const DEFAULT_ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export interface FactCheckPublisher {
    name: string;
    site: string;
}

export interface FactCheckReview {
    publisher: FactCheckPublisher;
    url: string;
    title: string;
    reviewDate?: string;
    textualRating: string;
    languageCode?: string;
}

export interface FactCheckClaim {
    text: string;
    claimant?: string;
    claimDate?: string;
    claimReview: FactCheckReview[];
}

export interface FactCheckSearchResponse {
    claims?: FactCheckClaim[];
    nextPageToken?: string;
}

export interface FactCheckSearchOptions {
    /** BCP-47 language code, e.g. `pl` or `en`. */
    languageCode?: string;
    /** Only return reviews published within this many days. */
    maxAgeDays?: number;
    /** 1-100, defaults to 10. */
    pageSize?: number;
    pageToken?: string;
    offset?: number;
    /** Filter reviews by publisher site, e.g. `demagog.org.pl`. */
    reviewPublisherSiteFilter?: string;
}

/**
 * Thin wrapper around the Google Fact Check Tools API.
 * https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
 */
export class GoogleFactCheck {
    /** Searches fact-checking reviews for a claim or phrase. */
    public static async Search(
        query: string,
        options: FactCheckSearchOptions = {},
    ): Promise<FactCheckSearchResponse> {
        if (query.trim().length === 0) throw new Error("Fact check query is empty");

        const apiKey =
            process.env["GOOGLE_FACT_CHECK_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
        if (!apiKey) throw new Error("GOOGLE_FACT_CHECK_API_KEY is not set");

        const params = new URLSearchParams({ query, key: apiKey });
        if (options.languageCode) params.set("languageCode", options.languageCode);
        if (options.maxAgeDays !== undefined) params.set("maxAgeDays", String(options.maxAgeDays));
        if (options.pageSize !== undefined) params.set("pageSize", String(options.pageSize));
        if (options.pageToken) params.set("pageToken", options.pageToken);
        if (options.offset !== undefined) params.set("offset", String(options.offset));
        if (options.reviewPublisherSiteFilter) {
            params.set("reviewPublisherSiteFilter", options.reviewPublisherSiteFilter);
        }

        const endpoint = process.env["GOOGLE_FACT_CHECK_URL"] ?? DEFAULT_ENDPOINT;
        const response = await fetch(`${endpoint}?${params}`, {
            headers: { accept: "application/json" },
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
                `Google Fact Check request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
            );
        }

        return (await response.json()) as FactCheckSearchResponse;
    }
}
