import { Markdown } from "./utils";
import { DeepSeekWrapper } from "./deepseek";
import { ProcessImageSchema, ProcessTextSchema, ProcessURLSchema, ProcessVideoSchema } from "./schemas";
import { containsStatementsQuestion } from "./questions";

type ProcessURLBody = typeof ProcessURLSchema.static
type ProcessTextBody = typeof ProcessTextSchema.static
type ProcessImageBody = typeof ProcessImageSchema.static
type ProcessVideoBody = typeof ProcessVideoSchema.static

export async function processUrl({ body }: { body: ProcessURLBody }) {
    const url = body.url;
    const markdown = await Markdown(url);
    // TODO: moze wsparcie dla instagram / facebook
    return processText({ body: {text: markdown} })
}

export async function processText({ body }: { body: ProcessTextBody }) {
    const result = await DeepSeekWrapper.Decide({
        text: body.text,
    }, {
        contains_statements: containsStatementsQuestion,
    })

    const answer = result.answers["contains_statements"];

    if (answer && answer.type === "noul" && answer.noul < 0.75) {
        return { ok: false, error: "Robot nie wykrył propagandy" }
    }

    // TODO: deepseek summary faktów
    // TODO: DeepSeek sprawdza cache (pókico in-memory)
    // weryfikuje to czego nie ma w cache, zwraca od razu to co ma.

    return { ok: true, text: body.text }
}

export async function processImage({ body }: { body: ProcessImageBody }) {
  return { ok: true, url: body.image }
}

export async function processVideo({ body }: { body: ProcessVideoBody }) {
  return { ok: true, url: body.video }
}

