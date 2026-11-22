# Obserwowalność i utrzymanie

Jak sprawdzić, czy Prawdowid działa, co pokazuje, ile kosztuje i jak czyścić dane.
Wszystko poniżej opiera się na tym, co serwer rzeczywiście zapisuje — bez dodatkowych zależności.

## 1. `GET /health`

Najprostszy sygnał życia:

```json
{ "ok": true, "uptimeSec": 137, "version": "0.1.0" }
```

- `ok: true` — proces przyjął żądanie. **Nie** oznacza, że zewnętrzne API (model, wyszukiwarka) odpowiadają.
- `uptimeSec` — czas od startu procesu. Mały po restarcie, duży przy długim działaniu.
- Health-check nie sprawdza zależności zewnętrznych: przy awarii dostawcy dalej zwróci `ok: true`, a błędy pokażą się dopiero w `/metrics` i w logu JSONL.

## 2. `GET /metrics`

Liczniki trzymane w pamięci procesu (`src/server/logger.ts`). Restart = wyzerowanie.

| Pole | Znaczenie |
| --- | --- |
| `uptimeSec` | sekundy od startu procesu |
| `total` | liczba **zakończonych** weryfikacji (każde `/verify` z policzonym wynikiem, także `error`) |
| `statuses` | rozkład statusów odpowiedzi: `ok`, `error`, `needs_clarification`, `out_of_scope` |
| `verdicts` | suma werdyktów po **twierdzeniach**: `confirmed`, `false`, `misleading`, `insufficient_evidence`, `not_verifiable` |
| `abstained` | liczba twierdzeń z werdyktem `insufficient_evidence` (system powiedział „nie wiem”) |
| `p50Ms`, `p95Ms` | mediana i 95. percentyl czasu odpowiedzi z bufora ostatnich 10 000 pomiarów |
| `avgCostUsd` | średni koszt modeli na żądanie (USD) |

Jak czytać:

- **`statuses.error` rośnie** — problem techniczny (klucz API, sieć, limit dostawcy), nie werdykt.
- **`statuses.needs_clarification` rośnie** — użytkownicy wysyłają puste/niepełne wejścia. To nie błąd.
- **`abstained` / suma `verdicts`** — udział „nie wiem”. Wysoki jest uczciwy, ale oznacza braki w bazie źródeł.
- **`p95Ms` >> `p50Ms`** — ogon latency: zwykle research lub wolne źródło. Sprawdź `timingMs` w logu JSONL.
- **`avgCostUsd`** — jeśli skacze, ktoś sprawdza długie teksty albo cache przestał trafiać.

`/metrics` jest publiczny i tylko do odczytu. Nie zawiera treści zgłoszeń.

## 3. Log JSONL: `data/logs/verify.jsonl`

Jedna linia = jedno żądanie, format stabilny (czytelny dla `jq`, `grep`, Excela po imporcie):

```json
{"ts":"2026-11-22T09:12:44.120Z","sessionId":"...","question":"pierwsze 240 znaków wejścia","status":"ok","timingMs":4120,"claims":[{"verdict":"insufficient_evidence","claim":"..."}],"channel":"web","inputKind":"text","models":["..."],"costUsd":0.0031}
```

- `ts` — czas zakończenia weryfikacji (UTC, ISO 8601).
- `question` — **zanonimizowane** pierwsze 240 znaków: e-maile → `[email]`, numery → `[numer]`.
- `status` — jak w `/metrics`. `error` = brak werdyktu.
- `channel` — `web` / `api` / `discord` / `sms`; pozwala porównać kanały.
- `claims` — tablica werdyktów; pusta przy `error` i `needs_clarification`.

Zapisy są szeregowane (`writeChain`), więc linie nie przeplatają się. Błąd dysku trafia na stderr i **nigdy** nie psuje odpowiedzi HTTP.

### Rotacja

Gdy `verify.jsonl` przekroczy **20 MB**, logger przenosi go do `verify.jsonl.1` (nadpisując poprzednią kopię) i zaczyna nowy plik. Sprawdzenie rozmiaru odbywa się co 100 zapisów, żeby nie `stat`-ować pliku przy każdym żądaniu. Format linii się nie zmienia; rotacja jest best-effort i nie blokuje odpowiedzi.

Czytanie:

```bash
# ostatnie 20 wpisów
tail -n 20 data/logs/verify.jsonl

# tylko błędy techniczne
grep '"status":"error"' data/logs/verify.jsonl | tail -n 20

# rozkład kanałów
jq -r '.channel' data/logs/verify.jsonl | sort | uniq -c
```

