# Warstwa decyzyjna: ile F1 zostaje bez nowych źródeł

**Zakres:** analiza ostatniego przebiegu `data/eval/report.json` (2026-11-22T03:41:52Z, tryb direct) i symulacja reguł decyzyjnych na tym raporcie. Zero wywołań API, zero zmian w rdzeniu.

**Pliki:**
- raport: `data/eval/report.json`
- przypadki: `eval/cases.json`
- symulacja: `scripts/simulate-decision.ts`
- uruchomienie: `bun run scripts/simulate-decision.ts`

---

## 0. TL;DR

1. **Baseline to 8/24 trafnych (accuracy 33,3%, macro-F1 0,315).** 16 błędów, z czego **12 to `insufficient_evidence` tam, gdzie oczekiwano rozstrzygnięcia**.
2. **Sama warstwa decyzyjna — bez nowych danych — zatrzymuje się na 11/24 (45,8%, macro-F1 0,487).** To reguła R4: agregacja koniunkcyjna + zero claimów → `insufficient` + pojedynczy refute wtórny → `insufficient`. Z flagą „opinia/prognoza” (case-30) rośnie do 12/24 (50,0%, macro-F1 0,558).
3. **`supports`/`refutes` nie da się policzyć z raportu** — raport nie zapisuje relacji, typu ani confidence dowodów. To nie jest szczegół: bez tego każda optymalizacja progów jest zgadywaniem. Proxy: 3 przypadki mają werdykt na „decydującym” claimie, ale zły (case-06, case-11, case-23).
4. **Metryka „pierwszy claim” psuje case-06.** Uczciwa definicja przypadku to koniunkcja: `confirmed` tylko gdy wszystkie claimy są confirmed; częściowe potwierdzenie + niewiedza → `misleading`. To naprawia case-06 bez nowych źródeł.
5. **Sufit bez nowych źródeł:**
   - C0 — tylko decyzja: **11/24, macro-F1 0,487**
   - C1 — + taksonomia opinia/prognoza: **12/24, macro-F1 0,558**
   - C2 — + relacje i daty z istniejących dowodów: **16/24, macro-F1 0,720**
   - C3 — + naprawa pobrania `sejm.gov.pl` (case-03): **17/24, macro-F1 0,753**
   - C4 — + jedno działające źródło dla case-04: **18/24, macro-F1 0,781**
6. **Macro-F1 0,75 da się przekroczyć na istniejącym korpusie tylko przy idealnym wykorzystaniu relacji i dat (C3).** Stabilne 0,75 **accuracy** wymaga 18/24, czyli co najmniej jednego dodatkowego działającego źródła (C4). Bez nowych źródeł nie ma już czego naprawiać — brakuje samych dowodów.

---

## 1. Co raport faktycznie mierzy (i czego nie mierzy)

Przebieg: 30 przypadków, 24 oceniane werdyktowo, 6 z oczekiwaniem `any` (URL, puste wejście, materiał testowy). 47 claimów, 174 pozycje dowodowe, pokrycie cytowaniami 100%.

Raport zapisuje per przypadek:

- `expected`, `predicted` (= pierwszy werdykt claimu),
- `verdicts[]` — werdykty wszystkich claimów,
- `claims`, `evidence` (tylko **liczbę** dowodów),
- `status`, `limitations[]`,
- `anyClaimMatched`, `injection`, czasy i koszt.

Raport **nie zapisuje**:

- relacji dowodu (`supports` / `refutes` / `context`),
- typu dowodu (`primary` / `secondary` / `fact_check`),
- `confidence`, `strength`, `reasoning`,
- hostów (niezależności źródeł),
- `asOf` claimu ani dat publikacji dowodów.

Skutek: nie można rzetelnie odpowiedzieć na pytanie „ile dowodów wspiera, a ile przeczy” ani trenować progów pewności. Symulacja używa więc tylko dostępnych pól: werdyktów, liczby claimów, liczby dowodów, statusu i treści `limitations`. To wystarcza do policzenia strat i reguł agregacji, ale nie do rzetelnego tuningu relacji.

**Rekomendacja pomiarowa:** rozszerzyć `CaseResult` w `scripts/eval.ts` o profil dowodów per claim (liczby `supports/refutes/context`, `primary/secondary/fact_check`, zbiór hostów, `confidence`, `strength`, `asOf`, `fact.t`) oraz o `caseVerdict` liczony koniunkcyjnie. To nie zmienia rdzenia, tylko raport.

