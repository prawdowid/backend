# Źródła fact-checkingowe, dezinformacyjne i rządowe — research

Data: 2026-11-22
Zakres: publiczne, legalne API/RSS/JSON-LD/SPARQL. Bez scrapowania paywalli, bez omijania
zabezpieczeń, bez commitów. Probe: `scripts/probe-factcheck-sources.ts`.
Wniosek numer jeden jest niewygodny: **źródła fact-checkingowe prawie nie pokrywają klasy
`false` z naszego eval** (stolica, euro, NATO, długość Wisły). Ich miejsce to twierdzenia
publiczne, cytaty polityków i narracje dezinformacyjne — nie elementarne fakty.

---

## 1. TL;DR

1. **Google Fact Check Tools API** działa i jest już wpięte (`src/modules/google.ts`), ale dla
   7 „prostych fałszów” z eval dało **1/7 tematycznie i 0/7 tej samej tezy**. To nie jest
   źródło recallu dla `false`.
2. **Demagog** ma publiczne wyszukiwanie (`/wp-json/wp/v2/search`) i **ClaimReview JSON-LD**
   na stronach `/wypowiedzi/`. To najlepsze polskie źródło fact-checkingowe bez tokenu.
   Ale wyszukiwarka znajduje strony o *zbliżonym temacie*, nie o tej samej tezie — musi
   działać bramka Jev.
3. **EUvsDisinfo** nie ma publicznego search/API. Strona główna i sitemap zwracają 403,
   `wp-json` wymaga auth, a `robots.txt` jawnie zabrania `?s=` i `/feed/`. Zostaje MCP z
   tokenem + lokalny snapshot, który już mamy.
4. **Wikidata SPARQL** (CC0, bez klucza) odpowiada deterministycznie na 4/7 fałszów z eval
   (stolica, waluta, premier, data wstąpienia do NATO). To jest realna dźwignia recallu,
   nie fact-checki.
5. **Źródła rządowe** (IMGW, CERT, GIOŚ, gov.pl) nadają się do **alertów i bieżących zdarzeń**
   („czy jest komunikat o X?”), a nie do faktów ogólnych. Nie rozstrzygną stolicy ani długości rzeki.
6. Rekomendacja: **Demagog ClaimReview** + **Wikidata (reguły faktów)** jako dwa pierwsze
   wdrożenia. Google Fact Check zostaje jako uzupełnienie z krótszymi zapytaniami.

---

## 2. Metoda i zastrzeżenia

- Sprawdzałem realnym `GET`-em z UA `PrawdowidBot/1.0`, z limitem czasu 15–40 s. Statusy
  i rozmiary w tabelach są **zmierzone**, nie przepisane z dokumentacji.
- Część domen rządowych miała chwilowe problemy DNS w tym środowisku (`odyseusz.gov.pl`,
  `monitoring.paa.gov.pl`, `api.gios.gov.pl`, `fullfact.org`). Tam, gdzie to możliwe,
  ponawiałem; wynik „ERR” oznacza problem sieciowy, nie brak endpointu.
- Nie pobierałem pełnych artykułów do repo. Probe czyta tylko metadane/JSON-LD i robi to
  jednorazowo, z małym limitem.
- Licencje: dla prasy i fact-checkerów **cytat oceny + metadane + link**, bez redystrybucji
  całości. Zgodnie z `docs/SOURCES.md`.

---

## 3. Macierz źródeł fact-checkingowych

| Źródło | Publiczny endpoint | Auth | Format | Limity / uwagi | Licencja | Przydatność PL |
|---|---|---|---|---|---|---|
| **Google Fact Check Tools** | `GET https://factchecktools.googleapis.com/v1alpha1/claims:search?query=...&languageCode=pl&key=...` | API key | JSON (`claims[].claimReview[]`) | Darmowe w standardowym quota projektu; `pageSize` 1–100; `reviewPublisherSiteFilter`, `maxAgeDays`, `pageToken` | Google APIs ToS + prawa wydawców; cytat + link | Średnia; tylko to, co wydawcy oznaczyli ClaimReview |
| **Demagog** | `GET https://demagog.org.pl/wp-json/wp/v2/search?search=...&subtype=wypowiedzi&per_page=5` | brak | JSON (search), HTML + JSON-LD (strona) | REST `posts`/`pages` = 401 (`itsec_rest_api_access_restricted`); search działa. `subtype=wypowiedzi` filtruje do stron z ClaimReview | © Stowarzyszenie Demagog; cytat + link | **Wysoka** — jedyne PL z ClaimReview |
| **AFP Fact Check** | brak publicznego API/RSS; `factcheck.afp.com/rss` → 403 Cloudflare | — | — | Tylko przez Google Fact Check (indeks) albo licencja AFP Forum | © AFP; licencja płatna | Niska bez licencji |
| **Full Fact** | `GET https://fullfact.org/feed/` (RSS 2.0); strony mają ClaimReview JSON-LD | brak | RSS/XML, HTML+JSON-LD | Brak publicznego search API; „Full Fact AI” to produkt komercyjny | © Full Fact; cytat + link | Niska dla PL (UK) |
| **PolitiFact** | `GET https://www.politifact.com/rss/factchecks/` | brak | RSS/XML | Strona artykułu **nie miała** ClaimReview JSON-LD w teście; brak publicznego API | © Poynter; cytat + link | Niska (US) |
| **Snopes** | `GET https://www.snopes.com/feed/` | brak | RSS/XML, HTML+JSON-LD | ClaimReview jest, ale `ratingValue` = null; ocena w `reviewRating.alternateName` | © Snopes; cytat + link | Niska (US) |
| **Poynter / IFCN** | `https://ifcncodeofprinciples.poynter.org/...` (HTML) | brak | HTML | Brak API do twierdzeń; to katalog sygnatariuszy, nie baza claimów | © Poynter | Tylko jako lista wydawców |
| **ClaimReview (schema.org)** | JSON-LD na stronach wydawców | brak | JSON-LD | Najbardziej przenośny format; parser musi być odporny na `@graph`, tablice i zepsuty JSON | Zależy od wydawcy | **Wysoka** przez Demagog/Full Fact/Snopes |
| **Wikidata** | `GET https://query.wikidata.org/sparql?format=json&query=...` | brak | JSON (SPARQL) | 60 s na query; wymagany sensowny UA; CC0 | CC0 | **Bardzo wysoka dla faktów prostych** |
| **EUvsDisinfo** | brak publicznego search/API; MCP `https://euvsdisinfo-mcp-server.vercel.app/mcp` | Bearer token | MCP/JSON | `robots.txt` zabrania `?s=` i `/feed/`; strona 403; `wp-json` 401 | Decyzja 2011/833/UE; atrybucja | Średnia, ale tylko przez snapshot |
| **NASK** | `https://nask.pl/weryfikuje`, `https://www.zglos-dezinformacje.nask.pl` | brak | HTML | Portal zgłoszeń/raporty, **nie** publiczna baza claimów z API | © NASK | Niska jako źródło dowodowe |
| **EDMO** | `https://edmo.eu/repository-of-fact-checking-articles` | brak | HTML | Brak udokumentowanego API; z tego środowiska TLS reset/403 | © EDMO | Niska/średnia, tylko ręcznie |

