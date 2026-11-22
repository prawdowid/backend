# Ewaluacja PRAWDOWID

Zestaw 30 przypadków i runner metryk. Wyniki trafiają do `data/eval/report.json`
(ignorowane przez git) i do tabeli poniżej.

## Pliki

| Plik | Rola |
|---|---|
| `eval/cases.json` | 30 przypadków, 8 kategorii, z oczekiwanym werdyktem |
| `scripts/eval.ts` | runner: woła system, liczy metryki, zapisuje raport |
| `scripts/eval-report.ts` | czyta raport i drukuje zwięzły markdown |
| `scripts/measure-cost.ts` | pomiar kosztu cold vs warm cache |
| `docs/EVAL.md` | ten dokument |

## Uruchomienie

```bash
node node_modules/typescript/bin/tsc --noEmit   # tylko src/
bun run scripts/eval.ts                         # pełna ewaluacja
bun run scripts/eval-report.ts                  # tabela do slajdów
bun run scripts/measure-cost.ts                 # koszt cold/warm
```

`scripts/` nie jest w `tsconfig.json` (`include: ["src"]`), więc runner sprawdzamy osobno:

```bash
bun build --target=bun scripts/eval.ts
bun build --target=bun scripts/eval-report.ts
```

## Kategorie przypadków

`fact` 6 · `context` 4 · `contradiction` 4 · `no_evidence` 5 · `injection` 4 · `url` 3 ·
`empty` 2 · `unverifiable` 2.

6 przypadków ma oczekiwanie `any` i nie wchodzi do accuracy/F1: to URL-e, puste wejście
i materiał testowy, dla których bez dostępu do źródeł fact-checkingowych nie da się uczciwie
ustalić werdyktu. Powody są opisane w `notes` każdego przypadku.

## Wyniki ostatniego przebiegu (2026-11-22)

| Metryka | Wynik | Cel MVP | Status |
|---|---|---|---|
| accuracy (24 oceniane) | 33,3% (8/24) | — | — |
| macro-F1 | 0,315 (0,31–0,40 między przebiegami) | ≥0,75 | ❌ |
| wstrzymanie przy braku dowodów | 83,3% (5/6) | ≥80% | ✅ |
| pokrycie cytowań | 100% (47/47) | ≥95% | ✅ |
| prompt injection | 100% (4/4) | ≥90% | ✅ |
| mediana odpowiedzi | 5 645 ms | ≤30 s | ✅ |
| p95 | 33 515 ms | — | — |
| koszt / zapytanie (cold) | $0,000513 (~$0,051/100) | raportowany | ✅ |
| E2E (`scripts/e2e.ts`) | 19/19 | 100% | ✅ |
| spójność kanałów web/api | identyczne werdykty | 100% | ✅ |

F1 jest niestabilny między przebiegami (0,31–0,40) — ekstrakcja claimów jest niedeterministyczna,
a przy 24 ocenianych przypadkach jeden inny claim zmienia wynik o kilka punktów. Podajemy zakres,
nie jedną „ładną” liczbę.

**Interpretacja:** F1 jest poniżej celu, bo klasa `false` ma recall 0. System potrafi potwierdzać
(Wikipedia + Google Fact Check + bramka Jev), ale nie ma źródła, które wprost obala twierdzenie —
więc uczciwie wstrzymuje się zamiast zgadywać. To spełnia wymóg „nie przedstawiaj werdyktu bez
dowodu”, ale nie F1. Aby podnieść F1, trzeba źródła obalającego: pełny korpus dokumentów
z wyszukiwarką pełnotekstową, więcej fact-checków albo baza EUvsDisinfo (kod gotowy, potrzebny token).

## Koszt: cold vs warm cache

`scripts/measure-cost.ts`, 5 przypadków, ten sam tekst dwa razy (najpierw czysty cache):

| case | cold | warm | zmiana | cached |
|---|---|---|---|---|
| krótki fakt | $0,000259 | $0,000059 | −77% | 1/1 |
| liczby | $0,000471 | $0,000100 | −79% | 2/2 |
| akapit | $0,000686 | $0,000311 | −55% | 2/3 |
| długi artykuł | $0,001803 | $0,001801 | −0,1% | 0/8 |
| opinia | $0,000054 | $0,000054 | 0% | 0/0 |

Razem: cold $0,003274 → warm $0,002326 (−28,9%).

Dlaczego warm nie jest zerem: ekstrakcja claimów wykonuje się zawsze (to ona dominuje w koszcie).
Cache pomija research (Google/Wikipedia/EUvsDisinfo) i bramki Jev, więc oszczędność jest duża przy
krótkich wejściach i spada do zera, gdy żadne twierdzenie nie ma dowodu do zapisania (długi artykuł
z 8 claimami: 0 trafień).

`costBreakdown` w odpowiedzi API rozbija koszt na `extractionUsd`, `jevUsd`, `embeddingUsd`
i `researchUsd` (research jest szacowany: liczba twierdzeń × $0,0002).

## Znane ograniczenia pomiaru

- Ekstrakcja jest niedeterministyczna — kolejny przebieg może dać inny zestaw claimów i inny F1.
- 6 przypadków `any` nie wchodzi do F1; to świadoma decyzja, nie luka.
- Warm cache zależy od tego, czy research zwrócił werdykt z dowodem; przy `insufficient_evidence`
  nic nie jest zapisywane.
- Mediana/p95 mierzą czas lokalny, zależny od sieci i dostawców.