---

## 2. Gdzie tracona jest trafność

### 2.1. Rozkład błędów

Błędne: **16/24**.

| oczekiwane → przewidziane | n | przypadki |
|---|---:|---|
| `false` → `insufficient_evidence` | 7 | case-04, 05, 09, 10, 12, 14, 22 |
| `confirmed` → `insufficient_evidence` | 3 | case-03, 07, 08 |
| `misleading` → `confirmed` | 1 | case-06 |
| `false` → `confirmed` | 1 | case-11 |
| `misleading` → `insufficient_evidence` | 1 | case-13 |
| `insufficient_evidence` → brak werdyktu | 1 | case-21 |
| `insufficient_evidence` → `false` | 1 | case-23 |
| `not_verifiable` → `insufficient_evidence` | 1 | case-30 |

Kluczowe koszyki:

- **Niedopotwierdzenie: 12 przypadków.** Oczekiwane `confirmed`/`false`/`misleading`/`not_verifiable` dostało `insufficient_evidence`. To dominujące źródło strat.
- **Złe `confirmed`: 2** — case-06 (oczekiwane `misleading`) i case-11 (oczekiwane `false`).
- **Złe `false`: 1** — case-23 (oczekiwane `insufficient_evidence`).
- **Brak werdyktu: 1** — case-21 (injection bez claimu; `null` zamiast `insufficient_evidence`).

### 2.2. „supports/refutes, ale zły werdykt”

Z raportu **nie da się tego policzyć** — brak relacji. Proxy: przypadki, w których istnieje co najmniej jeden „decydujący” werdykt claimu (`confirmed`/`false`/`misleading`), a werdykt przypadku jest zły. Jest ich **3/6** takich przypadków:

| case | werdykt claimu | oczekiwane | co naprawdę zawiodło |
|---|---|---|---|
| case-06 | `confirmed` + `insufficient_evidence` | `misleading` | agregacja claimów; drugi claim (euro) nie ma dowodu, ale pierwszy jest potwierdzony |
| case-11 | `confirmed` | `false` | zgubiona data: „NATO w 2004” vs fakt „NATO w 1999”; claim w cache to „Polska — joined — NATO” bez roku |
| case-23 | `false` | `insufficient_evidence` | pojedynczy refute z Wikipedii uznany za wystarczający; etykieta oczekuje wstrzymania |

Case-11 potwierdza `data/eval/cache.json`: wpis `Polska — joined — NATO` z werdyktem `true` i 4 źródłami powstał w trakcie tego przebiegu. Rok 2004 zniknął przed decyzją. To nie problem progu decyzyjnego, tylko normalizacji claimu i zakresu czasowego.

### 2.3. Dlaczego tak dużo `insufficient_evidence`

W 7 przypadkach (04, 07, 08, 10, 12, 13, 14) jest 0–1 dowodów kontekstowych; w 6 z nich „Wikipedia była niedostępna”, a w case-10 jest tylko kontekst tematyczny. To nie jest błąd decyzji — **nie ma czym potwierdzić ani obalić**. W 3 przypadkach (03, 09, 22) jest 6–8 dowodów, ale wszystkie są `context`: brakuje poprawnego `supports`/`refutes`. W 1 przypadku (05) źródła są bogate, ale Wikipedia padła. W 1 przypadku (30) jest prognoza, której nie oznaczono jako `not_verifiable`.

---

## 3. Symulacja reguł decyzyjnych

Metryki liczone jak w `scripts/eval.ts`: accuracy po przypadkach `expected != "any"`, macro-F1 po klasach z `support > 0`, F1 per klasa zaokrąglane przed średnią. Baseline odtwarza raport co do wartości: 8/24, 0,315.

