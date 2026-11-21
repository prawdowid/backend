import OpenAI from 'openai';

const PROMPT = ``;

const DEFAULT_ASR_URL = "https://api.deepseek.com/v1/tools/asr";
const MAX_ASR_BYTES = 8 * 1024 * 1024; // DeepSeek ASR accepts at most 8 MiB

export interface TranscribeResponse {
    request_id: string;
    text: string;
    duration_ms: number;
}

function detectAudioFormat(bytes: Uint8Array): { mime: string; ext: string } {
    const matches = (offset: number, ascii: string) =>
        ascii.split("").every((char, index) => bytes[offset + index] === char.charCodeAt(0));

    if (matches(0, "OggS")) return { mime: "audio/ogg", ext: "ogg" };
    if (matches(0, "RIFF") && matches(8, "WAVE")) return { mime: "audio/wav", ext: "wav" };

    throw new Error("Unsupported audio format: DeepSeek ASR accepts 16-bit PCM WAV or Ogg Opus");
}

export class DeepSeek {
    private static client?: OpenAI;

    public static async Chat(message: string) {
        if(this.client === undefined) {
            this.client = new OpenAI({
                baseURL: process.env['OPENAI_BASE_URL'],
                apiKey: process.env['OPENAI_API_KEY']
            });
        }

        const response = await this.client.responses.create({
            model: process.env['OPENAI_MODEL'],
            instructions: PROMPT,
            input: message,
        });
        
        return response.output_text;
    }

    /**
     * Transcribes audio to text via DeepSeek ASR (`POST /v1/tools/asr`).
     * Accepts raw base64, a `data:<mime>;base64,` URI, or the audio bytes.
     *
     * Limits: 16-bit PCM WAV or Ogg Opus, max 8 MiB, max 120 s of audio.
     * https://api-docs.deepseek.com/guides/asr
     */
    public static async Transcribe(audio: string | Uint8Array): Promise<TranscribeResponse> {
        const bytes =
            typeof audio === "string"
                ? Buffer.from(audio.replace(/^data:[\w.+-]+\/[\w.+-]+;base64,/i, ""), "base64")
                : audio;

        if (bytes.length === 0) throw new Error("Empty audio");
        if (bytes.length > MAX_ASR_BYTES) throw new Error("Audio exceeds the 8 MiB DeepSeek ASR limit");

        const { mime, ext } = detectAudioFormat(bytes);
        const apiKey = process.env["DEEPSEEK_API_KEY"] ?? process.env["OPENAI_API_KEY"];
        if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

        const form = new FormData();
        form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`);

        const url = process.env["DEEPSEEK_ASR_URL"] ?? DEFAULT_ASR_URL;
        const response = await fetch(url, {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}` },
            body: form,
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
                `DeepSeek ASR request failed (${response.status} ${response.statusText})${detail ? `: ${detail.slice(0, 500)}` : ""}`,
            );
        }

        return (await response.json()) as TranscribeResponse;
    }
}
