# PRAWDOWID — plan stabilnego macro-F1 >= 0,75

**Data analizy:** 2026-11-22  
**Zakres:** analiza bez zmian w kodzie. Nie edytowałem kodu ani istniejących plików i nie wykonywałem commita; utworzyłem wyłącznie ten raport.

## Stan faktyczny i odpowiedź o case-06

Ostatni zapisany przebieg (`data/eval/report.json`) ma 18/24, accuracy 0,750 i macro-F1 0,662. Sześć błędów to: `06, 08, 10, 12, 13, 22`. Największą blokadą jest klasa `misleading` (F1 0,000 przy support=2), nie ogólna liczba cytowań.

Potwierdzam: jeżeli obecnie `case-06` zwraca dwa claimy w kolejności `confirmed, false`, **aktualny runner ewaluacji sklasyfikuje przypadek jako `misleading`**. Dokładnie robi to lokalna funkcja `aggregateVerdict()` w `scripts/eval.ts:280–295`:

```ts
if (unique.has("false") && unique.has("confirmed")) return "misleading";
```

Nie jest to reguła „pierwszego claimu”; aktualny kod bierze wszystkie `safe.claims.map(c => c.verdict)`. Notatka w `eval/cases.json` o pierwszym twierdzeniu jest więc nieaktualna względem obecnego runnera.

Zamiana tylko `case-06` z `confirmed` na `misleading` daje przy niezmienionych innych wynika­ch około **19/24, macro-F1 0,810** (F1: confirmed 0,909; false 0,769; misleading 0,667; insufficient 0,706; not_verifiable 1,000). To przekracza 0,75, ale jest za mały margines, by uczciwie nazywać wynik stabilnym.

Istotne zastrzeżenie produktowe: agregacja jest dziś tylko w `scripts/eval.ts`. `verifyInput()` w `src/pipeline/verify.ts` zwraca claimy i `countSummary()`, lecz nie zwraca pola z werdyktem całego materiału. Czyli raport eval będzie poprawny, ale użytkownik nadal zobaczy „1 potwierdzone, 1 fałszywe”, a nie jasno nazwane „zdanie złożone wprowadza w błąd”.

## 1. Pięć zmian o najlepszym stosunku F1/czas

Szacunki są **marginalne i zależne od kolejności** (nie wolno ich sumować bez testu). Odnoszę je do zapisanego baseline 0,662; każdy punkt opiera się na regule możliwej do zastosowania poza 30 przypadkami, a nie na liście `case-id`.

| Priorytet | Plik / funkcja | Reguła do wdrożenia | Czas | Szacowany wpływ |
|---|---|---|---:|---:|
| 1 | `src/pipeline/verify.ts`, po zebraniu `claims`; wspólna funkcja używana też przez `scripts/eval.ts` | Wprowadzić jawny `documentVerdict` oraz tę samą semantyczną agregację w API i runnerze. Dla niezależnych koniunktów: `confirmed + false => misleading`. Dołączyć test regresji z dwoma claimami, w obu kolejnościach. | 0,5–1 h | **+0,148** (case-06; do ~0,810) |
| 2 | `src/research/index.ts:researchOne`, wpięcie istniejącego `src/research/wikipedia-rel.ts` | Wywoływać `relationLookup()` dla claimu z podmiotem i obiektem, przed słabym fallbackiem Wikipedii; dodać wynik tylko, gdy zwróci faktyczny `supports/refutes`. Moduł ma już udokumentowane trafienia dla wyniku wyborów, terminu premiera i relacji wygrana/przegrana. Nie promować automatycznie „pierwsza tura” do `false` — patrz pkt 3. | 1–2 h | **~+0,08–0,23**: pewnie 08/10/12 razem z 06 dają orientacyjnie ~0,891; realnie zależne od sieci i Jev |
| 3 | `src/pipeline/index.ts:MASTERPROMPT` oraz agregator z pkt 1 | W ekstrakcji wymagać osobnego claimu dla **rdzenia** i **kwalifikatora zmieniającego prawdziwość**: „Duda wygrał wybory” oraz „Duda wygrał w I turze”, z tym samym cytatem. Gdy rdzeń ma support, a kwalifikator refute, wynik jest `misleading`, nie `false`. Reguła dotyczy rund, zakresów czasu, liczb, modalności i wyjątków, nie konkretnego nazwiska. | 1–1,5 h | **~+0,076 po pkt 1** (case-13; misleading 1,000 i mniej FP `insufficient`) |
| 4 | `src/research/wikidata.ts:detectSpec/lookupWikidata` albo mały adapter źródła pierwotnego w `src/research/` | Dodać deterministyczne typy **wyniku wyborów i kadencji urzędu**: wynik wyborów / zwycięzca dla edycji z datą oraz okres sprawowania funkcji od–do. Porównanie roku ma odbywać się arytmetycznie z kwalifikatorami, nie przez podobieństwo tekstu. Preferować PKW/KPRM jako dowód, Wikidata jako fallback oznaczony `secondary`. | do 2 h | **~+0,03–0,06** dla 08/10/12, jeśli pkt 2 nie jest użyty; przede wszystkim zwiększa powtarzalność |
| 5 | `src/research/wikidata.ts`, nowa ogólna relacja ontologiczna „is a / instance of” | Obsłużyć twierdzenia klasyfikacyjne typu „X jest państwem”: sprawdzić `P31`/hierarchię klasy i zwracać `refutes` tylko, gdy źródło jawnie klasyfikuje encję do rozłącznej klasy (np. organizacja międzynarodowa / unia polityczno-gospodarcza vs suwerenne państwo). Nie używać słów kluczowych ani wyjątku dla UE. | 1–2 h | **~+0,029 po poprzednich poprawkach** (case-22), plus pokrycie ogólnych błędów kategorialnych |

