/**
 * Local document corpus (gov.pl, Policja, CERT, RSO...). 1000+ real pages
 * ingested by scripts/ingest-documents.ts. Used as a real-text evidence source:
 * no embeddings, deterministic keyword prefilter, sentence-scoped match.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { ClaimInput } from "../pipeline/types";

export type CorpusDoc = {
    id: string;
    source: string;
    kind: string;
    url: string;
    title: string;
    publishedAt: string | null;
    fetchedAt: string | null;
    tags: string[];
    lang: string;
    text: string;
};

export type DocHit = { doc: CorpusDoc; sentence: string };

export const CORPUS_FILE =
    process.env["DOC_CORPUS_FILE"] ??
    fileURLToPath(new URL("../../corpus/corpus.jsonl", import.meta.url));

let docs: CorpusDoc[] | null = null;
let inflight: Promise<CorpusDoc[]> | null = null;
let warned = false;

function load(): Promise<CorpusDoc[]> {
    if (docs) return Promise.resolve(docs);
    inflight ??= (async () => {
        try {
            const raw = await readFile(CORPUS_FILE, "utf8");
            const parsed: CorpusDoc[] = [];
            for (const line of raw.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const doc = JSON.parse(trimmed) as CorpusDoc;
                    if (doc.url && doc.text && doc.title) parsed.push(doc);
                } catch {
                    // Skip one broken line.
                }
            }
            docs = parsed;
            return parsed;
        } catch {
            if (!warned) {
                warned = true;
                console.warn(`[corpus-docs] brak korpusu (${CORPUS_FILE}).`);
            }
            docs = [];
            return docs;
        } finally {
            inflight = null;
        }
    })();
    return inflight;
}

const STOPWORDS = new Set([
    "jest", "byl", "byla", "bylo", "byly", "bedzie", "beda", "sie", "tego",
    "tej", "tych", "jego", "jej", "ich", "jako", "przez", "ktory", "ktora",
    "ktore", "dla", "oraz", "albo", "lub", "nie", "tak", "the", "and", "with",
    "from", "that", "this", "have", "has",
]);

function norm(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokens(value: string): string[] {
    return norm(value)
        .split(" ")
        .filter((token) => token.length > 0)
        .filter((token) => (/^\d+$/.test(token) ? true : token.length >= 4 && !STOPWORDS.has(token)))
        .map((token) => (token.length > 5 ? token.slice(0, 5) : token));
}

function mentions(haystack: string, list: string[]): number {
    return list.filter((token) => haystack.includes(token)).length;
}

function findSentence(text: string, claim: ClaimInput): string | null {
    const fact = claim.fact;
    if (!fact) return null;

    const subject = tokens(String(fact.s ?? ""));
    const object = tokens(String(fact.o ?? ""));
    if (subject.length === 0 || object.length === 0) return null;

    const needed = Math.max(1, Math.ceil(object.length * 0.5));
    const clean = text.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
    const sentences = clean.split(/(?<=[.!?])\s+|\n+/);

    for (const raw of sentences) {
        const sentence = raw.trim();
        if (sentence.length < 40 || sentence.length > 700) continue;
        const normalized = norm(sentence);
        if (mentions(normalized, subject) === 0) continue;
        if (mentions(normalized, object) < needed) continue;
        return sentence;
    }

    return null;
}

/** Deterministic keyword prefilter + sentence match. Never throws. */
export async function searchCorpusDocuments(claim: ClaimInput, limit = 4): Promise<DocHit[]> {
    const all = await load();
    if (all.length === 0) return [];

    const fact = claim.fact;
    const queryTokens = new Set(
        tokens(`${claim.text} ${claim.quote ?? ""} ${fact?.s ?? ""} ${fact?.o ?? ""}`.slice(0, 800)),
    );
    if (queryTokens.size === 0) return [];

    const ranked = all
        .map((doc) => {
            const titleTokens = new Set(tokens(doc.title));
            let titleHits = 0;
            for (const token of queryTokens) if (titleTokens.has(token)) titleHits++;

            const textLower = doc.text.toLowerCase();
            let textHits = 0;
            for (const token of queryTokens) if (textLower.includes(token)) textHits++;

            const score = (titleHits * 3 + textHits) / (queryTokens.size * 4);
            return { doc, score };
        })
        .filter((entry) => entry.score >= 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit * 4);

    const hits: DocHit[] = [];
    const used = new Set<string>();
    for (const { doc } of ranked) {
        if (used.has(doc.id)) continue;
        const sentence = findSentence(doc.text, claim);
        if (!sentence) continue;
        used.add(doc.id);
        hits.push({ doc, sentence });
        if (hits.length >= limit) break;
    }

    return hits;
}

export async function corpusDocStats(): Promise<{ total: number }> {
    return { total: (await load()).length };
}
