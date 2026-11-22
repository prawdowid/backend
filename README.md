# PRAWDOWID — backend

Weryfikacja doniesień oparta na źródłach, nie na opinii modelu. System przyjmuje tekst lub URL,
wyciąga sprawdzalne twierdzenia, szuka dowodów w korpusie źródeł i Google Fact Check Tools,
a gdy dowodów brakuje — **wstrzymuje się od rozstrzygnięcia**.

## Uruchomienie

```bash
bun install
cp .env.example .env   # uzupełnij klucze
bun run dev            # http://localhost:3000
```

Wymagane: `OPENROUTER_API_KEY`. Opcjonalne: `GOOGLE_FACT_CHECK_API_KEY` (dowody fact-checkingowe),
`DISCORD_TOKEN` (drugi kanał). Bez klucza Google system nadal działa, ale raportuje ograniczenie.

## Endpointy

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/verify` | `{ text?, url?, channel? }` → `VerifyResponse` |
| GET | `/health` | status procesu |
| GET | `/metrics` | liczniki, p50/p95, średni koszt |
| GET | `/` | interfejs WWW (PL, bez CDN) |
| GET | `/docs` | Swagger |

```bash
curl -s localhost:3000/verify -H 'content-type: application/json' \
  -d '{"text":"Rafał Brzoska został postrzelony w Warszawie."}' | jq
```

## Architektura

```
kanał (WWW / Discord / API)
        │
        ▼
   verifyInput()                 src/pipeline/verify.ts
        │
        ├─ 1. gate Jev           political score (raportowany, nie blokuje)
        ├─ 2. ekstrakcja         DeepSeek v4.1 Flash (OpenRouter, reasoning OFF)
        │                        MASTERPROMPT → fakty → atomowe SPO
        ├─ 3. embeddingi         bge-m3 (PL), shortlist cache
        ├─ 4. cache              FileCacheStore / Redis (3 metody)
        │                        exact key → Jev choice+noul → wpis
        └─ 5. research           korpus 122 źródeł + Google Fact Check
                                 → werdykt + dowody + siła
        ▼
   VerifyResponse (werdykt, dowody, ograniczenia, koszt, czas)
```

Kanały są cienkie: **Discord i WWW wołają dokładnie tę samą funkcję `verifyInput`**, więc wynik
merytoryczny jest identyczny (wymóg spójności kanałów).

### Werdykty

`confirmed` · `false` · `misleading` · `insufficient_evidence` · `not_verifiable`

Błąd techniczny (`error`) i prośba o doprecyzowanie (`needs_clarification`) są **osobnymi statusami**,
nigdy werdyktem. Każde twierdzenie zwraca dowody: tytuł, wydawcę, datę, URL i fragment.

### Cache czasowy

`CachedClaim` ma `validFrom` / `validUntil`. Cache trzyma **propozycję**, a `verdict` mówi, czy jest
prawdziwa w danym oknie. Dzięki temu „Nawrocki wygrał wybory” przed ogłoszeniem wyniku trafia w wpis
`false` (do dnia wyniku), a po nim — w wpis `true`. Matcher filtruje kandydatów po `asOf`
(data artykułu lub dziś).

### Źródła

`src/sources/manifest.ts`: **122 rekordy, 29 domen**, typy `primary` (92), `secondary` (22),
`fact_check` (8) — m.in. Dziennik Ustaw, Monitor Polski, ISAP, PKW, GUS, NBP, EUR-Lex, Demagog,
AFP Fact Check, EUvsDisinfo, EDMO, NASK.

Audyt linków:

```bash
bun run scripts/ingest-sources.ts   # zapisuje data/sources/audit.json
```

`searchSources()` embeduje manifest partiami po 32 i zwraca top-k po cosine. Wektory żyją w pamięci
procesu; przy awarii embeddingów zwraca `[]` zamiast wywalać weryfikację.

## Bezpieczeństwo

- treść użytkownika jest **danymi** w `<ARTICLE>`; MASTERPROMPT zabrania wykonywania instrukcji z treści,
- heurystyka `detectInjection()` oznacza próby wpływu i dopisuje ograniczenie do odpowiedzi (nie zmienia werdyktu),
- walidacja wejścia (rozmiar, `http/https`, JSON) i osobne komunikaty błędów,
- brak sekretów w repo; `.env` w `.gitignore`,
- cache i logi to pliki lokalne (`data/`), możliwe do usunięcia.

## Koszt (szacunek)

Jedno sprawdzenie: ~$0.0003–$0.001 (gate + ekstrakcja + embeddingi; research z Google jest darmowy
w ramach limitu). **1000 zapytań ≈ $0.3–$1.** Brak kosztu po stronie użytkownika.

## Testy

```bash
node node_modules/typescript/bin/tsc --noEmit
bun run scripts/test-verify.ts        # empty / injection / real claim
bun run scripts/test-pipeline.ts      # ekstrakcja + cache
bun run scripts/test-pipeline-cache.ts
```

## Ograniczenia i ryzyka

- **halucynacje**: model tylko ekstrahuje i porównuje; werdykt bez dowodu jest zabroniony — brak dowodów
  daje `insufficient_evidence`,
- **stronniczość źródeł**: korpus oznaczony typem; źródło samo w sobie nie przesądza o werdykcie,
- **aktualność**: wpisy mają okno ważności, ale recheck po stronie Redisa/schedulera nie jest jeszcze wpięty,
- **prompt injection**: heurystyka + separacja danych; brak pełnego red-teamingu,
- **prywatność**: logi zawierają treść zapytania — do produkcji potrzebna retencja i maskowanie,
- **zależności**: OpenRouter, Jina, Google Fact Check; każda awaria kończy się statusem `error`, nie werdyktem,
- **Discord**: `MessageContent` jest intentem uprzywilejowanym — musi być włączony w portalu.