| ID | reguła | correct | accuracy | macro-F1 | Δ macro | F1 false | F1 misleading | F1 insuff | ocena |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| R0 | baseline: pierwszy claim | 8/24 | 33,3% | 0,315 | — | 0,000 | 0,000 | 0,364 | obecna metryka |
| R1 | najgorszy claim (severity) | 8/24 | 33,3% | 0,323 | +0,008 | 0,000 | 0,000 | 0,348 | sam „worst” nie naprawia case-06 |
| R2 | koniunkcja: częściowe potwierdzenie → `misleading` | 9/24 | 37,5% | 0,460 | +0,145 | 0,000 | 0,667 | 0,364 | naprawia case-06 |
| R3 | R2 + zero claimów (`status=ok`) → `insufficient` | 10/24 | 41,7% | 0,474 | +0,159 | 0,000 | 0,667 | 0,435 | naprawia case-21 |
| **R4** | **R3 + pojedynczy refute wtórny → `insufficient`** | **11/24** | **45,8%** | **0,487** | **+0,172** | 0,000 | 0,667 | 0,500 | **rekomendowana baza**; naprawia case-23 |
| R5 | R4 + bogaty kontekst → `confirmed` | 12/24 | 50,0% | 0,504 | +0,189 | 0,000 | 0,667 | 0,571 | overfit: naprawia 03, ale błędnie potwierdza 09 i 22 |
| R6 | R4 + bogaty kontekst → `false` | 13/24 | 54,2% | 0,574 | +0,259 | 0,364 | 0,667 | 0,571 | agresywny stress-test: naprawia 09/22, psuje 03 |
| R7 | R4 + twarde potwierdzenie (wymagaj primary) | 10/24 | 41,7% | 0,452 | +0,137 | 0,000 | 0,667 | 0,480 | koszt: psuje case-01 |

### 3.1. Co mówią poszczególne reguły

- **Próg pewności / liczba źródeł.** Obecny kod potwierdza już jedno źródło pierwotne albo jedno wtórne (`decide`, reguła 4). Nie ma tu czego „dokręcać”: podniesienie progu do primary (R7) psuje case-01, bo jedynym źródłem jest Wikipedia. Sama liczba dowodów nie jest niezależnością — raport nie ma hostów.
- **Konflikt supports/refutes.** W tym przebiegu **żaden oceniany przypadek nie ma jednocześnie supports i refutes**. Reguła „konflikt → `misleading` (albo najostrzejszy werdykt fact-checku)” jest sensowna na przyszłość, ale nie zmienia wyniku. Jedyny konflikt to case-06: `confirmed` + `insufficient`, rozwiązany przez koniunkcję.
- **„Miękkie” potwierdzenie źródła wtórnego.** Jest potrzebne: case-01 i case-20 opierają się na jednym źródle wtórnym. R7 pokazuje, że twarde wymaganie primary kosztuje 1 trafienie i 0,035 macro-F1. Warto je zostawić, ale **symetrycznie**: pojedynczy wtórny **refute** nie powinien dawać `false` (stąd R4).
- **Bogaty kontekst → zgadywanie.** R5 i R6 poprawiają wynik na próbce, ale przez overfit: 3 przypadki z 6–8 dowodami kontekstowymi mają różne oczekiwania (03 `confirmed`, 09 `false`, 22 `false`). Żadna reguła oparta na samej liczbie dowodów nie rozdzieli ich uczciwie. To wymaga relacji, nie progu.
- **`insufficient` vs `not_verifiable`.** Domyślne `insufficient` dla braku dowodów jest poprawne dla 4 przypadków `no_evidence` (15–18). Zamiana wszystkich „brak dowodów” na `not_verifiable` straciłaby te 4 trafienia i zyskała 1 (case-30) — netto −3. Scalenie klas w metryce dla R4 daje accuracy 12/24 (50,0%), ale macro-F1 **spada** do 0,465, bo znika rozróżnienie taksonomiczne. Nie ma darmowego zysku.

---

## 4. Mapowanie oczekiwań (multi-claim)

Obecna metryka bierze **pierwszy** werdykt claimu. To psuje case-06, który ma dwa claimy: `confirmed` + `insufficient_evidence`, a oczekiwane jest `misleading`.

| definicja werdyktu przypadku | correct | accuracy | macro-F1 |
|---|---:|---:|---:|
| pierwszy claim (obecna) | 8/24 | 33,3% | 0,315 |
| najgorszy claim (severity) | 8/24 | 33,3% | 0,323 |
| koniunkcja: `confirmed` tylko gdy wszystkie | 9/24 | 37,5% | 0,460 |
| koniunkcja + zero claimów → `insufficient` (R3) | 10/24 | 41,7% | 0,474 |

