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

Wymagane: `OPENROUTER_API_KEY`. Opcjonalne: `GOOGLE_FACT_CHECK_API_KEY` (dowody fact-checkingowe).
Bez klucza Google system nadal działa, ale raportuje ograniczenie. Kanał Discord jest osobnym
repozytorium i woła ten sam endpoint `POST /verify`.

## Endpointy

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/verify` | `{ text?, url?, channel? }` → `VerifyResponse` |
| GET | `/health` | status procesu |
| GET | `/metrics` | liczniki, p50/p95, średni koszt |
| GET | `/cases` | nierozstrzygnięte, pogrupowane pytania |
| POST | `/cases/:id/ack` | moderator bierze sprawę |
| GET | `/` | interfejs WWW (PL, bez CDN) |
| GET | `/docs` | Swagger |

```bash
curl -s localhost:3000/verify -H 'content-type: application/json' \
  -d '{"text":"Rafał Brzoska został postrzelony w Warszawie."}' | jq
```

## Architektura

```
kanał (WWW / API / zewnętrzny bot Discord)
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

Kanały są cienkie: **WWW i zewnętrzny bot wołają dokładnie tę samą funkcję `verifyInput`**, więc wynik
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

### Pętla informacji

Nierozstrzygnięte twierdzenia (`insufficient_evidence`, `not_verifiable`) trafiają do
`data/moderation/cases.json`. Nowe pytanie jest embedowane i dołączane do najbliższej otwartej
sprawy (cosine ≥ 0.82), a identyczne pytanie trafia do sprawy bez dodatkowego kosztu.

Przy 3. zgłoszeniu tej samej sprawy system raz wysyła alert:

- zawsze zapisuje go do `data/alerts/alerts.jsonl`,
- jeśli ustawisz `MODERATOR_WEBHOOK_URL`, robi `POST` z JSON-em i dopiero wtedy `escalated: true`,
- bez webhooka sprawa zostaje `open` z jawnym `alertReason` „Rekomendacja przekazania…” —
  system nie twierdzi, że przekazał sprawę, jeśli tego nie zrobił.

`GET /cases` pokazuje `open`, `escalated` i `recommended` osobno; `POST /cases/:id/ack` zamyka sprawę.

### Skala i baza

Domyślnie cache to pliki JSON w `data/` — wystarcza do kilkuset claimów. Po włączeniu
`MYSQL_URL` backend używa `MySQLCacheStore`:

```bash
mysql -u user -p prawdowid < sql/schema.sql
# .env: MYSQL_URL=mysql://user:pass@host:3306/prawdowid
```

- embeddingi leżą jako `BLOB` (`Float32Array`, 4 KB na 1024 wymiary), nie JSON,
- `search()` przegląda ograniczone okno czasowe (domyślnie 2000 najnowszych wierszy)
  i rerankuje w procesie — bez pełnego skanu tabeli,
- przy >100k claimów trzeba podmienić okno na ANN (MySQL 9 `VECTOR`, Redis Stack),
  kontrakt `CacheStore` się nie zmienia,
- dokumenty źródłowe i dowody mają osobne tabele (`documents`, `evidence`) pod audyt i eksport.

**Newsy trzymamy w MySQL, nie w Redisie.** Redis to warstwa ulotna: hot-cache werdyktów, locki
`SET NX PX`, rate limit, kolejka rechecków (ZSET). Wyłączenie Redisa ma spowolnić system, nie zmienić
wyniku. Zasady dla `documents`:

- dokument to **niezmienna wersja**: `(source_id, content_hash)` unique, a ten sam `canonical_url`
  z nową treścią to nowy wiersz (`fetched_at`), nie nadpisanie,
- pełny tekst tylko dla dokumentów urzędowych/publicznych z jasną licencją,
- dla newsów i mediów: `excerpt` (≤1500 znaków) + metadane + `content_hash` + link — bez
  redystrybucji całego artykułu,
- bez `FULLTEXT` na te 24h: `LIKE` po `title`/`excerpt` + embeddingi wystarczą; `FULLTEXT ... WITH PARSER ngram`
  dopiero, gdy recall zacznie zawodzić (polska odmiana i diakrytyki).

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
- **kanał Discord** jest utrzymywany w osobnym repozytorium i korzysta z `POST /verify`.
