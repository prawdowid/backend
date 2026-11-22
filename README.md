# PRAWDOWID — backend weryfikacji doniesień oparty na źródłach

PRAWDOWID przyjmuje tekst, adres URL, a także obraz z tekstem, rozkłada przekaz na sprawdzalne twierdzenia i zwraca werdykt wraz z dowodami. Wiarygodność wyniku nie wynika z deklarowanej pewności modelu: każda rozstrzygnięta teza ma prowadzić do cytatu, daty, wydawcy i adresu źródła, a brak wystarczającego dowodu prowadzi do wstrzymania werdyktu.

To prototyp hackathonowy, którego działanie, metryki i granice są opisane w repozytorium. Nie jest opinią prawną ani zastępstwem dla analizy eksperckiej.

## Dlaczego to ważne

Dezinformacja często korzysta z prawdziwie brzmiących fragmentów: przywołuje instytucje, liczby lub wydarzenia, ale pomija czas, kontekst albo źródło. W polskim obiegu informacyjnym sprawdzenie twierdzeń dotyczących prawa, wyborów, danych publicznych czy polityki zagranicznej powinno w pierwszej kolejności sięgać do źródeł właściwych dla danej sprawy — na przykład aktów prawnych, komunikatów urzędowych, danych statystyki publicznej albo obwieszczeń wyborczych.

PRAWDOWID nie traktuje odpowiedzi modelu językowego jako dowodu. Używa modelu do technicznych etapów przetwarzania tekstu, natomiast wynik przedstawia z materiałem źródłowym i jego metadanymi. Dzięki temu odbiorca może samodzielnie ocenić podstawę wniosku oraz sprawdzić jej aktualność.

## Jak działa

1. **Wejście.** API przyjmuje tekst, URL lub obraz z tekstem. Tekst pod wskazanym URL jest odczytywany przed dalszym przetwarzaniem; dla obrazu stosowany jest OCR, a odpowiedź zawiera ograniczenie dotyczące niepewności metadanych obrazu.
2. **Ekstrakcja twierdzeń.** Przekaz jest dzielony na atomowe relacje podmiot–orzeczenie–obiekt (SPO). Zdania złożone są rozbijane na odrębne twierdzenia, aby nie przypisać jednego dowodu do kilku różnych tez.
3. **Cache zależny od czasu.** Najpierw system szuka dokładnego klucza twierdzenia, potem używa embeddingów do utworzenia krótkiej listy podobnych wpisów. Każdy wpis może mieć granice `validFrom` i `validUntil`; dopasowanie uwzględnia datę materiału (`asOf`) albo bieżącą datę.
4. **Research.** Dla twierdzeń nieznalezionych w cache przeszukiwane są źródła z manifestu, lokalny korpus dokumentów oraz — po skonfigurowaniu — Google Fact Check Tools. Lokalne snapshoty EUvsDisinfo są przeszukiwane bez tokenu w czasie działania; token jest potrzebny jedynie do ich odświeżenia.
5. **Werdykt i dowody.** Odpowiedź zawiera werdykt dla każdego twierdzenia, uzasadnienie, ograniczenia, siłę odpowiedzi i listę dowodów. **Brak dowodu oznacza wstrzymanie, a nie zgadywanie**: system zwraca wtedy `insufficient_evidence`.

### Werdykty i statusy

Werdykt twierdzenia ma jedną z wartości:

`confirmed` · `false` · `misleading` · `insufficient_evidence` · `not_verifiable`

`error` (błąd techniczny) oraz `needs_clarification` (potrzeba doprecyzowania) są statusami obsługi żądania, a nie werdyktami. Awaria zależności zewnętrznej kończy się statusem `error`, nie twierdzeniem o prawdziwości lub fałszywości informacji.

## Dlaczego dane są dokładne i możliwe do zweryfikowania

### Hierarchia i ślad dowodowy

Manifest `src/sources/manifest.ts` zawiera **135 pozycji**: **104** źródła `primary`, **21** `secondary` i **10** `fact_check`. Typ opisuje charakter źródła i jest jawny w odpowiedzi; sam w sobie nie przesądza o werdykcie.

- **`primary`** — przede wszystkim źródła urzędowe i publiczne, m.in. Gov.pl, Dziennik Ustaw, Monitor Polski, ISAP, PKW, GUS, NBP, MSZ oraz EUR-Lex;
- **`secondary`** — materiały pomocnicze i informacyjne, używane z oznaczeniem ich charakteru;
- **`fact_check`** — publikacje i bazy weryfikacyjne, m.in. Demagog, AFP Fact Check, EUvsDisinfo, EDMO i Google Fact Check Tools.

Każdy dowód zwracany przez API zawiera tytuł, wydawcę, datę publikacji, datę pobrania, URL, fragment cytowany oraz relację z twierdzeniem (`supports`, `refutes` lub `context`). W przypadku treści prasowych i fact-checkingowych system przechowuje krótkie fragmenty, a nie pełne artykuły.

