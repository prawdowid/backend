# Wikidata jako deterministyczne źródło faktów

Prototyp: `src/research/wikidata.ts`. Bez nowych zależności (`fetch` + istniejący typ `ClaimInput`).
Nie podłączony do rdzenia — raport opisuje punkt integracji.

## 1. Po co Wikidata

Obecny research potrafi potwierdzać (Wikipedia, Google Fact Check), ale **nie ma źródła, które wprost obala** twierdzenie. Dlatego recall klasy `false` w `eval/cases.json` wynosi 0, a macro-F1 utyka na ~0,31 (`docs/EVAL.md`).

Wikidata daje dokładnie jedną wartość dla pary encja + property. To zamienia weryfikację w porównanie:

```
claim (s, p, o)  ->  QID podmiotu + Pxxx predykatu  ->  wartość w Wikidata
                                                  ->  supports / refutes / null
```

Zasada: **brak jednoznaczności = `null`**, nigdy zgadywanie. Dlatego predykat nieznany, encja niejednoznaczna albo brak property kończą się `null`, a nie fałszywym werdyktem.

## 2. API i przepływ

1. `wbsearchentities` (`language=pl`, fallback `en`) dla podmiotu i obiektu.
2. Filtrowanie kandydatów po etykiecie/aliasach (całe tokeny, nie substring — `euro` nie może złapać `Europa`).
3. `wbgetentities` (batch, `props=claims|labels|aliases`) dla maks. 5 kandydatów po każdej stronie.
4. Wybór strony, która faktycznie ma property:
   - najpierw podmiot (kierunek prosty),
   - jeśli podmiot nie ma property — obiekt (kierunek odwrotny, np. „Duda wygrał wybory” → `P991` na encji wyborów),
   - przy kilku kandydatach: exact label → przecięcie wartości z drugą stroną → `null`.
5. Porównanie wartości: encje (QID), liczby (z jednostkami i tolerancją), daty (z dokładnością podaną w claimie).
6. Daty członkostwa/urzędu z kwalifikatorów `P580`/`P582`, a nie z roku w opisie.

Cache w pamięci (search + entities) i serializacja requestów (900 ms). Przy `429` honorowany jest `Retry-After` — w praktyce publiczne API potrafi zwrócić 39–44 s.

## 3. Mapowanie predykatów

Predykat z ekstrakcji to krótki angielski `snake_case` (`pipeline/index.ts`, MASTERPROMPT). Mapowanie jest **słownikowe i deterministyczne** — bez drugiego wywołania LLM:

| Predykat (przykłady) | Property | Typ | Kierunek | Status |
|---|---|---|---|---|
| `capital`, `is_capital_of`, `stolica` | P36 | encja, tylko aktualna | auto (przód/tył) | ✅ przetestowane |
| `member_of`, `joined`, `accession`, `przystąpił` | P463 | encja + `P580` | przód | ✅ |
| `currency`, `adopted_currency`, `uses_currency` | P38 | encja + klasa Q8142 | przód | ✅ |
| `number_of_seats`, `count` + „posłowie/sejm” | P1342 | liczba (tolerancja 0) | przód | ✅ |
| `length`, „km”, „długość” | P2043 | liczba + jednostki | przód | ✅ |
| `won`, `winner`, `wygrał` | P991 | encja | auto (typowo tył) | ✅ |
| `head_of_state`, `prezydent` | P35 | encja | przód | ⚠️ tylko bieżące |
| `head_of_government`, `premier` | P6 | encja | przód | ⚠️ tylko bieżące |
| `official_language` | P37 | encja | przód | ⚠️ nietestowane |
| `inception`, `founded` | P571 | data | przód | ⚠️ wiele wartości → `null` |
| `date`, `occurred` | P585 | data | przód | ⚠️ nietestowane |
| `area` | P2046 | liczba | przód | ⚠️ nietestowane |

Dla predykatów ogólnych (`count`, `has`, `liczba`, `jest`) decyduje **jednoznaczne** dopasowanie słów z treści claimu (np. „posłowie” → P1342, „kilometrów” → P2043). Jeśli wskazówek jest więcej niż jedna — `null`.

### LLM czy słownik?