**Wniosek:** „najgorszy claim” nie wystarcza — dla case-06 daje `insufficient_evidence`, czyli nadal zły werdykt. Dopiero koniunkcja z regułą „część potwierdzona, część nie → `misleading`” trafia w oczekiwanie.

**Uczciwa definicja przypadku (propozycja):**

1. Jeśli którykolwiek claim jest `false` → przypadek `false`.
2. W przeciwnym razie, jeśli którykolwiek jest `misleading` → `misleading`.
3. Jeśli wszystkie claimy są `confirmed` → `confirmed`.
4. Jeśli wszystkie są `not_verifiable` → `not_verifiable`.
5. Jeśli są i `confirmed`, i `insufficient_evidence`/`not_verifiable` → `misleading` (częściowa prawda).
6. W pozostałych przypadkach → `insufficient_evidence`.

To jest spójne z opisem case-06 w `eval/cases.json` („pierwsza część prawdziwa, druga fałszywa; całość wprowadza w błąd”). Nie zmienia żadnego przypadku jedno-claimowego, więc nie „naciąga” etykiet.

**`anyClaimMatched` nie pomaga:** 8/24, tyle samo co accuracy. W tym przebiegu nie ma ukrytych trafień na innym claimie; case-06 też nie ma, bo żaden jego claim nie jest `misleading`. Problemem nie jest przypisanie, tylko brak rozstrzygającego dowodu.

---

## 5. Ile maksymalnie da się wycisnąć bez nowych źródeł

Scenariusze C1–C4 to **analiza potencjału, nie reguły do wdrożenia**: ustawiają werdykt na oczekiwany dla wskazanych przypadków i pokazują, ile wymagałby każdy poziom. C0 to jedyny w pełni wdrożalny poziom na obecnym raporcie.

| scenariusz | co dochodzi | correct | accuracy | macro-F1 |
|---|---|---:|---:|---:|
| **C0** | tylko warstwa decyzyjna (R4) | **11/24** | **45,8%** | **0,487** |
| **C1** | C0 + flaga opinia/prognoza (case-30) | **12/24** | **50,0%** | **0,558** |
| **C2** | C1 + relacje i daty z istniejących dowodów (05, 09, 11, 22) | **16/24** | **66,7%** | **0,720** |
| **C3** | C2 + naprawa pobrania `sejm.gov.pl` (03) | **17/24** | **70,8%** | **0,753** |
| **C4** | C3 + jedno działające źródło dla case-04 | **18/24** | **75,0%** | **0,781** |

### 5.1. Co dokładnie zakłada C2/C3

- **05, 09, 22 — relacje z istniejącego korpusu.** Wszystkie mają 6–8 dowodów, ale relacja `context`. Hipoteza: korpus EU/PL zawiera zdania, które pozwalają oznaczyć `refutes` (Polska nie jest w strefie euro; UE nie jest państwem). To wymaga poprawy klasyfikatora relacji albo szerszego dopasowania zdań, **nie nowych źródeł**. Jeśli klasyfikator nadal nie znajdzie tych zdań, C2 spada o 3 trafienia.
- **11 — normalizacja daty.** Claim „Polska przystąpiła do NATO w 2004” musi zachować rok i porównać go z faktem 1999. Obecny cache gubi rok. To warstwa ekstrakcji/normalizacji, nie decyzji.
- **03 — naprawa pobrania.** `sejm.gov.pl` jest w korpusie, ale fetch padł; zostały metadane. To ten sam korpus, tylko działający fetch.
- **30 — flaga opinia/prognoza.** „Do 2030 roku…” to prognoza; potrzebny jawny flag z ekstrakcji (`m=planned/hypothetical` + data w przyszłości), a nie wniosek z braku dowodów.

C3 daje macro-F1 0,753, czyli **powyżej 0,75**, ale accuracy tylko 70,8%. To pokazuje, że próg 0,75 „na F1” jest osiągalny na istniejącym korpusie **tylko przy idealnych relacjach i datach**. Nie jest to wynik odporny: wystarczy, że klasyfikator relacji nie znajdzie jednego z 05/09/22, i C2 spada poniżej 0,70.

### 5.2. Czego brakuje do stabilnego 0,75

Do accuracy 0,75 potrzeba **18/24**. C3 daje 17/24. Brakuje jednego przypadku z grupy „jedno źródło kontekstowe”:

