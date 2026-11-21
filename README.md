# backend

Minimal [ElysiaJS](https://elysiajs.com/) + [Bun](https://bun.sh/) API.

## Requirements

- Bun 1.4+

## Local development

```bash
bun install
bun run dev
```

The server listens on `http://localhost:3000` by default.

```bash
curl http://localhost:3000/
# {"message":"Hello World"}
```

Set `PORT` to use a different port.

## Fact-checking

`POST /process/text` screens the submitted text with Jev, extracts up to 10
checkable claims with DeepSeek, checks the in-memory cache, and searches two
independent evidence providers. `POST /process/url` first retrieves the page as
Markdown using Jina AI, then runs the same flow.

Google Fact Check Tools supplies published fact-check reviews. Jina Search
searches Bing for material from a hard-coded list of curated source URLs and
returns results only from their domains. The runtime does not depend on
`zaufane_linki.txt` being present. Jina Search is requested without page
content (`X-Respond-With: no-content`), so each source carries only a short,
cleaned snippet. DeepSeek then assesses each claim using only the retrieved
reviews and snippets and returns `verdict` (`supported`, `contradicted` or
`unclear`), a short Polish `summary` that answers the claim's yes/no `question`
(e.g. "Czy szczepionki powodują autyzm?" -> "Nie. ..."), and only the sources it
relied on. The
verdict is an automated assessment of the evidence found, not an independent
fact-check; if there is no evidence or the assessment fails, the verdict is
`unclear`. A domain on the curated list does not determine whether a claim is
true. A missing Google review or search result does not mean that a claim is
true or false. Responses report which providers were used and any provider
errors; one provider can still supply results when the other is unavailable.

Configure these environment variables for fact-checking:

| Variable | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Jev claim screening and cache matching |
| `OPENAI_API_KEY` | DeepSeek-compatible API credentials |
| `OPENAI_BASE_URL` | DeepSeek-compatible API base URL |
| `OPENAI_MODEL` | DeepSeek model name |
| `GOOGLE_FACT_CHECK_API_KEY` | Optional Google Fact Check Tools provider |
| `JINA_API_KEY` | Optional Jina Search provider (required for web search) |
| `OPENROUTER_RLCD_MODEL` | Optional Jev model override |

Configure at least one of `GOOGLE_FACT_CHECK_API_KEY` or `JINA_API_KEY`.
Jina Reader can fetch submitted URLs without a key, but Jina Search requires
`JINA_API_KEY` (available from the Jina API dashboard). Claims are sent to each
configured research provider.
HTTP 503 is returned only when no configured provider can be used; partial
provider failures are included alongside results from the provider that worked.
The cache is bounded to 200 claims with evidence and is lost when the process
restarts. Image and video processing are not implemented and return HTTP 501.

A URL submitted to `/process/url` is read through Jina Reader.

User-facing response text (`message`, `statusMessage`, `providerMessages`,
`providerErrors`, and `error`) is in Polish. Keep the existing `status` and
provider-status values as machine-readable codes; use the corresponding Polish
message fields for display. Claim text, publisher names, review ratings,
titles, and source excerpts are returned as provided by the original source and
are not automatically translated.

## Discord bot API

The Python bot can send JSON requests to the matching process route:

| Input | Endpoint | JSON body |
| --- | --- | --- |
| URL | `POST /process/url` | `{"url":"https://example.com/article"}` |
| Text | `POST /process/text` | `{"text":"Claim to check"}` |
| Image | `POST /process/image` | `{"image":"<base64-encoded image>"}` |
| Video | `POST /process/video` | `{"video":"https://cdn.discordapp.com/..."}` |

URL and text requests return the structured fact-check result. Image and video
requests currently return HTTP 501 with an `ok: false` error response; they do
not analyze the attachment or report a verdict.

## Production

```bash
bun install --production --frozen-lockfile
bun run start
```

## Docker

```bash
docker build -t backend .
docker run --rm -p 3000:3000 backend
```

To use a different port:

```bash
docker run --rm -e PORT=8080 -p 8080:8080 backend
```

For fact-checking, pass the local environment file:

```bash
docker run --rm --env-file .env -e PORT=3000 -p 3000:3000 backend
```

## Scripts

| Script              | Description                     |
| ------------------- | ------------------------------- |
| `bun run dev`       | Start with file watching        |
| `bun run start`     | Start the server                |
| `bun run test`      | Run tests                       |
| `bun run typecheck` | Type-check with `tsc --noEmit`  |
