import { ProcessImageSchema, ProcessTextSchema, ProcessURLSchema, ProcessVideoSchema } from "./schemas";

type ProcessURLBody = typeof ProcessURLSchema.static
type ProcessTextBody = typeof ProcessTextSchema.static
type ProcessImageBody = typeof ProcessImageSchema.static
type ProcessVideoBody = typeof ProcessVideoSchema.static

export async function processUrl({ body }: { body: ProcessURLBody }) {
  return { ok: true, url: body.url }
}

export async function processText({ body }: { body: ProcessTextBody }) {
  return { ok: true, url: body.text }
}

export async function processImage({ body }: { body: ProcessImageBody }) {
  return { ok: true, url: body.image }
}

export async function processVideo({ body }: { body: ProcessVideoBody }) {
  return { ok: true, url: body.video }
}