Słownik wygrywa: jest darmowy, powtarzalny i audytowalny. LLM przydałby się tylko do normalizacji nietypowych predykatów na **zamkniętą listę** property (np. „zasiada w” → `P463`), ale wtedy trzeba by nadal weryfikować, że property istnieje na encji. Rekomendacja: słownik + ewentualny LLM jako *fallback z progiem pewności*, nigdy jako jedyne źródło mapowania.

## 4. Wyniki na `eval/cases.json`

Testy na 12 przypadkach faktograficznych + 2 kontrolnych (negacja, wariant bez daty). Claimy podano w postaci, jaką produkuje ekstrakcja (s/p/o), więc test nie zależy od niedeterminizmu LLM.

| # | Claim (s, p, o) | QID bazy | Property | Wartość źródła | Oczekiwany werdykt | Wynik | ✔ |
|---|---|---|---|---|---|---|---|
| 1 | Warszawa, `is_capital_of`, Polska | Q36 | P36 | Warszawa (Q270) | confirmed | supports | ✅ |
| 2 | Polska, `capital`, Warszawa | Q36 | P36 | Warszawa (Q270) | confirmed | supports | ✅ |
| 3 | Polska, `capital`, Kraków | Q36 | P36 | Warszawa (Q270) | false | refutes | ✅ |
| 4 | Polska, `joined`, Unia Europejska, 2004-05-01 | Q36 | P463 | Unia Europejska (Q458), od 2004-05-01 | confirmed | supports | ✅ |
| 5 | Polska, `joined`, NATO, 2004 | Q36 | P463 | NATO (Q7184), od 1999-03-12 | false | refutes | ✅ |
| 6 | Polska, `adopted_currency`, euro, 2010 | Q36 | P38 | złoty (Q123213) | false | refutes | ✅ |
| 7 | Polska, `member_of`, strefa euro | Q36 | P463 | brak (członkostwo) | false | refutes | ✅ |
| 8 | Sejm Rzeczypospolitej Polskiej, `number_of_seats`, 460 | Q98964 | P1342 | 460 | confirmed | supports | ✅ |
| 9 | Sejm Rzeczypospolitej Polskiej, `number_of_seats`, 465 | Q98964 | P1342 | 460 | false | refutes | ✅ |
| 10 | Andrzej Duda, `won`, wybory prezydenckie 2020 | Q30632774 (wybory) | P991 | Andrzej Duda (Q9151911) | confirmed | supports | ✅ |
| 11 | Wisła, `length`, 2047 km | Q548 | P2043 | 1047 km | false | refutes | ✅ |
| 12 | Wisła, `length`, 1047 km | Q548 | P2043 | 1047 km | confirmed | supports | ✅ |
| + | Polska, `uses_currency`, euro | Q36 | P38 | złoty (Q123213) | false | refutes | ✅ |
| + | Polska, `member_of`, Unia Europejska, `neg: true` | Q36 | P463 | Unia Europejska (Q458) | false | refutes | ✅ |

**Wynik: 12/12 przypadków głównych, 14/14 łącznie.** Wszystkie werdykty są deterministyczne w obrębie jednego przebiegu (cache powoduje, że powtórka jest natychmiastowa).

Uwagi zaobserwowane w testach:

- dla „Wisły” wyszukiwanie zwraca też miasto, imię, obraz i miesięcznik — wybór działa, bo tylko rzeka ma `P2043`;
- dla „Polski” alias „Polska” ma też „Korona Królestwa Polskiego” — exact label wybiera Q36;
- dla „euro” wyszukiwanie zwraca walutę i symbol waluty — filtr `P31 = Q8142` wybiera Q4916;
- dla Dudy wybory to `P991` na encji wyborów (kierunek odwrotny), a nie property na osobie.

## 5. Ryzyka i ograniczenia

