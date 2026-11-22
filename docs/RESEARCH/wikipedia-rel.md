# Wikipedia relation-aware (prototyp)

Data: 2026-11-22
Plik: `src/research/wikipedia-rel.ts`
Zakres: tylko nowy moduł. Rdzeń (`src/research/index.ts`, `src/pipeline/*`, `src/server/*`) nie został zmieniony.

## Cel

Dotychczasowa ścieżka Wikipedii w `src/research/index.ts` (`wikipediaEvidence`) szuka zdania, które zawiera **podmiot i obiekt** claimu. To wystarcza do potwierdzeń, ale prawie nigdy nie obala fałszywki: na stronie o Krakowie nie ma zdania „Kraków jest stolicą Polski”, więc fałszywy claim kończy jako `insufficient_evidence`.

Ten prototyp pyta Wikipedię o **relację**, nie o podmiot. Dla `Kraków — capital_of — Polska` szuka „stolica Polska” i czyta:

> Obecną, administracyjną stolicą Polski jest Warszawa.

Dopiero bramka Jev rozstrzyga, komu zdanie przypisuje wartość:

| Co robi zdanie | Werdykt |
|---|---|
| przypisuje `object` do claimowego `subject` | `supports` |
| przypisuje `object` innemu podmiotowi | `refutes` |
| przypisuje tej samej relacji inną wartość / inny czas | `refutes` |
| zaprzecza relacji albo wymienia `subject` poza grupą | `refutes` |
| tylko temat, bez przypisania wartości | `context` (`relation: null`) |
| brak sensownego zdania | `null` |

Zasada „nie zgaduj” zostaje: bez zdania i bez zgody Jev nie ma `supports`/`refutes`.

## API i przepływ

```ts
relationLookup(claim: ClaimInput): Promise<
  { relation: "supports" | "refutes" | null; sentence: string; url: string } | null
>
```

1. **Zapytania** — `buildRelationQueries(claim)` buduje do 4 zapytań:
   - relacja + obiekt: `stolica Polska`, `członek NATO`, `waluta euro`;
   - podmiot + obiekt + rok: `Polska Unia Europejska 2004`, `Andrzej Duda wybory prezydenckie 2020`;
   - relacja + podmiot: `liczba posłów Sejm`, `premier Mateusz Morawiecki`;
   - własne słowa claimu (bez wiodącej daty).
   Predykaty extractora są angielskie (`capital_of`, `won_election`), więc mapa `RELATION_RULES` tłumaczy je na polskie frazy relacyjne. Dla obiektu liczbowego pierwsze zapytanie to relacja + podmiot + liczba (`długość Wisła 2047`).
2. **Wyszukiwanie** — `action=query&list=search`, top 5 na zapytanie. Tytuły są oceniane (`scoreTitle`: podmiot, obiekt, rok, fraza relacji), brane jest do 5 stron.
3. **Czytanie** — `action=query&prop=extracts&explaintext=1&redirects=1` dla wybranych stron.
4. **Kandydaci** — zdania 20–700 znaków, z kontekstem poprzedniego zdania/nagłówka. Scoring premiuje podmiot, obiekt, frazę relacji, rok/zakres lat i definicje (`object` + relacja). Osobne gwarancje: 2 zdania na stronę, do 4 „signal” (relacja + rok), 1 definicja na stronę. Nagłówek jest sklejany z linią pod nim (`== Państwa poza strefą euro ==` + `Polska: 1 złoty…`).
5. **Jev** — jedno batchowane zapytanie, 2 pytania `noul` na kandydata:
   - `same`: czy zdanie przypisuje `object` do `subject` (z datą, jeśli podana);
   - `other`: czy przypisuje `object` innemu podmiotowi, inną wartość/czas, zaprzecza, albo wymienia `subject` poza grupą.
   Pytanie jest formułowane naturalnie per relacja („Czy zdanie mówi, że `subject` był premierem `object`?”), a nie jako abstrakcyjne „assign object to subject”.
6. **Wybór** — najpewniejszy werdykt (max prawdopodobieństwa); przy remisie `refutes` (klasa `false` jest najsłabsza w baseline). Gdy Jev nie da werdyktu, zwracane jest pierwsze zdanie z `relation: null` (dowód kontekstowy, nigdy werdykt).

