import { env } from "../env";
import type { TranscriptResult } from "../pipeline/types";

const OPENROUTER_TRANSCRIPT_URL =
  "https://openrouter.ai/api/v1/audio/transcriptions";

type TranscriptProvider = "openrouter" | "deepseek";

interface OpenRouterTranscriptResponse {
  text?: string;
  usage?: {
    cost?: number;
  };
}

interface DeepSeekTranscriptResponse {
  text?: string;
  duration_ms?: number;
}

function chooseProvider(): TranscriptProvider {
  if (env.transcriptProvider === "openrouter") return "openrouter";
  if (env.transcriptProvider === "deepseek") return "deepseek";

  if (env.openRouterApiKey) return "openrouter";
  if (env.deepseekApiKey) return "deepseek";

  throw new Error(
    "No transcript provider configured: set OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or TRANSCRIPT_PROVIDER",
  );
}

function deepSeekAsrUrl(): string {
  return `${env.deepseekBaseUrl.replace(/\/+$/, "")}/v1/tools/asr`;
}

async function transcribeWithOpenRouter(
  audio: Blob,
  filename: string,
): Promise<TranscriptResult> {
  if (!env.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required for OpenRouter transcription");
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", env.transcriptModel);
  form.append("response_format", "json");

  const response = await fetch(OPENROUTER_TRANSCRIPT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openRouterApiKey}`,
      "X-Title": "backend",
    },
    body: form,
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`OpenRouter transcription ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as OpenRouterTranscriptResponse;
  const text = data.text?.trim();

  if (!text) {
    throw new Error("OpenRouter transcription returned an empty transcript");
  }

  return {
    text,
    model: `openrouter:${env.transcriptModel}`,
    costUsd: data.usage?.cost ?? 0,
  };
}

async function transcribeWithDeepSeek(
  audio: Blob,
  filename: string,
): Promise<TranscriptResult> {
  if (!env.deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is required for DeepSeek transcription");
  }

  const form = new FormData();
  form.append("file", audio, filename);

  const response = await fetch(deepSeekAsrUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.deepseekApiKey}`,
    },
    body: form,
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`DeepSeek transcription ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as DeepSeekTranscriptResponse;
  const text = data.text?.trim();

  if (!text) {
    throw new Error("DeepSeek transcription returned an empty transcript");
  }

  return {
    text,
    model: "deepseek-asr",
    costUsd:
      ((data.duration_ms ?? 0) / 3_600_000) * env.deepseekAsrUsdPerHour,
  };
}

/**
 * Transcribes audio to plain text. Provider timestamps and segments are
 * intentionally ignored; callers only get the transcript string.
 */
export async function transcribeAudio(
  audio: Blob,
  filename = "audio",
): Promise<TranscriptResult> {
  const provider = chooseProvider();

  return provider === "openrouter"
    ? transcribeWithOpenRouter(audio, filename)
    : transcribeWithDeepSeek(audio, filename);
}