### 3.1. Przykłady zapytań

```bash
# Google (klucz z .env)
curl -s "https://factchecktools.googleapis.com/v1alpha1/claims:search?query=strefa%20euro&languageCode=pl&pageSize=5&key=$GOOGLE_FACT_CHECK_API_KEY"

# Demagog — tylko strony z ClaimReview
curl -s "https://demagog.org.pl/wp-json/wp/v2/search?search=Morawiecki&subtype=wypowiedzi&per_page=5"

# Demagog — filtr po wydawcy w Google
curl -s "https://factchecktools.googleapis.com/v1alpha1/claims:search?query=euro&languageCode=pl&reviewPublisherSiteFilter=demagog.org.pl&key=$GOOGLE_FACT_CHECK_API_KEY"

# Wikidata — stolica Polski
curl -sG "https://query.wikidata.org/sparql" \
  --data-urlencode 'format=json' \
  --data-urlencode 'query=SELECT ?vLabel WHERE { wd:Q36 wdt:P36 ?v. SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". } }' \
  -H 'User-Agent: PrawdowidBot/1.0 (fact-checking prototype)'
```

---

## 4. ClaimReview JSON-LD — konkretne domeny i sposób pobrania

ClaimReview to format schema.org, którego Google wymaga do Fact Check Explorera. Na stronie
występuje jako:

```html
<script type="application/ld+json">
{"@context":"http://schema.org","@type":"ClaimReview",
 "claimReviewed":"...", "reviewRating":{"alternateName":"Fałsz","ratingValue":"1"},
 "url":"...", "datePublished":"...", "author":{"name":"Demagog PL"}}
</script>
```

### 4.1. Sprawdzone domeny

| Domena | URL wzorcowy | ClaimReview | Uwagi parsera |
|---|---|---|---|
| **demagog.org.pl** | `/wypowiedzi/<slug>/` | **TAK** | Często **tablica** `[{...}]`, nie obiekt; `&nbsp;` w środku JSON-a psuje `JSON.parse`; `datePublished` może być `"2018-09-24 09:29:50 UTC"`; `ratingValue` bywa **nieobecny** — bierz `reviewRating.alternateName` |
| **fullfact.org** | `/environment/...`, `/economy/...` | **TAK** | `reviewRating.ratingValue` = null; ocena w `alternateName` i `reviewBody`; `@id` wskazuje kanoniczny URL |
| **snopes.com** | `/fact-check/<slug>/` | **TAK** | `ratingValue` = null; `reviewRating.alternateName`; duży HTML (~680 KB) |
| **politifact.com** | `/factchecks/...` | **NIE** (w testowanej stronie) | Jest RSS, brak JSON-LD ClaimReview; nie opierać się na nim |
| **factcheck.afp.com** | `/` | **NIE** (403) | Cloudflare blokuje boty; tylko Google index / licencja |
| **konkret24.tvn24.pl** | — | **niezweryfikowane** | DNS w tym środowisku był niestabilny; kandydat do sprawdzenia ręcznie, nie wpisywać na listę bez testu |
| **euvsdisinfo.eu** | — | **NIE** | Brak ClaimReview; tylko MCP/snapshot |

### 4.2. Jak je pobierać legalnie i stabilnie

1. **Odkrywanie URL-i**
   - Demagog: sitemapy `https://demagog.org.pl/wypowiedzi-sitemap.xml` oraz
     `wypowiedzi-sitemap2.xml` … `wypowiedzi-sitemap7.xml` (setki tysięcy? — raczej dziesiątki
     tysięcy; ostatnia mapa ma ~265 KB samego XML). Do szybkiego startu: search API z
     `subtype=wypowiedzi`.
   - Full Fact: RSS `https://fullfact.org/feed/` + sitemap (DNS bywa niestabilny).
   - Snopes: RSS `https://www.snopes.com/feed/` (sitemap.xml = 404).
2. **Pobranie strony** — tylko HTML, bez paywalla. Nagłówek `User-Agent` z nazwą i kontaktem.
3. **Parsowanie** — wyciągnij **wszystkie** bloki `application/ld+json`, nie tylko pierwszy.
   - obsłuż `@graph`, tablicę i pojedynczy obiekt,
   - przed `JSON.parse` zamień `&nbsp;` → spacja, `&quot;` → `"`, `&#39;` → `'`,
   - błędny blok pomiń, nie przerywaj strony,
   - weź `claimReviewed`, `reviewRating.alternateName` (fallback: `ratingValue`),
     `datePublished`, `url`, `author.name`.
4. **Cache** — trzymaj JSON-LD per URL (np. 7 dni), żeby nie bić wydawcy przy każdym claimie.
5. **Rate limit** — 1 żądanie/s, maks. 2–3 strony na jedno twierdzenie.
6. **Mapowanie ocen** (rozszerzyć istniejące `mapRating`):
   - `Fałsz`, `Nieprawda`, `Fake` → `false`
   - `Manipulacja`, `Częściowa prawda`, `Misleading` → `misleading`
   - `Prawda` → `confirmed`

### 4.3. Co to daje, a czego nie daje