Najkrótsza ścieżka do wyniku ponad progiem to **1**, potem ponowny pełny eval. Najkrótsza ścieżka do wyniku, który nie zależy od jednego losowego outputu, to **1 + 2 + 3**. Punkt 4 jest alternatywą lub uzupełnieniem dla punktu 2, nie należy na siłę dublować obu ścieżek w ostatniej godzinie.

## 2. Dokładna reguła zdań złożonych

### Najpierw: zakres agregacji

Agregować wolno tylko claimy należące do **jednej wypowiedzi użytkownika / jednego cytatu** i rozpoznane jako logicznie powiązane. Nie należy mieszać niezależnych akapitów artykułu w jeden werdykt. Każdy claim musi zachować `quote`, typ relacji dowodu (`supports/refutes/context`) oraz wskazanie, czy jest rdzeniem czy kwalifikatorem.

### Reguła zalecana

| Zbiór rozstrzygniętych części zdania koniunkcyjnego | Werdykt całego zdania | Uzasadnienie / warunek |
|---|---|---|
| tylko `confirmed` | `confirmed` | Wszystkie sprawdzalne części mają dodatni dowód. |
| `confirmed` + `false` | `misleading` | Zdanie zawiera rzeczywiście prawdziwą część i rzeczywiście fałszywą część; to jest klasyczny częściowo prawdziwy przekaz. Przykład: UE od 2004 + euro. |
| `confirmed` + `insufficient_evidence` | **`insufficient_evidence`** | Sam brak dowodu dla drugiej części nie dowodzi manipulacji. W UI: „część potwierdzona, reszta nierozstrzygnięta”. Obecny runner zwraca tu `misleading`; to ryzyko fałszywie negatywnej etykiety. |
| `false` + `insufficient_evidence` | `false` **tylko** dla asertywnej koniunkcji, gdy część `false` jest bezpośrednio obalona zaufanym dowodem | W zdaniu „A i B” jedno udowodnione fałszywe A czyni całość fałszywą. Jeśli „false” pochodzi wyłącznie z pojedynczego słabego źródła wtórnego lub interpretacji, zachować `insufficient_evidence`. |
| tylko `false` | `false` | Bez dodatnich części i z co najmniej jednym bezpośrednim refute. |
| wewnętrzny `misleading` lub rdzeń support + kwalifikator refute | `misleading` | Np. „wygrał” jest prawdą, „już w I turze” jest fałszem. To nie jest zwykła koniunkcja dwóch niezależnych newsów, lecz częściowo prawdziwa kwalifikacja jednego faktu. |
| tylko `not_verifiable` | `not_verifiable` | Opinia/prognoza bez rozstrzygalnego punktu odniesienia. |
| `not_verifiable` z twierdzeniem faktograficznym | werdykt części faktograficznej + limitation | Opinia nie powinna zamieniać udowodnionego faktu w „niepodlegający weryfikacji”. |
| 0 claimów | status `needs_clarification` / `no_checkable_claim`, **nie** merytoryczny werdykt | W raporcie można mapować do `insufficient_evidence` wyłącznie jako jawnie opisaną konwencję metryczną; nie przedstawiać tego użytkownikowi jako „brak dowodów” dla tezy, której nie wyekstrahowano. |