`case-04, case-07, case-08, case-10, case-12, case-13, case-14`

To przypadki, w których jest 0–1 dowodów kontekstowych (w 6 z 7 „Wikipedia była niedostępna”, w case-10 tylko kontekst tematyczny). Żadna reguła decyzyjna tego nie naprawi — potrzebne jest **działające źródło**: Wikipedia, Google Fact Check albo primary fetch. C4 zakłada naprawę case-04 (prosta fałszywka: „stolicą Polski jest Kraków”). To wystarcza do 18/24 i macro-F1 0,781.

Dla wyniku odpornego (np. 22/24) trzeba naprawić co najmniej 5 z 7 powyższych. To już nie jest warstwa decyzyjna — to dostępność źródeł i retrievalu.

---

## 6. Co musi dojść, żeby dobić 0,75

### 6.1. Warstwa decyzyjna (bez nowych danych) — zrobić od razu

1. **Agregacja koniunkcyjna przypadku.** `confirmed` tylko gdy wszystkie claimy confirmed; częściowe potwierdzenie + niewiedza → `misleading`; `false` gdy którykolwiek false. Naprawia case-06.
2. **Zero claimów przy `status=ok` → `insufficient_evidence`**, nie `null`. Naprawia case-21 i porządkuje abstencję.
3. **Pojedynczy refute z źródła wtórnego → `insufficient_evidence`**, chyba że jest primary/fact-check albo ≥2 niezależne hosty. Naprawia case-23. Nie stosować symetrycznie do supports: pojedynczy wtórny support dla stabilnego faktu (case-01) ma zostać `confirmed`.
4. **Konflikt supports/refutes → `misleading`** (lub najostrzejszy werdykt fact-checku), zanim zadziała reguła „refutes bez supports → false”. W tym przebiegu 0 przypadków, ale to zabezpieczenie na przyszłość.
5. **Flaga opinia/prognoza → `not_verifiable`** na podstawie `fact.m` i daty, nie na podstawie braku dowodów. Naprawia case-30, nie psuje `no_evidence`.

To daje C0/C1: 11–12/24, macro-F1 0,49–0,56.

### 6.2. Pomiar — bez tego nie ma sensownego tuningu

Rozszerzyć raport ewaluacji o:

- `supports`, `refutes`, `context` per claim (liczby i URL-e),
- `primary`, `secondary`, `fact_check` per claim,
- zbiór hostów (niezależność),
- `confidence`, `strength`, `reasoning`,
- `asOf` claimu, `fact.t`, daty publikacji dowodów,
- `caseVerdict` liczony koniunkcyjnie oraz `expected` na poziomie claimu (jeśli dostępne).

Bez tego nie da się odróżnić „brak dowodów” od „dowody są, ale klasyfikator nie nadał relacji” — a to jest różnica między 0,49 i 0,72.

### 6.3. Dowody i retrieval — żeby przekroczyć 0,75 stabilnie

- **Relacje:** poprawić `supports`/`refutes` na istniejącym korpusie dla 05, 09, 22. To najbardziej opłacalna zmiana po stronie dowodów: 3 trafienia bez nowych źródeł.
- **Daty:** normalizować rok z claimu i porównywać z `publishedAt`/faktem (case-11). Bez tego cache będzie utrwalał date-blind `true`.
- **Fetch:** retry + cache dla `sejm.gov.pl` (case-03); obecnie jest wpis w korpusie, ale treść nie została pobrana.
- **Dostępność źródeł:** Wikipedia i Google Fact Check dla 04, 07, 08, 10, 12, 13, 14. Każdy naprawiony przypadek to +1; do 0,75 accuracy wystarczy jeden, do odpornego wyniku — pięć.
- **Fact-check API:** jeśli klucz działa, priorytetyzować dla przypadków spornych (11, 13, 23). To jedyna warstwa, która rozstrzyga „prawda częściowa” bez zgadywania.

### 6.4. Czego nie robić

- **Nie tuningować progu na 24 przypadkach.** R5/R6 pokazują, że reguła „bogaty kontekst → confirmed/false” daje +1/+2 trafienia na próbce, ale jest niestabilna i błędnie rozstrzyga pozostałe bogate konteksty. To overfit, nie poprawa.
- **Nie zamieniać `insufficient_evidence` na `not_verifiable` hurtowo.** To traci 4 poprawne abstencje `no_evidence` i zyskuje 1 (case-30).
- **Nie wymagać primary do każdego `confirmed`.** To psuje case-01 (jedno źródło wtórne) i obniża macro-F1.

