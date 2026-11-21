import { Markdown } from "./jina";
import { OpenRouterWrapper } from "./openrouter";
import { ProcessImageSchema, ProcessTextSchema, ProcessURLSchema, ProcessVideoSchema } from "./schemas";
import type { DecisionsNoulQuestion } from "@openrouter/sdk/models";

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

const containsStatementsQuestion: DecisionsNoulQuestion = {
    type: "noul", 
    instructions: "Does this text have anything that could be classified political/propaganda statements?", // TODDO: lepszy prompt
    criteria: {
        true: "Yes it does",
        false: "No it doesn't",
    },
}

export async function processText({ body }: { body: ProcessTextBody }) {
    const result = await OpenRouterWrapper.Jev({
        text: body.text,
    }, {
        contains_statements: containsStatementsQuestion,
    })

    const answer = result.answers["contains_statements"];

    if (answer && answer.type === "noul" && answer.noul < 0.75) {
        return { ok: false, error: "Robot nie wykrył propagandy" }
    }

    // TODO: deepseek summary faktów
    // TODO: Jev sprawdza cache (pókico in-memory)
    // weryfikuje to czego nie ma w cache, zwraca od razu to co ma.

    return { ok: true, text: body.text }
}

export async function processImage({ body }: { body: ProcessImageBody }) {
  return { ok: true, url: body.image }
}

export async function processVideo({ body }: { body: ProcessVideoBody }) {
  return { ok: true, url: body.video }
}

