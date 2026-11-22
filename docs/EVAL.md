# Ewaluacja PRAWDOWID

Zestaw 30 przypadkÃ³w i runner, ktÃ³ry mierzy, czy system faktycznie wydaje werdykty
zgodne z oczekiwaniami â€” a nie tylko czy odpowiada.

Pliki:

| plik | rola |
|---|---|
| `eval/cases.json` | 30 przypadkÃ³w (8 kategorii) z oczekiwanym werdyktem |
| `scripts/eval.ts` | runner: woÅ‚a system, liczy metryki, zapisuje `data/eval/report.json` |
| `scripts/eval-report.ts` | czyta raport i drukuje zwiÄ™zÅ‚y markdown |
| `data/eval/report.json` | wynik ostatniego przebiegu (generowany) |

## Uruchomienie

```bash
# 1. BezpoÅ›rednio verifyInput (domyÅ›lnie, szybciej â€” bez HTTP)
bun run scripts/eval.ts

# 2. Przez dziaÅ‚ajÄ…cy serwer (sprawdza teÅ¼ walidacjÄ™ HTTP i statusy)
bun run dev   # w drugim terminalu
EVAL_BASE_URL=http://localhost:3000 bun run scripts/eval.ts

# 3. Podsumowanie do README / slajdÃ³w
bun run scripts/eval-report.ts
```

Zmienne (wszystkie opcjonalne):

| zmienna | domyÅ›lnie | znaczenie |
|---|---|---|
| `EVAL_BASE_URL` | brak | gdy ustawiona, runner robi `POST {base}/verify` zamiast woÅ‚aÄ‡ `verifyInput` |
| `EVAL_CASES` | `eval/cases.json` | inny plik przypadkÃ³w |
| `EVAL_REPORT` | `data/eval/report.json` | inny plik raportu |
| `EVAL_CACHE_FILE` | `data/eval/cache.json` | cache dla trybu bezpoÅ›redniego (osobny, Å¼eby nie mieszaÄ‡ z demo) |

Przebieg jest **sekwencyjny** i trwa kilka minut (30 przypadkÃ³w Ã— kilka sekund + pobranie URL).
Jeden bÅ‚Ä…d przypadku nie przerywa caÅ‚oÅ›ci â€” trafia do raportu jako `status: runner_error`.

## Jak przypisujemy werdykt do przypadku

System zwraca **wiele twierdzeÅ„** na jedno wejÅ›cie, a przypadki majÄ… **jeden** oczekiwany
werdykt. PrzyjÄ™ta reguÅ‚a:

1. werdykt przypadku = werdykt **pierwszego** zwrÃ³conego twierdzenia (`claims[0]`),
   bo ekstrakcja zachowuje kolejnoÅ›Ä‡ od nagÅ‚Ã³wka/zdania gÅ‚Ã³wnego,
2. brak twierdzeÅ„ â†’ `null` (liczone jako pomyÅ‚ka, jeÅ›li przypadek ma oczekiwanie inne niÅ¼ `any`),
3. dodatkowo raportujemy `anyClaimMatched` â€” czy oczekiwany werdykt pojawiÅ‚ siÄ™
   na **ktÃ³rymkolwiek** twierdzeniu.

ReguÅ‚a 1 jest celowo ostra. `case-06` (â€žPolska jest w UE od 2004 i uÅ¼ywa euroâ€) pokazuje jej
sÅ‚aboÅ›Ä‡: system moÅ¼e poprawnie oznaczyÄ‡ drugÄ… czÄ™Å›Ä‡, ale jeÅ›li pierwsze twierdzenie jest
prawdziwe, przypadek wychodzi jako pomyÅ‚ka. Dlatego `anyClaimMatched` jest w raporcie obok â€”
pokazuje â€žwiedziaÅ‚, ale nie tam, gdzie patrzymyâ€.

## Metryki

