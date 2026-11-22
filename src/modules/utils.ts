import { fetchWithProxy } from "./proxy";
import { cachedPageFetch } from "./pagecache";
import { DeepSeekWrapper } from "./deepseek";

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
    return cachedPageFetch(url, () => fetchReadableText(url));
}

async function fetchReadableText(url: string): Promise<string> {
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
 * DeepSeek OCR keeps layout tokens such as `<|ref|>Title<|/ref|>` and
 * `<|box|>[[x1,y1,x2,y2]]<|/box|>` in the recognized text. They are useful for
 * cropping, but must not reach claim extraction.
 */
function cleanOcrText(value: string): string {
    return value
        .replace(/<\|box\|>\[\[[\s\S]*?\]\]<\|\/box\|>/gi, " ")
        .replace(/<\|[^|]*\|>/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Extracts text from a base64 image or PDF via the DeepSeek OCR API.
 * Accepts raw base64 or a `data:<mime>;base64,` URI.
 *
 * The DeepSeek key is the same one used by chat, so no extra OCR key or URL is
 * required.
 */
export async function DeepSeekOCRExtract(b64: string): Promise<OCRResponse> {
    const result = await DeepSeekWrapper.OCR(b64);
    const text = (result.pages ?? []).map((page) => cleanOcrText(page.text ?? ""));

    return {
        text,
        confidence: null,
        status: text.length > 0 ? "ok" : "empty",
        message: null,
        processed_image_url: null,
        ocr_input_parts: null,
    };
}