### Jak nie produkować fałszywych `misleading`

1. `misleading` wymaga **dodatniego dowodu części prawdziwej i ujemnego dowodu części fałszywej** albo wiarygodnej oceny fact-checkera. Nie może wynikać z `confirmed + unknown`.
2. Nie stosować „najgorszego werdyktu” bez struktury logicznej: kilka niezwiązanych claimów w artykule nie jest jedną częściowo fałszywą tezą.
3. Kwalifikator (rok, liczba, „pierwsza tura”, „obecnie”, zakres „cały 2024”) musi być oddzielnym atomem, ale powiązanym z rdzeniem. Tylko wtedy `case-13` jest uczciwie `misleading`, a nie sztucznie `false`.
4. `refutes` z pojedynczego źródła wtórnego pozostaje ostrożny zgodnie z obecną zasadą `decide()`; nie może sam uruchamiać agregacji `misleading`.
5. Zapisuj do raportu claimy i relacje dowodów. Sama lista końcowych claim-verdicts nie pozwala potem sprawdzić, czy „mixed” było uzasadnione.

## 3. Pozostałe misses: co jest deterministyczne

| Case | Diagnoza z ostatniego raportu | Czy naprawialny deterministycznie? | Zalecenie |
|---|---|---|---|
| 08 — Duda wygrał wybory 2020 | `insufficient`, jedno słabe/niepasujące źródło. | **Tak.** To zamknięty wynik wyborów i data. | Najpierw `wikipedia-rel.ts` (ma udokumentowane właściwe zdanie); docelowo adapter PKW/Wikidata z identyfikatorem edycji wyborów i zwycięzcą. |
| 10 — Morawiecki premierem w 2024 | `insufficient`, dowód tematyczny zamiast porównania kadencji. | **Tak.** To sprawdzalny przedział czasu. | Adapter kadencji: urząd + osoba + `from/to`; 2024 poza końcem 2023 daje `refutes`. Obecny Wikidata nie powinien zgadywać z bieżącego `P6`; potrzebny jest termin osoby/urzędu albo KPRM. |
| 12 — Duda przegrał z Trzaskowskim 2020 | `insufficient`, brak relacyjnego odwrócenia zwycięzca/przegrany. | **Tak.** Zamknięty wynik, nie opinia. | Ten sam resolver wyborczy co 08: zwycięstwo Dudy nad Trzaskowskim jest refute dla „przegrał”. Upewnić się, że edycja=2020 jest częścią klucza. |
| 13 — Duda wygrał w pierwszej turze | Dwa claimy `insufficient`; obecny Wikidata celowo zwraca `null` przy wielu turach. | **Tak, ale nie samym post-processingiem.** | Najpierw atomizacja rdzeń/kwalifikator, potem źródło z wynikiem II tury (PKW lub relacyjna Wikipedia). Wynik ma być `misleading`, bo „wygrał” jest prawdą, „w I turze” fałszem. Nie mapować każdego `first round` do `misleading` bez dowodu. |
| 22 — „EU is a country” po injection | Injection został poprawnie zgłoszony, ale rdzeń skończył jako `insufficient`. | **Tak.** To klasyfikacja encji o zamkniętej ontologii. | Ogólny resolver `instance_of` z Wikidata/UE: odrębna klasa organizacji/unii kontra country. Najmniejsza zmiana F1, ale dobry dowód odporności na injection. |

