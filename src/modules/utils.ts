import { fetchWithProxy } from "./proxy";

const JINA_READER_URL = "https://r.jina.ai/";

/** Renders a web page as Markdown via Jina Reader. */
export async function Markdown(url: string): Promise<string> {
    const baseUrl = process.env["JINA_READER_URL"] ?? JINA_READER_URL;

    const response = await fetchWithProxy(baseUrl + url, {
        headers: {
            accept: "text/plain",
            "x-return-format": "markdown",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Jina Reader failed (${response.status} ${response.statusText}) for ${url}`,
        );
    }

    return await response.text();
}

/**
 * Reads a page as plain text. Prefers Jina Reader (clean markdown); if Jina
 * rejects the URL, falls back to a direct fetch with a browser user-agent.
 */
export async function ReadableText(url: string): Promise<string> {
    try {
        return await Markdown(url);
    } catch {
        const response = await fetchWithProxy(url, {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                accept: "text/html,application/xhtml+xml;q=0.8,*/*;q=0.5",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            throw new Error(`Nie udało się pobrać strony (${response.status}).`);
        }

        const html = await response.text();
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
            .slice(0, 100_000);
    }
}

export interface OCRResponse {
    text: string[]; // empty if no readable text
    confidence: number | null;
    status: string;
    message: string | null;
    processed_image_url: string | null;
    ocr_input_parts: string[] | null;
}

/**
 * Extracts text from a base64 image via DeepSeek-OCR.
 * Accepts raw base64 or a `data:<mime>;base64,` URI.
 */
export async function DeepSeekOCRExtract(b64: string): Promise<OCRResponse> {
    const bytes = Buffer.from(b64.replace(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, ""), "base64");
    if (bytes.length === 0) throw new Error("Empty base64 image");

    const ext = bytes.subarray(0, 5).toString() === "%PDF-" ? "pdf" : "png";
    
    const form = new FormData();
    form.append("file", new Blob([bytes]), `image.${ext}`);

    const url = process.env["DEEPSEEK_OCR_URL"];
    if (!url) throw new Error("DEEPSEEK_OCR_URL is not set");

    const response = await fetch(url, { method: "POST", body: form });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
            `DeepSeek OCR request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
        );
    }

    return (await response.json()) as OCRResponse;
}