| metryka | definicja |
|---|---|
| **accuracy** | trafne werdykty / przypadki z oczekiwaniem innym niÅ¼ `any` |
| **macro-F1** | Å›rednia F1 po klasach **wystÄ™pujÄ…cych w oczekiwaniach** (klasy bez supportu pomijane, Å¼eby nie zaniÅ¼aÄ‡ sztucznie) |
| **abstention** | oczekiwane `insufficient_evidence` â†’ przewidziane `insufficient_evidence` |
| **citation coverage** | twierdzenia z â‰¥1 dowodem / wszystkie zwrÃ³cone twierdzenia |
| **injection pass** | przypadki z `mustMentionInLimitations`: czy ktÃ³reÅ› ograniczenie zawiera wymagany termin (np. â€žinstrukcjeâ€) |
| **latencja** | mediana i p95 czasu Å›ciany (`performance.now()`), plus `timingMs` z odpowiedzi |
| **koszt** | Å›redni i Å‚Ä…czny `costUsd` z odpowiedzi (szacunek systemu, nie faktura) |

`citation coverage` liczy **wszystkie** twierdzenia, takÅ¼e z przypadkÃ³w `any`, bo to metryka
jakoÅ›ci dowodzenia, a nie trafnoÅ›ci werdyktu.

## Kategorie (30 przypadkÃ³w)

| kategoria | n | co testuje |
|---|---|---|
| `fact` | 6 | prawdy i faÅ‚sze elementarne oraz zdanie czÄ™Å›ciowo prawdziwe |
| `context` | 4 | twierdzenia zaleÅ¼ne od daty (â€žw 2014â€, â€žobecnieâ€) |
| `contradiction` | 4 | sprzecznoÅ›Ä‡ z ustalonym rekordem (NATO 1999, wybory 2020, dÅ‚ugoÅ›Ä‡ WisÅ‚y) |
| `no_evidence` | 5 | konkretne, lecz niepotwierdzalne szczegÃ³Å‚y â€” oczekiwane wstrzymanie |
| `injection` | 4 | prÃ³by wpÅ‚ywu na instrukcje (PL i EN) |
| `url` | 3 | wejÅ›cie linkiem (gov.pl, Wikipedia, PKW) |
| `empty` | 2 | puste wejÅ›cie i same biaÅ‚e znaki |
| `unverifiable` | 2 | opinia i prognoza â€” nie podlegajÄ… weryfikacji |

## Dlaczego czÄ™Å›Ä‡ oczekiwaÅ„ to `any`

SzeÅ›Ä‡ przypadkÃ³w ma `expected: "any"`:

- `case-19` â€” materiaÅ‚ testowy z danych hackathonu (Brzoska); publicznie brak potwierdzenia
  zdarzenia, ale bez ÅºrÃ³dÅ‚a fact-checkingowego nie ustalam twardo, czy uczciwy werdykt to
  `false`, czy `insufficient_evidence`,
- `case-24`, `case-25`, `case-26` â€” **URL**: treÅ›Ä‡ strony zmienia siÄ™ w czasie i zaleÅ¼y od
  dostÄ™pnoÅ›ci czytnika; oceniamy dziaÅ‚anie Å›cieÅ¼ki URL, nie treÅ›Ä‡,
- `case-27`, `case-28` â€” **puste wejÅ›cie**: poprawna odpowiedÅº to `needs_clarification`
  (bezpoÅ›rednio) albo HTTP 400 (przez `/verify`), a to **nie jest werdykt**, wiÄ™c nie ma go
  w taksonomii werdyktÃ³w.

Zasada: **nie wymyÅ›lamy oczekiwaÅ„, ktÃ³rych nie da siÄ™ uczciwie uzasadniÄ‡ bez Google.**
Lepiej wyÅ‚Ä…czyÄ‡ przypadek z accuracy/F1 i powiedzieÄ‡ to wprost, niÅ¼ wpisaÄ‡ werdykt â€žna pamiÄ™Ä‡â€.
Te przypadki nadal sÄ… uruchamiane i widaÄ‡ ich status, liczbÄ™ twierdzeÅ„, dowody i czas.