**Co odpuścić w najbliższej godzinie:** nie budować pełnego crawlera PKW/KPRM ani ręcznych wyjątków po nazwach przypadków. Jeśli `relationLookup` nie jest już naprawdę wpięty i testowany, pełny adapter wyborczy jest ryzykiem czasowym; case-22 daje mały marginalny zysk. Najpierw uszczelnić 06 i zmierzyć trzy przebiegi, potem 08/10/12 istniejącym modułem relacyjnym.

## 4. Higiena pomiaru przy niedeterministycznej ekstrakcji

Wynik `0,810` po pojedynczej zmianie w 24 przykładach nie jest jeszcze dowodem stabilności. Ekstrakcja DeepSeek i ocena Jev są losowe/usługowe; dodatkowo cache ewaluacji może zamaskować zmianę pipeline’u.

### Protokół, który warto podać jury

1. **Pin danych i kodu.** Zapisz SHA commita, hash `eval/cases.json`, hash `MASTERPROMPT`, modele/warianty, datę `asOf`, zmienne progów, listę źródeł i ich snapshot/daty pobrania. Zmiana tych elementów oznacza nową serię, nie „ten sam wynik”.
2. **Rozdziel cache ekstrakcji od cache dowodów.** Zapisuj artefakt `case-id -> surowy JSON ekstrakcji -> znormalizowane claimy` z kluczem `hash(input + MASTERPROMPT + model + wersja parsera)`. Wtedy można odtworzyć ocenę research/aggregation dla identycznych claimów. Nie nadpisuj go cachem demonstracyjnym.
3. **Raportuj dwa wyniki.** (a) *frozen-extraction F1*: deterministyczny replay na przypiętym artefakcie; (b) *end-to-end F1*: trzy niezależne cold runy z czystym cachem. To odróżnia jakość decyzji od wariancji extractora.
4. **Nie wybieraj najlepszego przebiegu.** Raportuj co najmniej `medianę [min–max]` macro-F1 z 3 runów, per-klasowe precision/recall/F1 każdego runu, accuracy, abstention, citation coverage/correctness, medianę/p95 latency oraz koszt. Dla n=24 pokaż także liczbę poprawnych przypadków.
5. **Cache kontrolowany.** Cold-run: nowy `EVAL_CACHE_FILE` dla każdego powtórzenia. Warm-run: osobny, wyraźnie podpisany benchmark kosztu/latencji, nigdy liczba F1 mieszana z cachem po poprzedniej wersji kodu.
6. **Zamrożony holdout / changelog.** Po ustaleniu zestawu nie dopisuj heurystyki „case-13”; zapisuj regułę generatywnie (kwalifikator faktu + rdzeń). Gdy dopuszczalny jest nowy zestaw, dodaj holdout o podobnej strukturze, ale innych encjach i datach. Każdy przypadek naprawiany po analizie ma adnotację `development`, nie „ślepy test”.

To nie jest overfit, jeżeli jawnie powiecie: test służył do rozwoju prototypu, reguły są ogólne, dane/snapshoty są wersjonowane, a wynik jest medianą oraz zakresem — nie najlepszym losowym przebiegiem.

## 5. Co jury może zakwestionować i minimalne łaty

Nie znalazłem pliku PDF w katalogu `C:\Users\admin\Documents\GitHub\hackathon` ani pod `C:\Users\admin\Documents\GitHub`; poniższe odnoszę więc do kryteriów zapisanych w `scripts/terra-research.ts` (macro-F1 >=0,75, coverage >=95%, citation correctness >=85%, abstention >=80%, injection >=90%, mediana <=30 s, koszt/100, E2E i spójność kanałów) oraz do materiałów zgłoszeniowych.