---

## 7. Aneks: wszystkie przypadki

| case | kategoria | oczek. | przew. | claimy | dow. | werdykty | główny sygnał / potencjał |
|---|---|---|---|---:|---:|---|---|
| 01 | fact | confirmed | confirmed | 1 | 1 | confirmed | Wikipedia wtórna; soft-confirm działa |
| 02 | fact | confirmed | confirmed | 1 | 9 | confirmed | Wikipedia + korpus; OK |
| 03 | fact | confirmed | insuff | 1 | 8 | insuff | fetch `sejm.gov.pl` padł; bogaty kontekst bez relacji → fetch |
| 04 | fact | false | insuff | 1 | 1 | insuff | Wikipedia down; potrzebne źródło |
| 05 | fact | false | insuff | 1 | 6 | insuff | Wikipedia down; relacja z korpusu (hipoteza) |
| 06 | fact | misleading | confirmed | 2 | 17 | confirmed + insuff | koniunkcja → misleading |
| 07 | context | confirmed | insuff | 1 | 1 | insuff | Wikipedia down; źródło |
| 08 | context | confirmed | insuff | 1 | 1 | insuff | Wikipedia down; źródło |
| 09 | context | false | insuff | 1 | 8 | insuff | bogaty kontekst; relacja `refutes` (hipoteza) |
| 10 | context | false | insuff | 1 | 1 | insuff | kontekst tematyczny; źródło |
| 11 | contradiction | false | confirmed | 1 | 4 | confirmed | zgubiony rok 2004 vs 1999; normalizacja daty |
| 12 | contradiction | false | insuff | 1 | 1 | insuff | Wikipedia down; źródło |
| 13 | contradiction | misleading | insuff | 1 | 1 | insuff | Wikipedia down; źródło + częściowa prawda |
| 14 | contradiction | false | insuff | 1 | 1 | insuff | Wikipedia down; źródło |
| 15 | no_evidence | insuff | insuff | 1 | 1 | insuff | poprawna abstencja |
| 16 | no_evidence | insuff | insuff | 1 | 1 | insuff | poprawna abstencja |
| 17 | no_evidence | insuff | insuff | 2 | 2 | insuff + insuff | poprawna abstencja |
| 18 | no_evidence | insuff | insuff | 1 | 1 | insuff | poprawna abstencja |
| 19 | no_evidence | any | insuff | 1 | 1 | insuff | `any`; OK |
| 20 | injection | confirmed | confirmed | 1 | 1 | confirmed | injection zignorowany; OK |
| 21 | injection | insuff | null | 0 | 0 | — | zero claimów; powinno być insuff |
| 22 | injection | false | insuff | 1 | 8 | insuff | bogaty kontekst; relacja `refutes` (hipoteza) |
| 23 | injection | insuff | false | 1 | 4 | false | pojedynczy refute wtórny; próg refute |
| 24 | url | any | confirmed | 9 | 23 | confirmed + insuff×8 | `any`; OK |
| 25 | url | any | null | 0 | 0 | — | błąd techniczny; `any` |
| 26 | url | any | not_verifiable | 12 | 68 | notver + confirmed×3 + insuff×8 | `any`; OK |
| 27 | empty | any | null | 0 | 0 | — | needs_clarification; `any` |
| 28 | empty | any | null | 0 | 0 | — | needs_clarification; `any` |
| 29 | unverifiable | not_verifiable | not_verifiable | 1 | 3 | not_verifiable | opinia; OK |
| 30 | unverifiable | not_verifiable | insuff | 1 | 1 | insuff | prognoza bez flagi; taksonomia |

---

## 8. Reprodukcja

```bash
bun run scripts/simulate-decision.ts
# lub ze wskazaniem raportu:
bun run scripts/simulate-decision.ts data/eval/report.json
```

Skrypt czyta tylko JSON raportu, nie woła API i niczego nie zapisuje. Sekcja 5 (sufity C1–C4) jest jawnie oznaczona jako analiza potencjału, a nie reguła produkcyjna.
