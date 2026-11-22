# Ewaluacja PRAWDOWID

Zestaw 30 przypadków i runner, który mierzy, czy system faktycznie wydaje werdykty
zgodne z oczekiwaniami — a nie tylko czy odpowiada.

Pliki:

| plik | rola |
|---|---|
| `data/eval/cases.json` | 30 przypadków (8 kategorii) z oczekiwanym werdyktem |
| `scripts/eval.ts` | runner: woła system, liczy metryki, zapisuje `data/eval/report.json` |
| `scripts/eval-report.ts` | czyta raport i drukuje zwięzły markdown |
| `data/eval/report.json` | wynik ostatniego przebiegu (generowany) |

## Uruchomienie

```bash
# 1. Bezpośrednio verifyInput (domyślnie, szybciej — bez HTTP)
bun run scripts/eval.ts

# 2. Przez działający serwer (sprawdza też walidację HTTP i statusy)
bun run dev   # w drugim terminalu
EVAL_BASE_URL=http://localhost:3000 bun run scripts/eval.ts

# 3. Podsumowanie do README / slajdów
bun run scripts/eval-report.ts
```

Zmienne (wszystkie opcjonalne):

| zmienna | domyślnie | znaczenie |
|---|---|---|
| `EVAL_BASE_URL` | brak | gdy ustawiona, runner robi `POST {base}/verify` zamiast wołać `verifyInput` |
| `EVAL_CASES` | `data/eval/cases.json` | inny plik przypadków |
| `EVAL_REPORT` | `data/eval/report.json` | inny plik raportu |
| `EVAL_CACHE_FILE` | `data/eval/cache.json` | cache dla trybu bezpośredniego (osobny, żeby nie mieszać z demo) |

Przebieg jest **sekwencyjny** i trwa kilka minut (30 przypadków × kilka sekund + pobranie URL).
Jeden błąd przypadku nie przerywa całości — trafia do raportu jako `status: runner_error`.

## Jak przypisujemy werdykt do przypadku

System zwraca **wiele twierdzeń** na jedno wejście, a przypadki mają **jeden** oczekiwany
werdykt. Przyjęta reguła:

1. werdykt przypadku = werdykt **pierwszego** zwróconego twierdzenia (`claims[0]`),
   bo ekstrakcja zachowuje kolejność od nagłówka/zdania głównego,
2. brak twierdzeń → `null` (liczone jako pomyłka, jeśli przypadek ma oczekiwanie inne niż `any`),
3. dodatkowo raportujemy `anyClaimMatched` — czy oczekiwany werdykt pojawił się
   na **którymkolwiek** twierdzeniu.

Reguła 1 jest celowo ostra. `case-06` („Polska jest w UE od 2004 i używa euro”) pokazuje jej
słabość: system może poprawnie oznaczyć drugą część, ale jeśli pierwsze twierdzenie jest
prawdziwe, przypadek wychodzi jako pomyłka. Dlatego `anyClaimMatched` jest w raporcie obok —
pokazuje „wiedział, ale nie tam, gdzie patrzymy”.

## Metryki

| metryka | definicja |
|---|---|
| **accuracy** | trafne werdykty / przypadki z oczekiwaniem innym niż `any` |
| **macro-F1** | średnia F1 po klasach **występujących w oczekiwaniach** (klasy bez supportu pomijane, żeby nie zaniżać sztucznie) |
| **abstention** | oczekiwane `insufficient_evidence` → przewidziane `insufficient_evidence` |
| **citation coverage** | twierdzenia z ≥1 dowodem / wszystkie zwrócone twierdzenia |
| **injection pass** | przypadki z `mustMentionInLimitations`: czy któreś ograniczenie zawiera wymagany termin (np. „instrukcje”) |
| **latencja** | mediana i p95 czasu ściany (`performance.now()`), plus `timingMs` z odpowiedzi |
| **koszt** | średni i łączny `costUsd` z odpowiedzi (szacunek systemu, nie faktura) |