Daje: gotową, ludzką ocenę + URL + datę + wydawcę. Nie daje: gwarancji, że recenzja dotyczy
**tej samej tezy**. Dlatego po dopasowaniu tokenowym musi paść pytanie Jev:
„czy `candidate` i `claim` wyrażają tę samą tezę (ten sam podmiot, relację, obiekt, polaryzację
i datę)?”. Próg `noul >= 0.8` jak w `src/research/index.ts`. Dopiero potem `relation: "refutes"`.

---

## 5. EUvsDisinfo — publiczne endpointy poza MCP

Sprawdzone:

| Endpoint | Wynik | Wniosek |
|---|---|---|
| `https://euvsdisinfo.eu/robots.txt` | 200, tekst | `Disallow: */?s=`, `*/feed/`, `*/?highlight=`, `*/?sort=` |
| `https://euvsdisinfo.eu/` | **403** Cloudflare | Brak publicznego HTML dla bota |
| `https://euvsdisinfo.eu/sitemap_index.xml` | **403** | Brak sitemapy |
| `https://euvsdisinfo.eu/wp-json/` | **401** `rest_forbidden_context` | REST wymaga auth |
| `https://euvsdisinfo.eu/wp-json/wp/v2/posts?per_page=1` | **403** | Brak publicznego REST |
| `https://euvsdisinfo-mcp-server.vercel.app/mcp` | działa z Bearer | Jedyne legalne źródło pełnych danych |

**Nie ma publicznego search/API/sitemapy bez tokenu.** Nie próbować obchodzić Cloudflare.
Obecna architektura (MCP → `data/euvsdisinfo/cases.ndjson` → lokalny search) jest poprawna.
Uwaga: baza jest angielska i skoncentrowana na dezinformacji antysystemowej/antyeuropejskiej,
więc **polskie, elementarne fałsze** (Kraków stolicą, Wisła 2047 km) tam nie trafią.

---

## 6. Źródła rządowe — co realnie mają

Sprawdzone endpointy (stan 2026-11-22):

| Źródło | Endpoint | Status / format | Do czego się nadaje |
|---|---|---|---|
| **IMGW meteo** | `https://danepubliczne.imgw.pl/api/data/meteo` | 200, `application/json`, ~522 KB | Bieżące pomiary/ostrzeżenia meteo; kontekst „jaka jest pogoda/alert” |
| **IMGW hydro** | `https://danepubliczne.imgw.pl/api/data/hydro` | 200, JSON, ~554 KB | Stany wód, powodzie; kontekst zdarzenia |
| **CERT Polska** | `https://cert.pl/feed/` | 200, `text/xml` (RSS), ~60 KB | Komunikaty bezpieczeństwa; „czy jest alert o X” |
| **GIOŚ powietrze** | `https://api.gios.gov.pl/pjp-api/rest/station/findAll` | **ERR** z tego środowiska (TLS reset); API publiczne i udokumentowane | Jakość powietrza; tylko po potwierdzeniu sieci |
| **gov.pl ostrzeżenia** | `https://www.gov.pl/web/gov/ostrzezenia` | 200, HTML (~11 KB); `/rss` i `/sitemap.xml` → 404 | Tylko kontekst/HTML; brak kanału maszynowego |
| **gov.pl GIS** | `https://www.gov.pl/web/gis/ostrzezenia` | 200, HTML (~35 KB) | Ostrzeżenia sanitarne; HTML, bez RSS |
| **Odyseusz (RCB)** | `https://odyseusz.gov.pl/` | 200, Angular SPA; JS woła `/api/v1/` (endpointy w lazy chunkach, nieudokumentowane) | Nie opierać się bez umowy/ dokumentacji |
| **PAA monitoring** | `https://monitoring.paa.gov.pl/` | 200, Angular SPA (`/maps-portal/`), brak sitemap | Radiacja; tylko UI, brak publicznego API |
| **GDDKiA drogi** | `https://drogi.gddkia.gov.pl/informacje-drogowe` | 200, ale Incapsula challenge (NOINDEX iframe) | Nie scrapować; brak stabilnego API |
| **Portal Pasażera** | `https://portalpasazera.pl/` | DNS w tym środowisku nie odpowiadał | Rozkłady; osobna integracja, nie fact-check |
| **ULC / UTK / PKP** | strony HTML | Brak sprawdzonego API/RSS | Kontekst praw pasażera, nie fakty ogólne |

### 6.1. Do czego naprawdę nadają się te źródła

**Alerty / bieżące zdarzenia (kontekst):**
- „Czy IMGW wydało ostrzeżenie przed burzami w Warszawie 22.11.2026?”
- „Czy CERT ostrzega przed kampanią phishingową na klientów banku X?”
- „Czy GIS wycofał partię produktu Y?”
- „Czy PAA zgłosiła podwyższony poziom promieniowania?”

Tutaj wystarczy: świeżość (np. 24–72 h), dopasowanie encji (miejsce, instytucja, produkt)
i cytat z komunikatu. To dobry materiał na `primary` + `context`, ale nie na „prawdę wieczystą”.

**Fakty ogólne (stolica, waluta, liczby, daty):**
- **Nie rozstrzygną.** gov.pl/IMGW/CERT nie mają twierdzenia „stolicą Polski jest Kraków”
  ani „Wisła ma 2047 km”. Nie ma tam ClaimReview ani pól liczbowych do porównania.
- Nie należy ich wciągać do odpowiedzi na takie pytania „na siłę” — to generuje fałszywe
  `insufficient_evidence` i szum w ewaluacji.

**Wniosek:** wdrażać **wybiórczo** 3 źródła: IMGW meteo/hydro, CERT RSS, GIOŚ (jeśli sieć
pozwoli). gov.pl trzymać jako link kontekstowy, nie jako korpus do embeddingów.

---

## 7. Google Fact Check: `claimReview` i Explorer vs API

### 7.1. Co już mamy

`src/modules/google.ts` poprawnie woła `claims:search` i zwraca `FactCheckClaim[]` z
`claimReview[]`. `src/research/index.ts` robi trzy zapytania (całe zdanie, `s+o`, `s+p+o`),
deduplikuje i przepuszcza przez `sameProposition` (Jev). To dobra architektura — problemem
jest **pokrycie**, nie kod.