### Czas, konflikty i wstrzymanie

Wpis cache nie jest bezterminową odpowiedzią. Pola `validFrom` i `validUntil` określają, kiedy dana propozycja obowiązuje, co pozwala rozróżniać stan sprzed i po zdarzeniu. Materiał archiwalny powinien być oceniany w odniesieniu do swojej daty, a nie wyłącznie do stanu bieżącego.

Gdy źródła nie pozwalają rzetelnie potwierdzić ani obalić tezy, odpowiedzią jest `insufficient_evidence`. Werdykt `misleading` służy m.in. sytuacjom, gdy rdzeń przekazu jest częściowo prawdziwy, lecz istotny kwalifikator lub kontekst są niezgodne z dowodami. System nie przedstawia braku publikacji w bazie jako dowodu prawdziwości.

### Ewaluacja

W ostatnim udokumentowanym przebiegu z **22 listopada 2026 r.** (cold cache) zestaw ewaluacyjny obejmował 30 przypadków, z czego 24 wchodziły do oceny accuracy i macro-F1. Wyniki zapisane w [`docs/EVAL.md`](docs/EVAL.md) to:

| Metryka | Wynik |
|---|---:|
| accuracy (24 oceniane przypadki) | 75,0% (18/24) |
| macro-F1 | 0,767 |
| wstrzymanie przy braku dowodów | 100% (6/6) |
| pokrycie cytowań | 100% (45/45) |
| wykrycie prompt injection | 100% (4/4) |
| mediana odpowiedzi | 6 031 ms |
| p95 | 15 661 ms |
| E2E | 19/19 |

Wynik zależy od lokalnych danych, sieci i dostępności dostawców. Ekstrakcja twierdzeń nie jest w pełni deterministyczna; dokumentacja opisuje wprost, że między uruchomieniami możliwa jest różnica 1–2 przypadków.

## Dlaczego lookupy są tanie

Ścieżka jest **cache-first**. Dokładne trafienie omija ponowny research, a embeddingi tworzą krótką listę kandydatów zamiast porównywania każdego twierdzenia z całym cache. Lokalny korpus i lokalny snapshot EUvsDisinfo ograniczają liczbę zapytań do usług zewnętrznych.

Trafienie w cache nie oznacza kosztu zerowego: ekstrakcja twierdzeń jest wykonywana zawsze, podobnie jak embeddingi niezbędne do dopasowania. Pozwala jednak pominąć research (w tym Google, Wikidata, Wikipedię i EUvsDisinfo) oraz bramki porównujące twierdzenia. Przy skutecznym trafieniu nie ma dodatkowego lookupu researchowego do płatnego API; koszt samej ekstrakcji lub embeddingów może pozostać.

Pomiar pięciu przypadków w [`docs/EVAL.md`](docs/EVAL.md) wykazał łączny koszt **0,003269 USD** dla cold cache i **0,002121 USD** dla warm cache, czyli spadek o **35,1%**. W ostatnim przebiegu ewaluacji koszt cold wyniósł **0,000473 USD na zapytanie** (około **0,047 USD / 100**). Dla krótkich przypadków w osobnym pomiarze warm cache redukował koszt o 77–83%; dla długiego artykułu bez zcache’owanych, rozstrzygniętych twierdzeń oszczędność nie wystąpiła.

## Architektura

```text
WWW / API / zewnętrzny bot Discord
                │
                ▼
          POST /verify
                │
                ▼
          verifyInput()
                │
                ├── ekstrakcja atomowych twierdzeń SPO
                ├── embeddingi bge-m3 i shortlist kandydatów
                ├── cache z oknami validFrom / validUntil
                │   └── pliki JSON domyślnie lub MySQL po ustawieniu MYSQL_URL
                ├── research: manifest, lokalny korpus, EUvsDisinfo,
                │   Google Fact Check Tools (opcjonalnie)
                └── pętla informacji dla spraw nierozstrzygniętych
                │
                ▼
 VerifyResponse: werdykty, dowody, ograniczenia, siła, koszt i czas
```

Kanały WWW i API korzystają z tej samej funkcji `verifyInput`; zewnętrzny bot Discord jest utrzymywany w osobnym repozytorium i wywołuje `POST /verify`. W testach E2E odnotowano identyczne werdykty dla kanałów web/API.

### Endpointy

| Metoda | Ścieżka | Opis |
|---|---|---|
| `POST` | `/verify` | Przyjmuje `{ text?, url?, image?, channel? }` i zwraca `VerifyResponse`. |
| `GET` | `/health` | Stan procesu, czas działania i wersja. |
| `GET` | `/metrics` | Liczniki, p50/p95 i średni koszt. |
| `GET` | `/cases` | Nierozstrzygnięte sprawy moderatora. |
| `POST` | `/cases/:id/ack` | Potwierdzenie przejęcia sprawy przez moderatora. |
| `GET` | `/docs` | Dokumentacja Swagger (jedyne UI serwowane przez backend). |