`citation coverage` liczy **wszystkie** twierdzenia, także z przypadków `any`, bo to metryka
jakości dowodzenia, a nie trafności werdyktu.

## Kategorie (30 przypadków)

| kategoria | n | co testuje |
|---|---|---|
| `fact` | 6 | prawdy i fałsze elementarne oraz zdanie częściowo prawdziwe |
| `context` | 4 | twierdzenia zależne od daty („w 2014”, „obecnie”) |
| `contradiction` | 4 | sprzeczność z ustalonym rekordem (NATO 1999, wybory 2020, długość Wisły) |
| `no_evidence` | 5 | konkretne, lecz niepotwierdzalne szczegóły — oczekiwane wstrzymanie |
| `injection` | 4 | próby wpływu na instrukcje (PL i EN) |
| `url` | 3 | wejście linkiem (gov.pl, Wikipedia, PKW) |
| `empty` | 2 | puste wejście i same białe znaki |
| `unverifiable` | 2 | opinia i prognoza — nie podlegają weryfikacji |

## Dlaczego część oczekiwań to `any`

Sześć przypadków ma `expected: "any"`:

- `case-19` — materiał testowy z danych hackathonu (Brzoska); publicznie brak potwierdzenia
  zdarzenia, ale bez źródła fact-checkingowego nie ustalam twardo, czy uczciwy werdykt to
  `false`, czy `insufficient_evidence`,
- `case-24`, `case-25`, `case-26` — **URL**: treść strony zmienia się w czasie i zależy od
  dostępności czytnika; oceniamy działanie ścieżki URL, nie treść,
- `case-27`, `case-28` — **puste wejście**: poprawna odpowiedź to `needs_clarification`
  (bezpośrednio) albo HTTP 400 (przez `/verify`), a to **nie jest werdykt**, więc nie ma go
  w taksonomii werdyktów.

Zasada: **nie wymyślamy oczekiwań, których nie da się uczciwie uzasadnić bez Google.**
Lepiej wyłączyć przypadek z accuracy/F1 i powiedzieć to wprost, niż wpisać werdykt „na pamięć”.
Te przypadki nadal są uruchamiane i widać ich status, liczbę twierdzeń, dowody i czas.

## Jak czytać wyniki

- **Niski accuracy nie znaczy, że oczekiwania są złe.** `fact` i `context` zawierają prawdy
  elementarne (Warszawa stolicą, 460 posłów, UE 2004). Jeśli system zwraca dla nich
  `insufficient_evidence`, to znaczy, że korpus/Google nie pokrywa podstaw — i to jest
  właśnie wynik, który ma być widoczny.
- **Bez klucza `GOOGLE_FACT_CHECK_API_KEY`** werdykty `false`/`confirmed`/`misleading`
  praktycznie nie powstają (korpus manifestu daje tylko `context`). Raport pokazuje
  `klucz Google Fact Check: nie`. Porównuj przebiegi przy tej samej konfiguracji.
- **Cache** (`data/eval/cache.json`) utrwala werdykty między przebiegami: druga iteracja
  bywa szybsza i bardziej stanowcza. Do czystego pomiaru usuń plik cache przed biegiem.
- **Niedeterminizm**: ekstrakcja modelu może dzielić zdanie inaczej, więc `claims[0]` i wynik
  mogą się różnić między przebiegami. To nie błąd runnera — to właściwość systemu.
- **Koszt** to `costUsd` zwracane przez system (szacunek), nie rzeczywiste rozliczenie.

## Powiązane testy

```bash
node node_modules/typescript/bin/tsc --noEmit     # tylko src/
bun run scripts/test-verify.ts                   # dym: puste / injection / twierdzenie
bun run scripts/eval.ts                          # pełna ewaluacja
```

`scripts/` nie jest w `tsconfig.json` (`include: ["src"]`), więc runner sprawdzamy osobno:

```bash
bun build --target=bun scripts/eval.ts
bun build --target=bun scripts/eval-report.ts
```