### 7.2. Zmierzone pokrycie (klasa `false` z eval)

| Twierdzenie z eval | Google Fact Check | Ocena |
|---|---|---|
| Stolicą Polski jest Kraków | 0 hitów | brak |
| Polska przyjęła euro w 2010 | 0 hitów | brak |
| Polska jest w strefie euro | 2 hity, ale o „euro w 2026” i cytacie UE | **inna teza**, Jev odrzuci |
| Premierem w 2024 był Morawiecki | 0 hitów | brak |
| Polska w NATO w 2004 | 0 hitów | brak |
| Duda przegrał z Trzaskowskim 2020 | 0 hitów | brak |
| Wisła ma 2047 km | 0 hitów | brak |

Czyli **0/7 tej samej tezy**. Nawet tematyczny hit „euro” jest bezużyteczny bez Jev.

### 7.3. Jak zwiększyć pokrycie

1. **Krótkie frazy, nie całe zdania.** Zamiast „Polska przyjęła walutę euro w 2010 roku”:
   `euro Polska`, `euro 2010`, `przyjęcie euro`.
2. **Wiele zapytań równolegle** — 4–6 wariantów: pełne zdanie, `s+o`, `s+p+o`, dwie nazwy
   własne, sam obiekt. Deduplikacja po `normalizeText(parent.text)` już jest.
3. **`reviewPublisherSiteFilter`** — osobne przebiegi po `demagog.org.pl`, `factcheck.afp.com`,
   `konkret24.tvn24.pl` (jeśli potwierdzi ClaimReview), `fullfact.org`.
4. **`maxAgeDays`** — dla twierdzeń o bieżących zdarzeniach zawęź do 30–365 dni; dla faktów
   historycznych nie zawężaj.
5. **`languageCode`** — dla PL zawsze `pl`; dla cytatów angielskich dodaj drugi przebieg bez
   `languageCode` lub z `en`.
6. **Nie używaj samego `textualRating`** — bierz `reviewRating.alternateName`, jeśli Google
   je zwróci; mapowanie ocen rozszerz o „Manipulacja”, „Częściowa prawda”, „Incorrect”.

### 7.4. Explorer vs API

- **Explorer** (`toolbox.google.com/factcheck/explorer`) to UI na tym samym zbiorze danych.
  Daje filtry języka, daty i wydawcy, wyszukiwanie obrazem i listę „recent”. **Nie ma
  oficjalnego eksportu CSV** — eksporty w third-party scraperach to nieoficjalne obejścia.
- **API** daje dokładnie te same `claimReview` w JSON, z paginacją (`pageToken`), filtrem
  wydawcy i limitem `pageSize`. Do pipeline'u jest lepsze: stabilny kontrakt, brak HTML.
- Explorer bywa przydatny **ręcznie** do oceny, czy dany wydawca w ogóle publikuje ClaimReview
  dla danego tematu. Do runtime — API.

---

## 8. Co najbardziej podniesie recall `false` (i ile to kosztuje)

### 8.1. Ocena źródeł względem 8 przypadków `false`

| Przypadek | Demagog ClaimReview | Google Fact Check | Wikidata | Wikipedia |
|---|---|---|---|---|
| case-04 Kraków stolicą | nie (temat „Kraków”, inna teza) | nie | **tak** (P36 = Warszawa) | tak (infobox) |
| case-05 euro w 2010 | nie | nie | **tak** (P38 = złoty; brak euro) | tak |
| case-09 członek strefy euro | nie | nie (temat, inna teza) | **tak** (brak P463→eurozona) | tak |
| case-10 premier 2024 | nie | nie | **tak** (P6 = Tusk, od 2023-12-13) | tak |
| case-11 NATO 2004 | nie | nie | **tak** (P463 + P580 = 1999-03-12) | tak |
| case-12 Duda vs Trzaskowski | nie | nie | częściowo (wynik wyborów) | tak |
| case-14 Wisła 2047 km | nie | nie | brak P2043 | tak (infobox) |
| case-22 prompt injection | nie | nie | nie dotyczy | nie dotyczy |

**Wniosek:** fact-checki dają 0–1/8. Wikidata + Wikipedia dają 6–7/8. To nie znaczy, że
Demagog jest bez wartości — dla **rzeczywistych** twierdzeń publicznych (cytaty polityków,
narracje) jest najlepszym polskim źródłem i podnosi precyzję, nie recall prostych fałszów.

### 8.2. Szacunek pracy

| Źródło | Zakres | Godziny |
|---|---|---|
| **Demagog ClaimReview** — search + parser + cache + Jev + testy | live, bez pełnego ingestu | **6–10 h** |
| Demagog — pełny ingest sitemap `/wypowiedzi/` (dziesiątki tysięcy stron, throttling) | offline | +10–16 h |
| **Wikidata** — MVP 5 predykatów (P36, P38, P6, P463, P2043) + entity linking | deterministyczne obalanie | **10–16 h** |
| Wikidata — produkcyjny entity linking PL→QID (aliasy, disambiguacja) | pełny | 20–40 h |
| **Google** — krótsze frazy, warianty, filtr wydawcy | uzupełnienie | 2–3 h |
| **IMGW + CERT** — ingest do `documents` + świeżość | alerty | 3–5 h |
| GIOŚ | alerty | 1–2 h (po naprawie sieci) |
| gov.pl/Odyseusz/PAA | kontekst HTML/SPA | 2–4 h, niska wartość |

---

## 9. Rekomendacja: dwa źródła na pierwszy ogień

### Priorytet 1 — Demagog ClaimReview (polskie, legalne, bez tokenu)

Dlaczego: jedyne sprawdzone polskie źródło z ClaimReview i publicznym search API. Daje
gotową ocenę (`Fałsz`, `Manipulacja`, `Prawda`), URL i datę. Nie wymaga tokenu ani ingestu
całej bazy.

Plan:
1. **Endpoint** — `GET https://demagog.org.pl/wp-json/wp/v2/search?search=<fraza>&subtype=wypowiedzi&per_page=10`.
   Frazy: 1–3 najbardziej dystynktywne tokeny (nazwa własna, instytucja, liczba), nie całe zdanie.