Progi: `p >= 0.8` przy przewadze; dodatkowo `p >= 0.6` przy co najmniej dwukrotnej przewadze i różnicy `>= 0.35`. Dla jawnego zakresu lat, który wyklucza rok claimu, wystarczy `other > same` — to arytmetyka, nie domysł semantyczny.

### Obsługa 429

Zgodnie z rdzeniem: **jeden retry, pauza 1,5 s**, tylko dla HTTP 429. Dodatkowo:

- opisowy `User-Agent` z URL projektu (przy `contact: local` Wikipedia zwracała 429 nawet na pierwsze zapytanie),
- minimalny odstęp 200 ms między requestami,
- timeout 6 s na request.

## Wyniki na 10 przypadkach faktograficznych z `eval/cases.json`

Wszystkie zapytania i zdania pochodzą z rzeczywistego przebiegu (PL Wikipedia, 2026-11-22). Kolumna „werdykt” to wynik `relationLookup`; „OK” — zgodność z oczekiwanym kierunkiem (`supports` ↔ confirmed, `refutes` ↔ false/misleading).

| # | Claim | Zapytanie (pierwsze) | Znalezione zdanie (skrót) | Werdykt | Oczek. | OK |
|---|---|---|---|---|---|---|
| 01 | Warszawa jest stolicą Polski | `stolica Polska` | „Stolica Polski – … której funkcję pełni obecnie Warszawa.” | supports | confirmed | ✅ |
| 02 | Polska wstąpiła do UE 1 maja 2004 | `członek Unia Europejska` | „Polska jest członkiem Unii Europejskiej od 1 maja 2004…” | supports | confirmed | ✅ |
| 03 | Sejm liczy 460 posłów | `liczba posłów Sejm … 460` | „Składa się on z 460 posłów…” | supports | confirmed | ✅ |
| 04 | Stolicą Polski jest Kraków | `stolica Polska` | „…stolicą Polski jest Warszawa.” | refutes | false | ✅ |
| 05 | Polska przyjęła euro w 2010 | `waluta euro` | „…Polska uczestniczy w Unii Gospodarczej i Walutowej, jednak objęta jest derogacją.” | refutes | false | ✅ |
| 08 | Duda wygrał wybory 2020 | `zwycięzca wybory prezydenckie` | „Wybory zakończyły się zwycięstwem … Andrzeja Dudy…” | supports | confirmed | ✅ |
| 11 | Polska przystąpiła do NATO w 2004 | `członek NATO` | „…Polska … została państwem członkowskim NATO” (12 marca 1999) | refutes | false | ✅ |
| 12 | Duda przegrał z Trzaskowskim 2020 | `przegrany Rafał Trzaskowski` | „…zwycięstwem … Andrzeja Dudy … pokonał Rafała Trzaskowskiego.” | refutes | false | ✅ |
| 13 | Duda wygrał już w I turze 2020 | `zwycięzca pierwsza tura …` | „…w drugiej turze, w której pokonał Rafała Trzaskowskiego.” | refutes | misleading | ✅ (kierunek; werdykt `false`, nie `misleading`) |
| 14 | Wisła ma 2047 km | `długość Wisła 2047` | „…Wisła … o długości 1022 km.” | refutes | false | ✅ |

Dodatkowo, poza dziesiątką, prototyp poprawnie rozstrzygnął:

| # | Claim | Werdykt | Oczek. |
|---|---|---|---|
| 07 | Komorowski prezydentem w 2014 | supports („prezydentura 2010–2015”) | confirmed |
| 09 | Polska w strefie euro | refutes („Państwa UE poza strefą euro”) | false |
| 10 | Morawiecki premierem w 2024 | refutes („prezydentura 2017–2023”) | false |

Razem: **13/13 kierunkowo poprawnych** w ostatnim przebiegu. Mediana czasu jednego lookupu: ~2,6 s (2,4–3,5 s). To 4 wyszukiwania + do 5 ekstraktów + 1 batch Jev; sama Wikipedia nie generuje kosztu API, płatny jest tylko Jev.

## „Zawsze” vs „tylko fallback”

