# Źródła danych i licencje

Ten dokument opisuje, skąd PRAWDOWID bierze dowody, jak je odświeża i co wolno z nich publikować.
Lista źródeł w kodzie: `src/sources/manifest.ts` (pole `type` decyduje o sile dowodu, nie o werdykcie).

## Zasada nadrzędna

- Pełny tekst trzymamy tylko dla dokumentów urzędowych i publicznych z jasną licencją.
- Dla prasy, fact-checkerów i Wikipedii zapisujemy **krótki fragment (≤ 1500 znaków), metadane i link** —
  bez redystrybucji całego artykułu.
- Typ źródła (`primary` / `secondary` / `fact_check`) jest jawny w odpowiedzi API. Pochodzenie źródła
  nigdy samo nie przesądza werdyktu — decydują treść i bramka Jev.

## Lista źródeł

| Źródło | Typ | Licencja / warunki użycia | Aktualizacja |
|---|---|---|---|
| Dziennik Ustaw, Monitor Polski (dziennikustaw.gov.pl, monitorpolski.gov.pl) | `primary` | Dokumenty urzędowe — wyłączone z ochrony prawa autorskiego (art. 4 pr. aut.) | manifest ręcznie, audyt linków |
| ISAP (isap.sejm.gov.pl) | `primary` | Dokumenty urzędowe — jak wyżej | manifest ręcznie, audyt linków |
| gov.pl (ministerstwa, KPRM) | `primary` | Dokumenty urzędowe i materiały informacyjne — jak wyżej | manifest ręcznie, audyt linków |
| PKW (pkw.gov.pl) | `primary` | Dokumenty urzędowe (wyniki, obwieszczenia) | manifest ręcznie, audyt linków |
| GUS (stat.gov.pl) | `primary` | Dane i publikacje urzędowe; cytat + link | manifest ręcznie, audyt linków |
| NBP (nbp.pl) | `primary` | Publikacje i dane banku centralnego; cytat + link | manifest ręcznie, audyt linków |
| NIK, RPO | `primary` | Dokumenty urzędowe (kontrola, wystąpienia) | manifest ręcznie, audyt linków |
| EUR-Lex | `primary` | Decyzja 2011/833/UE — ponowne użycie z podaniem źródła | manifest ręcznie, audyt linków |
| PAP, RMF24 | `secondary` | © wydawca — tylko cytat, metadane i link | manifest ręcznie, audyt linków |
| Demagog | `fact_check` | © wydawca — cytat oceny, metadane i link | manifest ręcznie, audyt linków |
| AFP Fact Check | `fact_check` | © AFP — cytat oceny, metadane i link | manifest ręcznie, audyt linków |
| EUvsDisinfo (EEAS) | `fact_check` | Decyzja 2011/833/UE — ponowne użycie z atrybucją; w repo tylko `claim`/`fact` (fragment) + link | snapshot MCP (patrz niżej) |
| EDMO, NASK | `fact_check` | © organizacja — cytat, metadane i link | manifest ręcznie, audyt linków |
| Wikipedia (pl) | `secondary` | CC BY-SA 4.0 — atrybucja + link do artykułu | live API przy zapytaniu, bez ingestu |
| Google Fact Check Tools API | `fact_check` | Warunki Google API; zwracamy cytat oceny i link do recenzji | live API przy zapytaniu |

Audyt linków w manifeście:

```bash
bun run scripts/ingest-sources.ts   # zapisuje data/sources/audit.json
```

## EUvsDisinfo — lokalny snapshot z MCP

Serwer MCP EUvsDisinfo udostępnia **tylko listy** (`articles`, `cases`) z paginacją
`offset`/`limit` (maks. 100 na stronę; ok. 19 248 przypadków). Nie ma wyszukiwania, więc:

1. `scripts/ingest-euvsdisinfo.ts` pobiera snapshot przez streamable HTTP (`POST /mcp`),
2. snapshot ląduje w `data/euvsdisinfo/cases.ndjson` (jeden JSON na linię, `data/` jest w `.gitignore`),
3. runtime (`src/research/euvsdisinfo.ts`) czyta ten plik i **nie potrzebuje tokenu**.

```bash
# .env: EUVD_TOKEN=<token do MCP>  (opcjonalnie EUVD_MCP_URL, EUVD_LIMIT)
EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
EUVD_LIMIT=5000 EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
```

| Zmienna | Znaczenie | Domyślnie |
|---|---|---|
| `EUVD_TOKEN` | token do MCP (nagłówek `Authorization: Bearer …`) | brak — ingest kończy się kodem 1 |
| `EUVD_MCP_URL` | endpoint MCP | `https://euvsdisinfo-mcp-server.vercel.app/mcp` |
| `EUVD_LIMIT` | ile przypadków pobrać (1–19 248) | `2000` |
| `EUVD_CASES_FILE` | ścieżka snapshotu dla runtime | `data/euvsdisinfo/cases.ndjson` |

Format rekordu: `{ id, title, claim, fact, date (epoch s), url }`.
Przypadki bez `fact` są zapisywane, ale runtime ich nie użyje — bez sprostowania moglibyśmy tylko
powtórzyć fałszywe twierdzenie.

Zachowanie przy błędach:

- brak `EUVD_TOKEN` → czytelny komunikat i kod wyjścia 1, bez stack trace,
- 401 → komunikat o tokenie; 0 pobranych przypadków → **nie nadpisujemy** istniejącego snapshotu,
- zapis jest atomowy (`cases.ndjson.tmp` → `cases.ndjson`),
- paginacja kończy się na `hasNextPage: false`, na krótkiej stronie albo po dwóch stronach bez nowych
  wierszy (zabezpieczenie przed serwerem ignorującym `offset`).

## Ograniczenia EUvsDisinfo

- **Token**: MCP wymaga klucza API; nie trzymamy go w repo. Bez tokenu nie da się odświeżyć snapshotu,
  ale runtime działa dalej na ostatnim pobranym pliku.
- **Brak wyszukiwania w MCP**: dopasowanie robimy lokalnie — tokeny (prefix 5 znaków, normalizacja
  NFKC), próg pokrycia 0,5, a potem bramka Jev (`noul ≥ 0,8`) na „czy to ta sama teza”. To celowo
  konserwatywne: wolimy pominąć przypadek niż przypiąć cudzy.
- **Język i zasięg**: baza jest angielska i skupiona na dezinformacji wymierzonej w UE, więc polskie
  twierdzenie może nie mieć odpowiednika. **Brak przypadku ≠ dowód prawdy.**
- **Świeżość**: snapshot to kopia z dnia ingestu. Publikacja nowych przypadków wymaga ręcznego
  uruchomienia skryptu (brak schedulera).
- **Dopasowanie tekstowe**: bez embeddingów, opiera się na współdzielonych tokenach. Parafrazy o innym
  słownictwie mogą nie trafić; decyduje bramka Jev, nie sam wynik tokenowy.

## Aktualizacja listy źródeł

1. Dopisz rekord do `src/sources/manifest.ts` (id, url, type, lang, summary, topics).
2. Uruchom `bun run scripts/ingest-sources.ts` i sprawdź `data/sources/audit.json`.
3. `node node_modules/typescript/bin/tsc --noEmit` musi przechodzić bez błędów.
