export async function Markdown(url: string) {
    const response = await fetch(`https://r.jina.ai/${url}`, {
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error(`Jina AI nie mogła pobrać strony (HTTP ${response.status}).`);
    }

    return response.text();
}