2. **Parser** — pobierz 2–3 najlepsze strony, wyciągnij wszystkie bloki JSON-LD, napraw
   `&nbsp;`, obsłuż tablicę/`@graph`, weź `claimReviewed`, `reviewRating.alternateName`,
   `datePublished`, `url`, `author.name`.
3. **Dopasowanie claimu** — token overlap (jak w `euvsdisinfo.ts`) + **Jev** `sameProposition`
   z `noul >= 0.8`. Odrzuć sam temat, inną datę, inną polaryzację.
4. **Bramka Jev** — dopiero po `true` twórz `Evidence { type: "fact_check", relation: "refutes" }`.
   Ocena `Prawda` → `supports`; `Manipulacja`/`Częściowa prawda` → `misleading` + `refutes`.
5. **Cache i limit** — 7 dni per URL, 1 req/s, UA z kontaktem, tylko `wypowiedzi`.
6. **Testy** — 3 twierdzenia z pokryciem (np. Morawiecki, Trzaskowski) + 3 bez pokrycia
   (Kraków stolicą, Wisła 2047). Oczekiwane: brak fałszywego `refutes` na tych drugich.

Koszt: **6–10 h**. Ryzyko: search znajduje temat, nie tezę — dlatego Jev jest obowiązkowy.

### Priorytet 2 — Wikidata jako deterministyczny „obalacz” faktów prostych

Dlaczego: to jedyne źródło, które wprost obala 4/7 fałszów z eval i jest CC0/bez klucza.
Demagog tego nie zrobi, Google tym bardziej.

Plan:
1. **Ekstrakcja trójki** — z `claim.fact` weź `(s, p, o)`; zmapuj `p` na predykat:
   `capital_of` → P36, `currency` → P38, `head_of_government` → P6, `member_of` → P463,
   `length` → P2043.
2. **Entity linking** — `s` → QID przez `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=...&language=pl&format=json`
   + mała mapa aliasów dla najczęstszych podmiotów (Polska=Q36, Wisła=Q1545, NATO=Q7184).
3. **SPARQL** — pobierz wartość i kwalifikatory (`P580`/`P582` dla członkostw i urzędów).
   Przykład: `wd:Q36 p:P463 ?st. ?st ps:P463 wd:Q7184; pq:P580 ?start.`
4. **Porównanie** — normalizacja tekstu, daty (rok), liczby z tolerancją (np. ±2% dla długości).
   Brak wartości = **brak dowodu**, nie automatyczny fałsz (wyjątek: jawna negacja, np. „nie
   jest członkiem” przy istniejącym członkostwie).
5. **Evidence** — `type: "primary"`? Nie: Wikidata to źródło wtórne/strukturalne. Bezpieczniej
   `type: "secondary"`, `relation: "refutes"`, `excerpt: "Wikidata: P36 = Warszawa"`, URL do
   encji. Jev nie jest potrzebny do matematyki, ale może weryfikować sens zdania.
6. **Testy** — dokładnie 7 przypadków `false` z eval; cel: ≥5 poprawnych `refutes` bez
   fałszywych trafień na `confirmed`.

Koszt MVP: **10–16 h**. To więcej niż Demagog, ale to jedyna droga do F1 ≥ 0,75 na tej klasie.

### Co z Google

Zostawić jako uzupełnienie. Dodać 2–3 krótkie warianty zapytań i filtr `demagog.org.pl`.
Nie liczyć na wzrost recallu `false` — to źródło do realnych, publicznych twierdzeń.

---

## 10. Architektura ingestu źródeł rządowych (jeśli robimy)

Cel: **nie** „wiedza ogólna”, tylko **kontekst bieżący**. Dokumenty w `documents` już mają
`source_id`, `canonical_url`, `published_at`, `content`, `excerpt`, `content_hash`, `fetched_at`.

Proponowany przepływ:

```
RSS/JSON/HTML → normalizacja → dokument per wpis/komunikat → hash → INSERT documents
                                                             ↓
                                             FULLTEXT(excerpt/content) + wektory
                                                             ↓
                                   retrieval po encji + świeżości (np. 72 h)
                                                             ↓
                                   Evidence { type: "primary", relation: "context" }
```

Zasady:
- **`documents` nie ma kolumny `embedding`** (jest tylko w `claims`). Nie zmieniając rdzenia:
  albo licz wektory w pamięci przy starcie (jak `src/sources/index.ts`), albo dodaj osobną
  tabelę `document_embeddings` w przyszłej migracji. Do BM25 wystarczy `FULLTEXT` na
  `excerpt`/`content` (MySQL InnoDB).
- **Hash** — `content_hash` już jest unikalny per źródło; to załatwia deduplikację i wersje.
- **Nie wrzucaj 500 KB JSON-a IMGW jako jednego dokumentu.** Zrób dokument per stacja albo
  per komunikat; inaczej embedding jest bezużyteczny.
- **Świeżość** — dla alertów filtr `published_at >= now - 72h`; dla praw pasażera/ULC dłużej.
- **Nie mieszaj typów** — źródła rządowe jako `primary` + `context`; nigdy nie podnoś ich do
  `supports` dla faktów ogólnych.
- **Selekcja** — wdrażaj tylko IMGW meteo/hydro, CERT RSS i ewentualnie GIOŚ. gov.pl,
  Odyseusz, PAA, GDDKiA zostaw jako linki/HTML; nie buduj na nich recallu.

---

## 11. Probe — co robi i jaki dał wynik

Plik: `scripts/probe-factcheck-sources.ts`. Uruchomienie:

```bash
bun run scripts/probe-factcheck-sources.ts                 # Demagog + Wikidata
bun run scripts/probe-factcheck-sources.ts "Morawiecki"    # własna fraza
bun run scripts/probe-factcheck-sources.ts --google --gov  # + Google + format rządowy
```

Wynik z tego środowiska (2026-11-22):