| Ryzyko | Wpływ | Mitygacja w prototypie |
|---|---|---|
| Niekompletność Wikidata | fałszywy `refutes` przy braku wartości | `refuteOnAbsence` tylko dla zbiorów zamkniętych (P36/P38/P463); confidence 0,76 |
| Zmienność faktów politycznych | „premier obecnie” może się zdezaktualizować | `P580/P582`, `currentOnly`; bez daty historyczne P35/P6 → `null` |
| Jednostki | 1047 km vs 1047 000 m | mapa jednostek (`km`, `m`, `cm`, `km²`, `mile`); **nieznana jednostka = ryzyko** |
| Fleksja polska | `wbsearchentities` nie znajduje „Unii Europejskiej” | ekstrakcja ma dawać mianownik; brak lematyzatora → `null` |
| Wielojęzyczność / aliasy | różne etykiety, duplikaty | `pl` → `en`, exact label > alias > opis |
| Niejednoznaczne encje | zły QID | property + exact label + `P31` + opis; inaczej `null` |
| Klaimy złożone | jeden claim „UE od 2004 i euro” | lookup jest per claim; potrzebna agregacja (mixed → misleading) |
| Limity API | 429 i opóźnienia | cache, serializacja, `Retry-After`; produkcyjnie SPARQL/batch + cache trwały |
| Źródło wtórne | nie jest źródłem pierwotnym | `Evidence.type = "secondary"`, limitation w raporcie |

Dodatkowo: `P571` (inception) bywa wielowartościowe (Polska ma 10 dat). Prototyp zwraca wtedy `null` — to celowe.

## 6. Szacowany wpływ na F1

Na 24 ocenianych przypadkach (`any` wyłączone) prototyp daje rozstrzygnięcie dla **10**:

- confirmed: 1, 2, 3, 8, 20 (5/6) — część z nich baseline już potwierdzał;
- false: 4, 5, 9, 11, 14 (5/8) — **to jest cały zysk**, bo recall `false` jest dziś zerowy.

Konserwatywne założenie: pozostałe predykcje bez zmian, a 5 nowych trafień w `false` + Sejm (o ile wcześniej był `insufficient`) daje accuracy ~14/24 = 58%. Macro-F1 szacuję na **~0,52–0,60** (z 0,31). To nie jest jeszcze 0,75, bo brakuje pokrycia dla przypadków 7, 10, 12, 13 i 22.

Dalsze kroki, które domykają cel:

1. **P39 (position held) z kwalifikatorami `P580/P582`** — historyczni prezydenci/premierzy (7, 10). Osobne mapowanie: „prezydent Polski w 2014” → urząd QID + zakres dat.
2. **P31 (instance of) dla „X jest krajem”** (22) — sprawdzenie typu encji zamiast obecności wartości.
3. **Agregacja claimów złożonych** — jeśli części dają `supports` i `refutes`, werdykt całego zdania to `misleading` (6). To poprawia też case-13, jeśli dojdzie wykrywanie „pierwszej tury”.
4. **Lematyzacja podmiotu/obiektu** — fallback przez Wikipedia API (`list=search` → `pageprops.wikibase_item`) dla form odmienionych.

Po dodaniu 1–3 pokrycie rośnie do ~14–15/24, w tym 7–8/8 przypadków `false`, a szacowany macro-F1 to **~0,72–0,78** — czyli cel ≥0,75 jest osiągalny, ale Wikidata **sama** go nie gwarantuje.

## 7. Integracja (bez zmian w rdzeniu)

`wikidataEvidence(claim, retrievedAt)` zwraca gotowy `Evidence` (`type: "secondary"`, `relation: supports|refutes`) albo `null`. Sugerowane miejsce wywołania w `researchOne`:

- po fakt-checkach, przed fallbackiem Wikipedii;
- tylko gdy `!ctx.offline` i claim ma `fact`;
- dodać limitation „Wykorzystano źródło wtórne (Wikidata).”;
- dla werdyktu `refutes` obowiązuje istniejąca ścieżka `decide()` (refutes bez supports → `false`, confidence 0,6–0,8). Warto obniżyć confidence pojedynczego refute do ~0,75, żeby nie przeceniać źródła wtórnego.

Przykład użycia:

```ts
import { lookupWikidata, wikidataEvidence } from "./wikidata";

const result = await lookupWikidata(claim);
if (result?.relation === "refutes") {
    // np. "Polska przyjęła euro" -> źródło: złoty (Q123213)
    console.log(result.value, result.url, result.confidence);
}

const evidence = await wikidataEvidence(claim, new Date().toISOString());
```

Reprodukcja testów: harness tymczasowy (`bun run`) importuje moduł przez ścieżkę bezwzględną; tabela z sekcji 4 zawiera pełny zestaw claimów. `WIKIDATA_DEBUG=1` włącza logi wyboru encji i property.
