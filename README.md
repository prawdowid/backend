# PRAWDOWID — backend

Weryfikacja doniesień oparta na źródłach, nie na opinii modelu. System przyjmuje tekst, URL lub
zdjęcie, wyciąga sprawdzalne twierdzenia, szuka dowodów w korpusie źródeł i innych źródłach,
a gdy dowodów brakuje — **wstrzymuje się od rozstrzygnięcia**.

Cała warstwa AI to **DeepSeek**. Wystarczy jeden klucz: `DEEPSEEK_API_KEY`.

## Uruchomienie

### Windows

Kliknij dwukrotnie `start.bat`. Skrypt użyje Bun z PATH albo lokalnego
`node_modules\bun\bin\bun.exe`, zainstaluje zależności i uruchomi API na
<http://localhost:3000>. Frontend uruchamiasz osobno przez `prawdowid\start.bat`
(<http://localhost:3001>).

### Ręcznie

```bash
bun install
cp .env.example .env   # wpisz DEEPSEEK_API_KEY
bun run dev            # http://localhost:3000
```

Jedyny wymagany klucz:

```env
DEEPSEEK_API_KEY=...
```

Opcjonalny jest tylko `MYSQL_URL`; bez niego cache działa na plikach JSON w `data/`.

## Endpointy

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/verify` | `{ text?, url?, image?, channel? }` → `VerifyResponse` |
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
        ├─ 1. gate                DeepSeek Flash (polityczność, raportowana)
        ├─ 2. ekstrakcja          DeepSeek Flash → fakty → atomowe SPO
        ├─ 3. embeddingi          lokalne wektory hashowe (bez modelu i klucza)
        ├─ 4. cache               FileCacheStore / MySQL (3 metody)
        └─ 5. research            korpus + Wikipedia/Wikidata/EUvsDisinfo
                                  → werdykt + dowody + siła
        ▼
   VerifyResponse (werdykt, dowody, ograniczenia, koszt, czas)
```

### Warstwa AI

| Funkcja | Model / mechanizm | Klucz |
|---|---|---|
| Ekstrakcja twierdzeń | `deepseek-flash` (`/chat/completions`, JSON mode) | `DEEPSEEK_API_KEY` |
| Bramka i dopasowanie twierdzeń | `deepseek-flash` (JSON decyzje `noul`/`choice`) | `DEEPSEEK_API_KEY` |
| Embeddingi do cache i wyszukiwania | lokalny deterministyczny hashing 1024D | brak |
| OCR obrazów | `POST /v1/tools/ocr` | `DEEPSEEK_API_KEY` |
| Wyszukiwanie dowodów w sieci | `POST /v1/tools/search` (wyniki z treścią) | `DEEPSEEK_API_KEY` |
| ASR audio | `POST /v1/tools/asr` (moduł gotowy, niepodłączony do `/verify`) | `DEEPSEEK_API_KEY` |

Nie ma już OpenRoutera, Jev, BGE-M3 ani zewnętrznego `DEEPSEEK_OCR_URL`.
Embeddingi nie są modelem AI — służą tylko do zawężenia kandydatów, a końcową decyzję
podejmuje DeepSeek.

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

`src/sources/manifest.ts`: rekordy źródeł typu `primary`, `secondary`, `fact_check` — m.in.
Dziennik Ustaw, Monitor Polski, ISAP, PKW, GUS, NBP, EUR-Lex, Demagog, AFP Fact Check,
EUvsDisinfo, EDMO, NASK.

Research korzysta z:

- lokalnego korpusu `corpus/corpus.jsonl` (dokumenty rządowe/publiczne),
- polskiej Wikipedii i Wikidanych,
- snapshotu EUvsDisinfo (`data/euvsdisinfo/cases.ndjson`, opcjonalny),
- wyszukiwania internetowego DeepSeek (`/v1/tools/search`) dla bieżących doniesień,
- opcjonalnego Google Fact Check Tools — **nie jest wymagane**; bez klucza jest pomijane,
- opcjonalnej wyszukiwarki Brave/Tavily — **nie jest wymagana**.

Sama obecność źródła nie przesądza werdyktu. DeepSeek musi potwierdzić, że zdanie
faktycznie mówi to samo co twierdzenie.

### Skala i baza

Domyślnie cache to pliki JSON w `data/`. Po włączeniu `MYSQL_URL` backend używa
`MySQLCacheStore`:

```bash
mysql -u user -p prawdowid < sql/schema.sql
# .env: MYSQL_URL=mysql://user:pass@host:3306/prawdowid
```

- embeddingi leżą jako `BLOB` (`Float32Array`, 4 KB na 1024 wymiary),
- `search()` przegląda ograniczone okno czasowe i rerankuje w procesie,
- dokumenty źródłowe i dowody mają osobne tabele (`documents`, `evidence`).

## Bezpieczeństwo

- treść użytkownika jest **danymi** w `<ARTICLE>`; MASTERPROMPT zabrania wykonywania instrukcji z treści,
- heurystyka `detectInjection()` oznacza próby wpływu i dopisuje ograniczenie do odpowiedzi,
- walidacja wejścia (rozmiar, `http/https`, JSON) i osobne komunikaty błędów,
- brak sekretów w repo; `.env` w `.gitignore`,
- cache i logi to pliki lokalne (`data/`), możliwe do usunięcia.

## Koszt (szacunek)

Jedno sprawdzenie to głównie tokeny DeepSeek Flash. Cennik off-peak w 2026-11:
`$0.15 / 1M` wejścia i `$0.60 / 1M` wyjścia. Wyszukiwanie DeepSeek to
`$0.75 / 1000` zapytań, OCR jest rozliczany za stronę, ASR za sekundę audio.
Embeddingi są lokalne i darmowe.

## Testy

```bash
bun run typecheck
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
- **zależności**: DeepSeek API; awaria kończy się statusem `error`, nie werdyktem,
- **multimodalność**: OCR obrazów działa przez DeepSeek; MP4/audio nie jest jeszcze podłączone do `/verify`,
- **kanał Discord** jest utrzymywany w osobnym repozytorium i korzysta z `POST /verify`.