```
=== Demagog: "Morawiecki" ===
wyników search: 5
  • [wypowiedzi] Obcokrajowcy w ZUS. Bilans jest korzystniejszy, niż twierdzi Morawiecki
    ClaimReview: 1
      ocena="Częściowa prawda" (brak ratingValue) | Wkład wszystkich obcokrajowców...
  • [wypowiedzi] Czy bezrobocie rosło tylko za rządów Donalda Tuska? Manipulacja Morawieckiego
    ClaimReview: 1
      ocena="Manipulacja" (brak ratingValue) | Od momentu wejścia Polski do Unii Europejskiej...
  • [wypowiedzi] Budżet w tarapatach? Morawiecki manipuluje danymi
    ClaimReview: 1
      ocena="Manipulacja" (brak ratingValue) | Mamy to! Cel deficytu na grudzień...

=== Google Fact Check Tools ===
  2 hit — Polska jest obecnie członkiem strefy euro
  1 hit   — ... (temat, nie teza)
  BRAK     — Polska przystąpiła do NATO w 2004 roku
  BRAK     — Wisła ma 2047 kilometrów długości

=== Wikidata SPARQL (CC0, bez klucza) ===
  stolica Polski (P36): vLabel=Warszawa
  waluta Polski (P38):  vLabel=złoty
  członkostwo w NATO (P463 + P580): orgLabel=NATO  start=1999-03-12T00:00:00Z

=== Format źródeł rządowych ===
  200 application/json 522 KB — IMGW meteo
  200 application/json 554 KB — IMGW hydro
  200 text/xml 60 KB        — CERT Polska RSS
  ERR ECONNRESET            — GIOŚ powietrze (sieć, nie brak API)
  200 text/html 11 KB       — gov.pl ostrzeżenia
```

To potwierdza trzy rzeczy:
1. Demagog **ma** ClaimReview i publiczny search — ale ocena dotyczy innej tezy niż nasze
   fałsze, więc bez Jev byłby fałszywy `refutes`.
2. Google **nie pokrywa** prostych fałszów.
3. Wikidata **pokrywa** je deterministycznie i bez klucza.

---

## 12. Licencje i higiena prawna

- **Google Fact Check** — dane pochodzą od wydawców; używamy cytatu oceny i linku, nie
  redystrybuujemy pełnych recenzji. Warunki Google APIs / wydawcy.
- **Demagog, Full Fact, Snopes, PolitiFact, AFP** — © wydawcy. Tylko `claimReviewed`
  (fragment), ocena, data, URL. Bez kopiowania treści artykułu do repo/DB.
- **Wikidata** — CC0; można używać bez atrybucji (ale dobra praktyka: link do encji).
- **EUvsDisinfo** — decyzja 2011/833/UE; atrybucja + link; w repo tylko `claim`/`fact` (fragment).
- **Źródła rządowe** — dokumenty urzędowe wyłączone z ochrony (art. 4 pr. aut.), ale układ
  stron i zdjęcia mogą być chronione; trzymaj `excerpt` + link.
- **Robots/ToS** — respektuj `robots.txt` (EUvsDisinfo jawnie zabrania `?s=` i `/feed/`),
  nie omijaj Cloudflare/Incapsula. Rate limit 1 req/s, UA z kontaktem, cache.

---

## 13. Otwarte pytania / następne kroki

1. **Czy `konkret24.tvn24.pl` ma ClaimReview?** DNS w tym środowisku był niestabilny —
   sprawdzić ręcznie 2–3 artykuły. Jeśli tak, to drugie polskie źródło ClaimReview.
2. **Czy Demagog ma głębszy search niż `wp/v2/search`?** HTML `?s=` zwraca wyniki, ale
   pełnotekstowość i ranking nie są udokumentowane. Na razie `subtype=wypowiedzi` wystarcza.
3. **Czy GIOŚ API jest osiągalne z produkcji?** W tym środowisku TLS reset; sprawdzić na
   serwerze docelowym, zanim wpiszemy do manifestu.
4. **Czy EDMO ma prywatne API dla hubów?** Strona repository nie ujawnia endpointu; bez
   umowy nie ma sensu na to czekać.
5. **Ile ważyć Wikidata vs Wikipedia?** Wikidata daje strukturę, Wikipedia pokrywa brakujące
   P2043 (długość Wisły). Docelowo: Wikidata pierwsza, Wikipedia jako fallback dla liczb.

---

## 14. Wyszukiwarki webowe — ocena do researchu

Cel: znaleźć **kandydata** na stronę, która wprost mówi o twierdzeniu. Wyszukiwarka nie jest
źródłem dowodu — dostarcza URL, który potem przechodzi przez pobranie strony, dopasowanie
zdania i bramkę Jev.

| Narzędzie | Klucz | Limity | Cennik (znany) | ToS / legalność | Jakość PL | Prototyp? |
|---|---|---|---|---|---|---|
| **Tavily** | tak (`TAVILY_API_KEY`) | 1 000 kredytów/mies. free; basic search = 1 kredyt, advanced = 2; rate limit wg docs/planu (zewnętrzne źródła podają ~100 RPM na free) | PAYG 0,008 USD/kredyt; Project 30 USD/4 000; Growth 500 USD/100 000 | Tavily Terms; API do aplikacji AI, nie do odsprzedaży wyników; cache'owanie rozsądne | Średnia; dobre do newsów i angielskiego, polskie długie frazy słabsze | **Tak** — najprostszy start, 1 kredyt/zapytanie |
| **Brave Search API** | tak (`BRAVE_API_KEY`, nagłówek `X-Subscription-Token`) | Search: 5 USD darmowego kredytu/mies. (~1 000 zapytań), 50 QPS; Answers: 2 QPS | Search 5 USD/1 000 zapytań; Answers 4 USD/1 000 + tokeny | Brave API Terms; nie budować konkurencyjnej wyszukiwarki, nie odsprzedawać; karta może być wymagana | Dobra; `search_lang=pl`, `country=PL`; własny indeks, mniej SEO spamu niż Google-scraping | **Tak** — najlepszy stosunek jakości do ceny, jeśli jest budżet |
| **DuckDuckGo Instant Answer API** | nie | brak publikowanego limitu (fair use/anti-abuse) | free | Attribution wymagana; API zwraca **instant answers**, nie wyniki webowe | Słaba/żadna do claim retrieval | **Nie** — nie zwraca listy stron |
| **DuckDuckGo HTML (`html.duckduckgo.com`)** | nie | nieoficjalne, throttling/captcha | free | Brak oficjalnego API; scraping SERPów jest sprzeczny z ToS i kruchy | — | **Nie** — nie opierać produktu |
| **SearXNG** | nie (self-host) | zależy od instancji; publiczne często mają `format=json` wyłączony i limiter | koszt VM; publiczne darmowe bez SLA | Licencja AGPL; publiczne instancje mają własne regulaminy; metasearch może naruszać ToS upstreamów (Google/Bing) | Średnia; zależy od silników; polskie wyniki przez Google/Bing/Startpage bywają blokowane | **Tak, ale tylko self-host** na dev, mały wolumen; nie publiczna instancja |

