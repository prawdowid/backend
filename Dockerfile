# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine

WORKDIR /app

# Tylko zależności produkcyjne, instalowane z lockfile.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Kod runtime oraz pliki, które serwer czyta z dysku:
#   ../../public/index.html  -> /app/public/index.html
#   ../../corpus/corpus.jsonl -> /app/corpus/corpus.jsonl
# data/ NIE jest kopiowane: katalog jest w .gitignore, a w compose jest
# bind mountem (albo pustym, zapisywalnym katalogiem utworzonym poniżej).
COPY src ./src
COPY public ./public
COPY corpus ./corpus

# Zapisywalny stan runtime (logi, cache, metryki, moderacja, alerty).
RUN mkdir -p data/logs data/cache/pages data/metrics data/moderation data/alerts data/euvsdisinfo data/sources \
    && chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/index.ts"]