`POST /verify` ma limit **20 zapytań na minutę na adres IP**. Limit jest pamięciowy i przeznaczony dla demonstracji, nie jest rozproszonym mechanizmem produkcyjnym.

## Szybki start

Wymagany jest [Bun](https://bun.sh/) oraz klucz `OPENROUTER_API_KEY`.

```bash
bun install
cp .env.example .env
# uzupełnij OPENROUTER_API_KEY w pliku .env
bun run dev
```

Serwer domyślnie działa pod adresem `http://localhost:3000`. Backend nie serwuje własnego UI — jedynym interfejsem jest Swagger pod `/docs`. Interfejs użytkownika to osobna aplikacja frontendowa.

### Konfiguracja środowiska

Najważniejsze zmienne z [`.env.example`](.env.example):

| Zmienna | Rola | Wymagana |
|---|---|---|
| `OPENROUTER_API_KEY` | ekstrakcja, bramka porównująca i embeddingi | tak |
| `GOOGLE_FACT_CHECK_API_KEY` | dowody z Google Fact Check Tools | nie |
| `MYSQL_URL` | MySQL zamiast domyślnego cache’u plikowego | nie |
| `EUVD_TOKEN` | odświeżenie lokalnego snapshotu EUvsDisinfo | tylko do ingestu |
| `MODERATOR_WEBHOOK_URL` | powiadomienie o powtarzających się sprawach | nie |
| `PORT` | port serwera; domyślnie `3000` | nie |

Bez klucza Google system działa, ale raportuje ograniczenie. Runtime nie potrzebuje tokenu EUvsDisinfo, jeśli lokalny snapshot już istnieje.

### Demo API

```bash
curl -s localhost:3000/verify -H 'content-type: application/json' \
  -d '{"text":"Rafał Brzoska został postrzelony w Warszawie."}' | jq
```

Podstawowe sprawdzenie typów:

```bash
bun run typecheck
```

Skrypty ewaluacji i pomiaru kosztu opisuje [`docs/EVAL.md`](docs/EVAL.md).

## Ograniczenia i bezpieczeństwo

- **Brak dowodu nie jest rozstrzygnięciem.** System zwraca `insufficient_evidence`, gdy nie ma podstaw do uczciwego potwierdzenia lub obalenia tezy.
- **Ograniczony korpus.** Nie każde twierdzenie ma odpowiednik w lokalnych źródłach lub bazie fact-checkingowej. Brak przypadku w EUvsDisinfo nie jest dowodem prawdziwości.
- **Aktualność danych.** Cache ma okna ważności, lecz automatyczny scheduler ponownych sprawdzeń nie jest obecnie podłączony. Snapshot EUvsDisinfo wymaga ręcznego odświeżenia.
- **Zależności zewnętrzne.** Dostępność OpenRoutera, usług embeddingów, OCR oraz opcjonalnych źródeł zewnętrznych wpływa na możliwość przeprowadzenia sprawdzenia.
- **Prompt injection.** Treść użytkownika jest umieszczana jako dane, a nie instrukcje; heurystyka wykrywa próby wpływu i dodaje ograniczenie do odpowiedzi. Nie przeprowadzono pełnego red-teamingu.
- **Dane osobowe.** Logi zawierają treść zgłoszenia. Przed wdrożeniem produkcyjnym potrzebne są polityka retencji i maskowanie danych osobowych; w materiałach zgłoszeniowych wskazano maskowanie e-maili i numerów oraz skrypt czyszczący.
- **Limity wejścia.** Tekst może mieć do 100 000 znaków; obraz PNG/JPEG/WebP — do 8 MB po zdekodowaniu. Odczyt OCR nie jest niezależną weryfikacją obrazu ani jego metadanych.
- **Moderacja.** Po trzecim podobnym zgłoszeniu system zapisuje alert i może wywołać webhook. Bez webhooka sprawa pozostaje otwarta z jawną rekomendacją przekazania — system nie deklaruje przekazania, którego nie wykonał.

## Źródła i licencje

Pełny wykaz źródeł, zasady aktualizacji, format lokalnego snapshotu oraz warunki ponownego użycia opisano w [`docs/SOURCES.md`](docs/SOURCES.md). W skrócie:

- pełne teksty są przechowywane tylko dla dokumentów urzędowych i publicznych o jasnych zasadach użycia;
- dla prasy, fact-checkerów i Wikipedii przechowywany jest cytat do 1500 znaków, metadane i link, bez redystrybucji całego artykułu;
- dokumenty urzędowe są traktowane zgodnie z zasadami wskazanymi w dokumentacji źródeł, a materiały EUR-Lex i EUvsDisinfo wymagają atrybucji;
- audyt linków manifestu można uruchomić poleceniem `bun run scripts/ingest-sources.ts`; wynik trafia do `data/sources/audit.json`.

---

**Zespół:** KN Neuron Prawdowid, UMG — Wydział Informatyczny

**Wydarzenie:** HackNation 2026

**Challenge:** Ministerstwo Spraw Zagranicznych