### 14.1. Rekomendacja wyboru

- **Prototyp / demo:** Tavily (free 1 000 kredytów) — najmniej tarcia, jedno zapytanie = 1 kredyt.
- **Produkcja z budżetem:** Brave Search API — własny indeks, przewidywalny cennik, dobre `pl`.
- **Fallback offline/dev:** self-hosted SearXNG, ale nie jako zależność produkcyjna.
- **DuckDuckGo:** tylko jako ciekawostka/Instant Answer; **nie** jako search dla claimów.

### 14.2. Czego nie robić

- Nie scrapować Google/Bing SERPów „na około”. To kruche i sprzeczne z ToS.
- Nie używać publicznych instancji SearXNG jako backendu produkcyjnego (rate limit, captcha,
  brak SLA, niejasne logowanie zapytań).
- Nie pobierać pełnych artykułów z paywalli; snippet może być co najwyżej `context`.

---

## 15. Lista zaufanych domen — tiery

Zasada nadrzędna: **domena nie może sama przesądzać werdyktu.** Tier podnosi maksymalną
pewność i decyduje o kolejności pobierania, ale `supports`/`refutes` wolno ustawić tylko wtedy,
gdy **konkretne zdanie** na stronie wyraża tę samą tezę (bramka Jev). Sama obecność gov.pl,
Demagoga czy PAP nie jest dowodem.

### Tier A — oficjalne / urzędowe

| Domena | Co daje | Uwagi |
|---|---|---|
| `gov.pl` (ministerstwa, KPRM, GIS, MSWiA, RCB) | komunikaty, ostrzeżenia, akty | dokumenty urzędowe; układ strony może być chroniony |
| `pkw.gov.pl` | wyniki wyborów, obwieszczenia, finansowanie kampanii | źródło pierwotne do wyborów |
| `stat.gov.pl` (GUS) | dane statystyczne, publikacje | cytat + link; zwracaj uwagę na rok/definicję |
| `nbp.pl` | kursy, stopy, publikacje | dane liczbowe; podaj datę odczytu |
| `eur-lex.europa.eu` | prawo UE, decyzje, rozporządzenia | decyzja 2011/833/UE; atrybucja |
| `sejm.gov.pl`, `isap.sejm.gov.pl`, `dziennikustaw.gov.pl`, `monitorpolski.gov.pl` | ustawy, druki, przebieg prac | dokumenty urzędowe; dobre do „czy ustawa X obowiązuje” |

**Rola:** `primary` — może dać `supports`/`refutes`, ale tylko po dopasowaniu zdania i Jev.
Maks. pewność: 0,9. Nie używaj Tier A do faktów, których tam nie ma (stolica, długość rzeki).

### Tier B — fact-checking

| Domena | Co daje | Uwagi |
|---|---|---|
| `demagog.org.pl` | ClaimReview, oceny wypowiedzi | najlepsze PL; `alternateName`, nie `ratingValue` |
| `factcheck.afp.com`, `sprawdzam.afp.com` | Fact Check AFP | 403 dla botów; tylko Google index / licencja |
| `euvsdisinfo.eu` | przypadki dezinformacji | tylko MCP/snapshot; brak publicznego search |
| `fullfact.org`, `snopes.com`, `politifact.com` | fact-check EN | przydatne do twierdzeń międzynarodowych |
| `konkret24.tvn24.pl` | fact-check TVN24 | **do potwierdzenia**, czy ma ClaimReview |
| `edmo.eu`, `nask.pl` | huby/repozytoria | brak publicznego API claimów; raczej kontekst |

**Rola:** `fact_check` — ocena wydawcy może wejść jako `false`/`misleading`/`confirmed`
**tylko** po Jev `sameProposition`. Jeśli Jev nie potwierdza tej samej tezy → `context`.
Maks. pewność: 0,9.

### Tier C — media

| Domena | Co daje | Uwagi |
|---|---|---|
| `pap.pl` | depesze, relacje | źródło wtórne; uważaj na przedruki |
| `tvn24.pl`, `rmf24.pl`, `polsatnews.pl`, `radiozet.pl` | newsy, relacje | fact-check tylko w wydzielonych działach |
| `wyborcza.pl`, `onet.pl`, `wp.pl`, `o2.pl`, `interia.pl` | newsy, publicystyka | paywalle; snippet = context, nie dowód |

**Rola:** `secondary` — może dać `supports`/`refutes` tylko przy dosłownym cytacie i Jev;
maks. pewność: 0,6. Dwa niezależne media z Tier C mogą podnieść pewność, ale **nie** zastępują
źródła pierwotnego.

### Tier D — reszta

Blogi, fora, social media, content farmy, nieznane domeny, agregatory, „fakty” bez autora.

**Rola:** wyłącznie **kandydat do sprawdzenia**. Nigdy `supports`/`refutes`, nigdy nie liczy
się do „dwóch niezależnych źródeł”. Maks. pewność: 0.

### 15.1. Formalna reguła

```
tier = A | B | C | D
if tier == D:                 rola = candidate, relation = context, confidence = 0
if relation in {supports, refutes}:
    wymagane: sentence_match(claim, sentence) && jev_same_proposition(claim, sentence)
    maks. confidence: A=0.90, B=0.90, C=0.60
if relation == context:       tier nie podnosi pewności
```