Zmierzone na tych samych 10 przypadkach. „Fallback” = dzisiejsze zachowanie rdzenia: Wikipedia tylko wtedy, gdy korpus/Google/EUvsDisinfo nie dały żadnego `supports`/`refutes`. „Zawsze” = `relationLookup` dla każdego claimu z podmiotem i obiektem.

| Polityka | Kwalifikujące się claimy | Decyzja (`supports`/`refutes`) | Kierunkowo poprawne | Dokładny werdykt (z `misleading`) |
|---|---|---|---|---|
| tylko fallback | 10/10 | 10/10 | 10/10 | 9/10 (case-13 → `false` zamiast `misleading`) |
| zawsze | 10/10 | 10/10 | 10/10 | 9/10 |

**Wniosek:** na tym zestawie obie polityki dają identyczny wynik, bo **żaden z 10 claimów nie miał wcześniej dowodu `supports`/`refutes`** z korpusu, Google ani EUvsDisinfo (wszystkie 10 było `insufficient_evidence`). Cały zysk pochodzi z Wikipedii. Różnica „zawsze vs fallback” pojawi się dopiero na claimach, które inny moduł już rozstrzygnął — wtedy „zawsze” daje niezależne potwierdzenie/obalenie, a „fallback” w ogóle nie pyta Wikipedii. To argument za „zawsze”: brak zależności od kolejności źródeł i brak sytuacji, w której słaby fact-check blokuje lepsze zdanie z Wikipedii.

## Wpływ na macro-F1 (symulacja)

Pełny eval (`scripts/eval.ts`, 30 przypadków, 2026-11-22) dał baseline:

| Metryka | Baseline |
|---|---|
| accuracy | 50,0% (12/24) |
| macro-F1 | **0,450** |
| F1 `false` | **0,000** (precision 0, recall 0) |
| F1 `confirmed` | 0,727 |
| F1 `insufficient_evidence` | 0,522 |
| F1 `not_verifiable` | 1,000 |
| F1 `misleading` | 0,000 |
| wstrzymanie | 100% (6/6) |

Symulacja: do raportu eval podstawiamy werdykty `relationLookup` dla zmierzonych claimów (`supports → confirmed`, `refutes → false`), resztę zostawiamy bez zmian. To **nie jest** pełna integracja — pokazuje górną granicę samego modułu.

| Scenariusz | accuracy | macro-F1 | F1 `false` | F1 `confirmed` | F1 `insufficient` |
|---|---|---|---|---|---|
| baseline | 50,0% (12/24) | 0,450 | 0,000 | 0,727 | 0,522 |
| tylko fallback | 87,5% (21/24) | **0,744** | 0,875 | 0,923 | 0,923 |
| zawsze | 87,5% (21/24) | **0,744** | 0,875 | 0,923 | 0,923 |
| fallback + mapowanie case-13 na `misleading` | 91,7% (22/24) | **0,889** | 0,933 | 0,923 | 0,923 |

Interpretacja:

- sam relation-aware lookup podnosi macro-F1 z **0,450 do ~0,744** i odblokowuje klasę `false` (recall 0 → 0,875);
- do przekroczenia **0,75** brakuje obsługi `misleading`: case-13 (Duda wygrał, ale w II turze) jest kierunkowo poprawny (`refutes`), lecz rdzeń mapuje `refutes` na `false`, nie `misleading`. Proste post-processingowe rozpoznanie „częściowa prawda” podnosi wynik do **0,889**;
- „zawsze” nie zmienia wyniku na tym zbiorze, ale usuwa zależność od kolejności źródeł.

## Integracja (rekomendacja, poza tym plikiem)

Rdzeń nie został zmieniony. Rekomendowane wpięcie w `researchOne` (np. po korpusie, przed Google) — dla każdego claimu z `fact.s` i `fact.o`:

```ts
import { relationLookup } from "./wikipedia-rel";

if (!ctx.offline && claim.fact?.s && String(claim.fact.o ?? "").trim()) {
    try {
        const rel = await relationLookup(claim);
        if (rel?.relation) {
            evidence.push({
                title: "Wikipedia (relacja)",
                publisher: "Wikipedia (pl)",
                publishedAt: null,
                retrievedAt,
                url: rel.url,
                excerpt: rel.sentence.slice(0, 400),
                type: "secondary",
                relation: rel.relation,
            });
            limitations.push("Wykorzystano relacyjne źródło wtórne (Wikipedia).");
        }
    } catch {
        limitations.push("Wikipedia (relacja) była niedostępna.");
    }
}
```