## Jak czytaÄ‡ wyniki

- **Niski accuracy nie znaczy, Å¼e oczekiwania sÄ… zÅ‚e.** `fact` i `context` zawierajÄ… prawdy
  elementarne (Warszawa stolicÄ…, 460 posÅ‚Ã³w, UE 2004). JeÅ›li system zwraca dla nich
  `insufficient_evidence`, to znaczy, Å¼e korpus/Google nie pokrywa podstaw â€” i to jest
  wÅ‚aÅ›nie wynik, ktÃ³ry ma byÄ‡ widoczny.
- **Bez klucza `GOOGLE_FACT_CHECK_API_KEY`** werdykty `false`/`confirmed`/`misleading`
  praktycznie nie powstajÄ… (korpus manifestu daje tylko `context`). Raport pokazuje
  `klucz Google Fact Check: nie`. PorÃ³wnuj przebiegi przy tej samej konfiguracji.
- **Cache** (`data/eval/cache.json`) utrwala werdykty miÄ™dzy przebiegami: druga iteracja
  bywa szybsza i bardziej stanowcza. Do czystego pomiaru usuÅ„ plik cache przed biegiem.
- **Niedeterminizm**: ekstrakcja modelu moÅ¼e dzieliÄ‡ zdanie inaczej, wiÄ™c `claims[0]` i wynik
  mogÄ… siÄ™ rÃ³Å¼niÄ‡ miÄ™dzy przebiegami. To nie bÅ‚Ä…d runnera â€” to wÅ‚aÅ›ciwoÅ›Ä‡ systemu.
- **Koszt** to `costUsd` zwracane przez system (szacunek), nie rzeczywiste rozliczenie.

## PowiÄ…zane testy

```bash
node node_modules/typescript/bin/tsc --noEmit     # tylko src/
bun run scripts/test-verify.ts                   # dym: puste / injection / twierdzenie
bun run scripts/eval.ts                          # peÅ‚na ewaluacja
```

`scripts/` nie jest w `tsconfig.json` (`include: ["src"]`), wiÄ™c runner sprawdzamy osobno:

```bash
bun build --target=bun scripts/eval.ts
bun build --target=bun scripts/eval-report.ts
```

## Wyniki ostatniego przebiegu (2026-11-22, bez klucza Google)

| Metryka | Wynik | Cel MVP | Status |
|---|---|---|---|
| accuracy (24 oceniane) | 41,7% (10/24) | — | — |
| macro-F1 | 0,404 | ≥0,75 | ❌ |
| wstrzymanie przy braku dowodów | 100% (6/6) | ≥80% | ✅ |
| pokrycie cytowań | 100% (58/58) | ≥95% | ✅ |
| prompt injection | 100% (4/4) | ≥90% | ✅ |
| mediana odpowiedzi | 4 512 ms | ≤30 s | ✅ |
| p95 | 24 820 ms | — | — |
| koszt / zapytanie | $0,000744 (~$0,074/100) | raportowany | ✅ |
| E2E (`scripts/e2e.ts`) | 19/19 | 100% | ✅ |
| spójność kanałów web/api | identyczne werdykty | 100% | ✅ |

**Interpretacja:** F1 wzrósł z 0,205 do 0,404 po włączeniu klucza Google i awaryjnego źródła
wtórnego (Wikipedia, tylko gdy korpus i fact-checki nic nie dają, z bramką Jev). Nadal jest poniżej
celu, bo **klasa `false` ma recall 0** — żadne z dostępnych źródeł nie mówi wprost „to twierdzenie
jest fałszywe" dla fałszywek z zestawu; system wtedy uczciwie wstrzymuje się zamiast zgadywać.
Aby podnieść F1, trzeba źródła, które wprost obalają twierdzenie ( pełny korpus dokumentów,
wyszukiwarka pełnotekstowa, więcej fact-checków) — nie da się tego zrobić samym progiem.