Dodatkowo:
- **Tier A nie oznacza „prawda”** — jeśli gov.pl nie mówi o twierdzeniu, nie ma dowodu.
- **Tier B nie oznacza „fałsz”** — ocena dotyczy innej tezy, jeśli Jev tego nie potwierdzi.
- **Tier C nie może być jedynym źródłem `refutes`** dla twierdzenia o faktach urzędowych.
- **PDF-y są zakazane jako dowód** („zakaz z PDF”): mogą być linkiem kontekstowym, ale
  parser nie wyciąga z nich werdyktu. Wyjątek: oficjalny dokument, jeśli potrafisz go
  zweryfikować i zacytować — nadal wymaga Jev.

---

## 16. Jak wpiąć search w research

### 16.1. Kiedy w ogóle odpalać search

Search jest drogi i szumowy. Odpalaj **tylko gdy**:

1. Brak `fact_check` verdict z Google/Demagog **oraz**
2. brak `supports`/`refutes` z korpusu, EUvsDisinfo i Wikipedii **oraz**
3. twierdzenie zawiera encję, datę lub liczbę (czyli da się je sprawdzić) **oraz**
4. to nie jest prompt injection / tekst bez treści faktycznej **oraz**
5. to nie jest twierdzenie o przyszłości bez daty (`planned`/`hypothetical`).

Nie odpalaj search dla: pozdrowień, opinii, pytań retorycznych, twierdzeń czysto
wartościujących, ani gdy istnieje już rozstrzygający ClaimReview.

### 16.2. Przepływ

```
claim
  → query builder (2–4 tokeny: encja + obiekt; nie całe zdanie)
  → search API (Tavily/Brave)
  → filtr domen: Tier A/B najpierw; Tier D odrzuć
  → pobierz max 2 strony (Tier A/B), 4 s timeout, bez PDF/paywall
  → matchingSentence() — jedno zdanie, 40–600 znaków
  → Jev: supports? refutes? (noul >= 0.8, osobne pytania)
  → Evidence { type, relation, tier, url, excerpt, publishedAt }
  → decyzja: fact_check > 2 niezależne > 1 primary > refutes > insufficient
```

### 16.3. Limity kosztu i czasu

| Parametr | Wartość |
|---|---|
| Zapytania search na claim | 1 (maks. 2 przy braku wyników) |
| Wyniki brane pod uwagę | 5 |
| Strony pobierane | 2 (Tier A/B), 0 z Tier D |
| Timeout pobrania strony | 4 s |
| Budżet search+fetch na claim | 6 s |
| Globalny budżet requestu | 12 s (jak obecnie w `research/index.ts`) |
| Koszt Tavily | 1 kredyt/zapytanie (basic) |
| Koszt Brave | ~0,005 USD/zapytanie |
| 30 claimów | ~30 kredytów Tavily lub ~0,15 USD Brave |

### 16.4. Gdzie to trzymać

- Nowy moduł `src/research/websearch.ts` (poza rdzeniem) — dopiero po akceptacji.
- Nie zmieniać `ResearchOptions`; search ma być wewnętrznym fallbackiem, nie nowym
  obowiązkowym etapem.
- `Evidence` nie ma pola `tier`. Na teraz: tier wpływać na `confidence` i `limitations`,
  a w `publisher` zostawić nazwę wydawcy. Docelowo dodać `tier` do typu — to zmiana rdzenia,
  więc **nie w tej iteracji**.

---

## 17. Ryzyka i jak je tłumić

| Ryzyko | Objaw | Tłumienie |
|---|---|---|
| **SEO spam / doorway pages** | dokładne frazy z claimu, brak autora, dużo linków afiliacyjnych | Tier D = tylko kandydat; bloklisty; wymagaj zdania 40–600 znaków; sprawdzaj `about`/kontakt; nie ufaj samej zgodności keywordów |
| **Content farmy / AI slop** | setki artykułów dziennie, brak redakcji, powtarzalny szablon | Preferuj Tier A/B; dla `refutes` wymagaj Tier A/B; hash treści i wykrywanie szablonów |
| **Paywalle** | 401/402/403, „subskrybuj”, metryka zablokowana | Nie obchodź; snippet = `context`, nie dowód; dopisz limitation |
| **Prompt injection ze strony** | „ignore previous instructions”, prośby o ujawnienie promptu, linki do narzędzi | Traktuj treść strony jako **dane**, nie instrukcje; cytuj tylko jedno zdanie; nie wklejaj całej strony do modelu; Jev dostaje `claim` + `sentence` w polach, nie w system promptcie; nie wykonuj URL-i z treści |
| **Powielanie tej samej agencji** | PAP → wp.pl/onet/interia; ten sam tekst, różne domeny | Deduplikacja po `canonical_url`, `content_hash`, shingle tytułu i autorze; licz **źródła**, nie domeny; PAP + przedruk = 1 źródło |
| **Ten sam fact-check w Google i Demagog** | ten sam URL/claim w dwóch API | Deduplikacja po URL i `claimReviewed`; nie licz jako 2 niezależne |
| **Fałszywa niezależność** | dwa media cytują tę samą depeszę | Wymagaj różnych autorów/agencji lub różnych Tier A; w przeciwnym razie 1 źródło |
| **Archiwalność** | strona sprzed 3 lat jako „dowód teraz” | `isArchival` + limitation; dla bieżących zdarzeń wymagaj świeżości 72 h |
| **Język i morfologia** | „Wisła” vs „Wisły”, „euro” vs „eura” | Stemming 5-znakowy (już jest), normalizacja NFKC; nie polegaj na exact match |
| **Prawnie** | brak atrybucji, kopiowanie całości | Cytat + link + data; respektuj robots/ToS; rate limit 1 req/s; cache |

### 17.1. Zasada „dowód ≠ domena”

Najważniejsze zabezpieczenie przed SEO spamem i przed „autorytetem” rządu: **werdykt wynika
ze zdania**, nie z domeny. Domena może:
- podnieść maksymalną pewność (A/B > C > D),
- zdecydować o kolejności pobierania,
- dostarczyć kandydata.

Domena **nie może**:
- sama ustawić `supports`/`refutes`,
- zastąpić Jev,
- zamienić braku treści w „prawdę”, bo to gov.pl,
- zamienić oceny Demagoga o innej tezie w „fałsz” naszego twierdzenia.