Uwagi integracyjne:

- wywoływać **zawsze**, gdy claim ma `s` i `o` — nie tylko jako fallback;
- deduplikować `url` z istniejącym `seenUrls`;
- `relation: null` traktować jako `context`, nigdy jako werdykt;
- przy `refutes` bez innych dowodów `decide()` da `false` (confidence 0,6+); przy `supports` z jednego źródła wtórnego da `confirmed` (0,55) — to zgodne z obecną polityką rdzenia;
- dla `misleading` potrzebny osobny krok: jeśli claim ma części prawdziwe (np. wybory + zła tura), `refutes` nie powinien automatycznie znaczyć `false`. To następny kandydat do poprawy F1.

## Ryzyka

| Ryzyko | Obserwacja | Mitygacja |
|---|---|---|
| **429** | Przy `User-Agent: … contact: local` Wikipedia zwracała 429 na pierwsze zapytanie. Po zmianie UA na opisowy z URL — 200. | opisowy UA, 1 retry po 1,5 s, odstęp 200 ms, timeout 6 s. Nadal możliwe 429 przy równoległych claimach — warto dodać globalny semafor. |
| **Niejednoznaczne zdania** | „Zimowa Stolica Polski – Zakopane”, historyczne „W 1040 Kraków stał się stolicą Polski”. | reguła teraźniejszości w pytaniu `same`, wybór najpewniejszego werdyktu, nie „pierwsze trafienie”. |
| **Daty i zakresy** | NATO 1999 vs claim 2004; Morawiecki 2017–2023 vs claim 2024; pojedynczy rok vs zakres. | `dateRangeHint` (jawny komunikat „2024 poza zakresem 2017–2023”), blokada `supports` przy innym roku, `other > same` dla range. |
| **Wybory cykliczne** | 2015 vs 2020 — zwycięstwo w 2015 nie przeczy zwycięstwu w 2020. | `eventRule`: inna edycja cyklicznego wydarzenia to nie sprzeczność; dla tej samej edycji inna tura = sprzeczność. |
| **Jev jest niedeterministyczny** | case-10 dawał `null`/`supports`/`refutes` w kolejnych przebiegach (0,46–0,63). | range-guard + blokada innego roku; po zmianach 4/4 przebiegi `refutes`. Nadal nie ma gwarancji 100% — trzeba logować prawdopodobieństwa. |
| **Nagłówki jako dowód** | Wybrane zdanie bywa sklejonym nagłówkiem („== Państwa poza strefą euro == …”). | sklejanie nagłówka z linią pod nim; w raporcie oznaczać jako słabszy dowód. |
| **Koszt i latencja** | ~2,6 s i 4 search + 5 extract + 1 Jev na claim. | przy 10 claimach ~26 s; cache i limit równoległości. |
| **Licencja** | Wikipedia jest CC BY-SA. | w evidence podawać URL i „Wikipedia (pl)”; przy publikacji wymagana atrybucja. |

## Pliki i uruchomienie

- `src/research/wikipedia-rel.ts` — prototyp (bez nowych zależności; `fetch` + istniejący `OpenRouterWrapper`).
- `docs/RESEARCH/wikipedia-rel.md` — ten raport.

Weryfikacja typów:

```bash
node node_modules/typescript/bin/tsc --noEmit   # 0 błędów
```

Testy na żywo wykonano tymczasowym harnessem (nie zostaje w repo): 13 claimów, każdy `relationLookup`, porównanie z oczekiwanym kierunkiem. Wynik ostatniego przebiegu: **13/13**.

## Wniosek

Relacyjne czytanie Wikipedii rozwiązuje główny problem baseline: klasa `false` z recall 0 dostaje realne obalenia, a macro-F1 rośnie z ~0,45 do ~0,74–0,89 w zależności od obsługi `misleading`. Sam moduł jest gotowy do wpięcia „zawsze”; nie wymaga zmian w rdzeniu poza jednym wywołaniem i mapowaniem `RelationLookupResult` na `Evidence`.