## 4. `GET /cases` — pętla informacji

Nierozstrzygnięte pytania (twierdzenia z werdyktem `insufficient_evidence` lub `not_verifiable`) trafiają do `data/moderation/cases.json` i są klastrowane po podobieństwie.

```json
{
  "total": 3, "open": 2, "escalated": 0, "recommended": 1,
  "cases": [
    { "id": "...", "question": "...", "count": 4, "status": "open",
      "escalated": false, "escalatedAt": null,
      "alertReason": "Rekomendacja przekazania: brak MODERATOR_WEBHOOK_URL, alert tylko zapisany lokalnie.",
      "channels": ["web"], "firstSeen": "...", "lastSeen": "..." }
  ]
}
```

- `count` — ile razy pytanie wróciło.
- `escalated: true` — alert **faktycznie dotarł** do moderatora (webhook odpowiedział 2xx).
- `escalated: false` + `alertReason` — to tylko **rekomendacja**; alert leży w `data/alerts/alerts.jsonl`. API nie twierdzi, że ktoś został powiadomiony.
- `recommended` w nagłówku — sprawy z `alertReason`, jeszcze nieeskalowane.
- `POST /cases/:id/ack` — oznacza sprawę jako `acknowledged` (np. moderator ją przyjął). Zwraca 404 dla nieznanego `id`.

Próg alertu: 3 zgłoszenia tej samej sprawy. Bez `MODERATOR_WEBHOOK_URL` eskalacja nigdy nie nastąpi — i to jest poprawne zachowanie.

## 5. Rate limit

Fixed window w pamięci: **20 żądań / 60 s / IP** na `POST /verify`. Po przekroczeniu: HTTP **429** i odpowiedź z `status: "error"` („Zbyt wiele zapytań”), która **nie jest werdyktem**.

- Limit obejmuje też żądania odrzucone walidacją (licznik rośnie przed sprawdzeniem treści).
- Restart procesu zeruje liczniki; przy wielu instancjach każda ma własny limit.
- Za reverse proxy liczony jest `x-forwarded-for`, jeśli `server.requestIP` nie zwróci adresu.
- Nagłówek `Retry-After` nie jest wysyłany — okno to maksymalnie 60 s.

## 6. Retencja danych

Skrypt `scripts/cleanup.ts` pilnuje, żeby demo nie rosło w nieskończoność.

```bash
bun run scripts/cleanup.ts --dry-run     # raport, zero zmian (zalecane najpierw)
bun run scripts/cleanup.ts               # realne czyszczenie
RETENTION_DAYS=3 bun run scripts/cleanup.ts
bun run scripts/cleanup.ts --days=30
```

Domyślnie **7 dni**. Zakres:

| Ścieżka | Co robi |
| --- | --- |
| `data/logs/*.jsonl` (także `verify.jsonl.1`) | plik starszy niż N dni → usuwany; świeższy → usuwane linie z `ts` starszym niż N dni |
| `data/cache/*.json` | wpisy z `checkedAt` starszym niż N dni |
| `data/moderation/cases.json` | sprawy z `lastSeen` starszym niż N dni |

Zasady bezpieczeństwa: skrypt działa **wyłącznie** w `data/`, nigdy nie usuwa katalogów, nieznany format JSON pomija z komunikatem zamiast nadpisywać. Kod wyjścia 1 oznacza problem (np. brak uprawnień), nie „brudne dane”.

Po czyszczeniu warto sprawdzić `/cases` i `/metrics` — liczniki w pamięci nie zmieniają się, bo dotyczą procesu, nie plików.

## 7. Testy i kontrole

```bash
node ./node_modules/typescript/bin/tsc --noEmit   # typy (obejmuje src/)
bun run scripts/ui-check.ts                       # statyczna kontrola UI (formularz, aria, werdykty, brak CDN)
bun run scripts/cleanup.ts --dry-run              # retencja bez zmian
bun run scripts/e2e.ts                            # pełny E2E na porcie 3110 (1-3 min, woła modele)
```

`e2e.ts` podnosi serwer jako proces potomny, sprawdza `/health`, `/metrics`, `/`, kontrakt `/verify`, spójność kanałów `web`/`api`, odrzucenia wejścia, eskalację powtarzanego pytania i rate limit, a na końcu ubija proces (na Windows także przez `taskkill`). Kod wyjścia 1 = cokolwiek nie zagrało.
