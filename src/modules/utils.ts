const JINA_READER_URL = "https://r.jina.ai/";

/** Renders a web page as Markdown via Jina Reader. */
export async function Markdown(url: string): Promise<string> {
    const apiKey = process.env["JINA_API_KEY"];
    const baseUrl = process.env["JINA_READER_URL"] ?? JINA_READER_URL;

    const response = await fetch(baseUrl + url, {
        headers: {
            accept: "text/plain",
            "x-return-format": "markdown",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
    });

    if (!response.ok) {
        throw new Error(
            `Jina Reader failed (${response.status} ${response.statusText}) for ${url}`,
        );
    }

    return await response.text();
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
