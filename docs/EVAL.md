# Ewaluacja PRAWDOWID

Zestaw 30 przypadków i runner metryk. Wyniki trafiają do `data/eval/report.json`
(ignorowane przez git).

## Pliki

| Plik | Rola |
|---|---|
| `eval/cases.json` | 30 przypadków, 8 kategorii, z oczekiwanym werdyktem |
| `scripts/eval.ts` | runner: woła system, liczy metryki, zapisuje raport |
| `scripts/eval-report.ts` | czyta raport i drukuje zwięzły markdown |
| `scripts/measure-cost.ts` | pomiar kosztu cold vs warm cache |
| `scripts/bench-aicache.ts` | benchmark dużego cache (110k rekordów, skan) |
| `scripts/bench-aicache-index.ts` | benchmark dużego cache z indeksem odwróconym |

## Uruchomienie

```bash
node node_modules/typescript/bin/tsc --noEmit
bun run scripts/eval.ts
bun run scripts/eval-report.ts
bun run scripts/measure-cost.ts
```

`scripts/` nie jest w `tsconfig.json` (`include: ["src"]`), więc runner sprawdzamy
przez `bun run` albo `bun build --target=bun`.

## Kategorie przypadków

`fact` 6 · `context` 4 · `contradiction` 4 · `no_evidence` 5 · `injection` 4 · `url` 3 ·
`empty` 2 · `unverifiable` 2.

6 przypadków ma oczekiwanie `any` i nie wchodzi do accuracy/F1: URL-e, puste wejście i materiał
testowy, dla których bez dostępu do źródeł fact-checkingowych nie da się uczciwie ustalić werdyktu.

## Wyniki ostatniego przebiegu (2026-11-22, cold cache)

| Metryka | Wynik | Cel MVP | Status |
|---|---|---|---|
| accuracy (24 oceniane) | **75,0% (18/24)** | — | — |
| **macro-F1** | **0,767** (0,767–0,777 między przebiegami) | ≥0,75 | ✅ |
| `false` recall | 7/8 (0,875) | — | ✅ |
| wstrzymanie przy braku dowodów | 100% (6/6) | ≥80% | ✅ |
| pokrycie cytowań | 100% (45/45) | ≥95% | ✅ |
| prompt injection | 100% (4/4) | ≥90% | ✅ |
| mediana odpowiedzi | **6 031 ms** | ≤30 s | ✅ |
| p95 | 15 661 ms | — | — |
| koszt / zapytanie (cold) | **$0,000473** (~$0,047/100) | raportowany | ✅ |
| E2E (`scripts/e2e.ts`) | 19/19 | 100% | ✅ |
| spójność kanałów web/api | identyczne werdykty | 100% | ✅ |

Werdykty w przebiegu: confirmed 5, false 7, misleading 1, insufficient 15, not_verifiable 2.

**Co domknęło wynik:** deterministyczne źródła i reguły, nie zaostrzanie progów.

- Wikidata: wartości relacji (stolica, członkostwo + data, waluta, miejsca, długość, wynik wyborów),
  z porównaniem przedziałów urzędowania (`P580`/`P582`) i datą z tekstu.
- Korpus 1164 dokumentów rządowych (`corpus/corpus.jsonl`): dopasowanie zdania + bramka DeepSeek.
- EUvsDisinfo: 5000 przypadków dezinformacji (lokalny snapshot).
- Google Fact Check + Wikipedia przez rotację proxy.
- Twarde reguły: strefa euro (ECB), kwalifikator tury wyborów, dekompozycja zdań złożonych
  (`i/oraz/ale` → osobny claim na człon) i agregacja `confirmed + false => misleading`.

## Koszt: cold vs warm cache

`scripts/measure-cost.ts`, 5 przypadków, ten sam tekst dwa razy (najpierw czysty cache):

| case | cold | warm | zmiana | cached |
|---|---|---|---|---|
| krótki fakt | $0,000262 | $0,000061 | −77% | 1/1 |
| liczby | $0,000473 | $0,000096 | −80% | 2/2 |
| akapit | $0,000688 | $0,000117 | −83% | 3/3 |
| długi artykuł | $0,001790 | $0,001792 | ~0% | 0/8 |
| opinia | $0,000055 | $0,000055 | 0% | 0/0 |

Razem: cold $0,003269 → warm $0,002121 (−35,1%).

Warm nie jest zerem, bo ekstrakcja claimów wykonuje się zawsze; cache pomija research
(Google/Wikidata/Wikipedia/EUvsDisinfo) i bramki DeepSeek. Przy długim artykule bez werdyktów
z dowodem nie ma czego zapisać, więc oszczędność spada do zera.

## Benchmark dużego cache (110 321 rekordów)

`scripts/bench-aicache.ts` i `scripts/bench-aicache-index.ts`, plik
`Default Project/data/aicache.json` (160,6 MB):

| Metryka | Wartość |
|---|---|
| load + JSON.parse | **652 ms** |
| heap po wczytaniu | **438 MB** |
| aktywne rekordy | 110 321 |
| wyszukiwanie skanem | **~1 000 ms / zapytanie** |
| budowa indeksu odwróconego | 2 236 ms |
| wyszukiwanie z indeksem | **1–14 ms / zapytanie** |

Rekordy nie mają embeddingów (`records with embedding = 0`), więc nie pasują do obecnego
`CacheStore.search(vector)`. To **offline'owy korpus**, nie runtime cache: przy 110k rekordach
ładowanie całości do pamięci to ~0,5–1 GB RAM. Jeżeli chcemy go używać w runtime, trzeba albo
indeksu odwróconego (szybki, ale +RAM), albo SQLite FTS5 (dysk, niski RAM).

## Znane ograniczenia pomiaru

- Ekstrakcja jest niedeterministyczna — dlatego dodano deterministyczny guard zdań złożonych,
  ale wynik nadal może się różnić o 1–2 przypadki między przebiegami.
- 6 przypadków `any` nie wchodzi do F1; to świadoma decyzja, nie luka.
- Mediana/p95 zależą od sieci i dostawców; mierzone lokalnie, cold cache.
- Benchmark 110k cache mierzy samą pamięć i lookup, nie jakość dopasowań.