| Ryzyko dla jury | Dowód w repo | Najmniejsza uczciwa łata |
|---|---|---|
| **Niespójne publiczne metryki.** `report.json` mówi 0,662/75%, `docs/EVAL.md` 0,315/33,3%, a `docs/SUBMISSION.md` 0,404. | Dokumentacja jest starsza od raportu. | Przed prezentacją zaktualizować jedną tabelę „run manifest” datą, SHA, trybem cold/warm i zakresem 3 runów; usunąć/stemplować stare liczby jako historyczne. Nie pokazywać najwyższej liczby bez manifestu. |
| **„100% citation coverage” nie oznacza citation correctness.** Raport liczy claim jako pokryty, gdy ma jakikolwiek evidence; 46/46 może obejmować `context`. | `scripts/eval.ts:392–397`; w aktualnym raporcie są dowody kontekstowe. | Dodać osobny audyt: próbka + ręczna adnotacja, czy fragment faktycznie wspiera/obala claim, z licznikiem zgodnych cytowań. W UI wyraźnie rozróżnić `supports/refutes/context`. |
| **Brak jednego werdyktu materiału.** Mieszany case-06 jest dobrze agregowany wyłącznie w evaluatorze. | `verify.ts` liczy tylko `countSummary`. | Dodać `documentVerdict` i krótkie wyjaśnienie „część prawdziwa / część fałszywa”; zachować werdykty atomowe i evidence. |
| **Zależność od usług oraz niestabilność.** p95 w raporcie to 80,291 ms, mimo mediany 11,784 ms; URL-e sięgają ~98 s, jeden URL ma `error`. | `data/eval/report.json`. | Na demo użyć krótkich inputów i pokazać timeout/fallback jako `error`, nie jako werdykt; pokazać osobno medianę i p95. Nie obiecywać „kilkanaście sekund” dla URL każdego rozmiaru. |
| **Siła źródeł.** Wikipedia/Wikidata są wartościowe jako fallback, ale nie powinny być jedynym dowodem politycznie doniosłego werdyktu. | `research/index.ts` dopuszcza pojedyncze secondary do `confirmed`; dokumentacja wskazuje 1164 dokumenty rządowe, ale nie pokazuje ich skuteczności per claim. | Oznaczyć typ i siłę dowodu w UI, dla wyborów/kadencji pokazać PKW/KPRM jako primary, a Wikipedia jako secondary. Nie podnosić confidence tylko dlatego, że URL istnieje. |
| **Obietnice produktu wyprzedzają demonstrację.** Submission opisuje pętlę moderatora, kanały i multimodalność; E2E może pokazać kontrakt, ale jury będzie pytać o faktyczne działanie. | `docs/SUBMISSION.md`, `docs/DEMO.md`. | Demo w 3 min ograniczyć do udowodnionych ścieżek: dowód, fałsz, abstencja, injection, cache; „OCR/Discord/moderacja” pokazać tylko z właściwym badge `experimental`/`recommended`, bez sugerowania pełnej eskalacji. |

## 6. Jednoznaczny plan na najbliższe 60 minut

1. **0–10 min:** nie zmieniać prompty ani źródeł. Uruchomić kontrolny pełny eval z nową nazwą cache/reportu i potwierdzić, że `case-06` ma claim-verdicts `confirmed,false`, a case-level `predicted=misleading`. Jeśli nie — problem jest w aktualnym kodzie uruchamianym przez eval albo w cache, nie w teorii agregacji.
2. **10–30 min:** doprowadzić do wspólnego agregatora dla runnera i odpowiedzi API oraz dodać minimalne testy tabeli: `C+F`, `C+I`, `F+I`, zero claimów oraz odwrócona kolejność. Priorytet semantyczny: `C+F => misleading`; nie reklamować `C+I => misleading` jako pewności.
3. **30–50 min:** wpiąć już istniejący `wikipedia-rel.ts` jako kontrolowany fallback/źródło relacyjne, z globalnym limitem/timeoutem i zachowaniem `relation` w artefakcie. Najpierw sprawdzić 08, 10 i 12, nie całą ewaluację po każdej drobnej zmianie.
4. **50–60 min:** uruchomić trzy cold runy na przypiętym `asOf`, z osobnym cachem i zapisać manifest. Do slajdu podać medianę i zakres, nie maksimum; jeśli mediana nie jest >=0,75, nie deklarować spełnienia progu.

**Decyzja:** nie budować dziś ręcznych wpisów dla `case-08/10/12/13/22` ani nie modyfikować oczekiwań testu. Najpierw zabezpieczyć ogólną agregację case-06 i dowieźć powtarzalny pomiar; następnie wykorzystać gotowy, ogólny resolver relacyjny dla faktów historycznych. To daje największy zysk F1 na godzinę bez udawania, że brak dowodu jest werdyktem.
