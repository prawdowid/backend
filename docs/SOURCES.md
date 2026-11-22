# Å¹rÃ³dÅ‚a danych i licencje

Ten dokument opisuje, skÄ…d PRAWDOWID bierze dowody, jak je odÅ›wieÅ¼a i co wolno z nich publikowaÄ‡.
Lista ÅºrÃ³deÅ‚ w kodzie: `src/sources/manifest.ts` (pole `type` decyduje o sile dowodu, nie o werdykcie).

## Zasada nadrzÄ™dna

- PeÅ‚ny tekst trzymamy tylko dla dokumentÃ³w urzÄ™dowych i publicznych z jasnÄ… licencjÄ….
- Dla prasy, fact-checkerÃ³w i Wikipedii zapisujemy **krÃ³tki fragment (â‰¤ 1500 znakÃ³w), metadane i link** â€”
  bez redystrybucji caÅ‚ego artykuÅ‚u.
- Typ ÅºrÃ³dÅ‚a (`primary` / `secondary` / `fact_check`) jest jawny w odpowiedzi API. Pochodzenie ÅºrÃ³dÅ‚a
  nigdy samo nie przesÄ…dza werdyktu â€” decydujÄ… treÅ›Ä‡ i bramka Jev.

## Lista ÅºrÃ³deÅ‚

| Å¹rÃ³dÅ‚o | Typ | Licencja / warunki uÅ¼ycia | Aktualizacja |
|---|---|---|---|
| Dziennik Ustaw, Monitor Polski (dziennikustaw.gov.pl, monitorpolski.gov.pl) | `primary` | Dokumenty urzÄ™dowe â€” wyÅ‚Ä…czone z ochrony prawa autorskiego (art. 4 pr. aut.) | manifest rÄ™cznie, audyt linkÃ³w |
| ISAP (isap.sejm.gov.pl) | `primary` | Dokumenty urzÄ™dowe â€” jak wyÅ¼ej | manifest rÄ™cznie, audyt linkÃ³w |
| gov.pl (ministerstwa, KPRM) | `primary` | Dokumenty urzÄ™dowe i materiaÅ‚y informacyjne â€” jak wyÅ¼ej | manifest rÄ™cznie, audyt linkÃ³w |
| PKW (pkw.gov.pl) | `primary` | Dokumenty urzÄ™dowe (wyniki, obwieszczenia) | manifest rÄ™cznie, audyt linkÃ³w |
| GUS (stat.gov.pl) | `primary` | Dane i publikacje urzÄ™dowe; cytat + link | manifest rÄ™cznie, audyt linkÃ³w |
| NBP (nbp.pl) | `primary` | Publikacje i dane banku centralnego; cytat + link | manifest rÄ™cznie, audyt linkÃ³w |
| NIK, RPO | `primary` | Dokumenty urzÄ™dowe (kontrola, wystÄ…pienia) | manifest rÄ™cznie, audyt linkÃ³w |
| EUR-Lex | `primary` | Decyzja 2011/833/UE â€” ponowne uÅ¼ycie z podaniem ÅºrÃ³dÅ‚a | manifest rÄ™cznie, audyt linkÃ³w |
| PAP, RMF24 | `secondary` | Â© wydawca â€” tylko cytat, metadane i link | manifest rÄ™cznie, audyt linkÃ³w |
| Demagog | `fact_check` | Â© wydawca â€” cytat oceny, metadane i link | manifest rÄ™cznie, audyt linkÃ³w |
| AFP Fact Check | `fact_check` | Â© AFP â€” cytat oceny, metadane i link | manifest rÄ™cznie, audyt linkÃ³w |
| EUvsDisinfo (EEAS) | `fact_check` | Decyzja 2011/833/UE â€” ponowne uÅ¼ycie z atrybucjÄ…; w repo tylko `claim`/`fact` (fragment) + link | snapshot MCP (patrz niÅ¼ej) |
| EDMO, NASK | `fact_check` | Â© organizacja â€” cytat, metadane i link | manifest rÄ™cznie, audyt linkÃ³w |
| Wikipedia (pl) | `secondary` | CC BY-SA 4.0 â€” atrybucja + link do artykuÅ‚u | live API przy zapytaniu, bez ingestu |
| Google Fact Check Tools API | `fact_check` | Warunki Google API; zwracamy cytat oceny i link do recenzji | live API przy zapytaniu |

Audyt linkÃ³w w manifeÅ›cie:

```bash
bun run scripts/ingest-sources.ts   # zapisuje data/sources/audit.json
```

## EUvsDisinfo â€” lokalny snapshot z MCP

Serwer MCP EUvsDisinfo udostÄ™pnia **tylko listy** (`articles`, `cases`) z paginacjÄ…
`offset`/`limit` (maks. 100 na stronÄ™; ok. 19 248 przypadkÃ³w). Nie ma wyszukiwania, wiÄ™c:

1. `scripts/ingest-euvsdisinfo.ts` pobiera snapshot przez streamable HTTP (`POST /mcp`),
2. snapshot lÄ…duje w `data/euvsdisinfo/cases.ndjson` (jeden JSON na liniÄ™, `data/` jest w `.gitignore`),
3. runtime (`src/research/euvsdisinfo.ts`) czyta ten plik i **nie potrzebuje tokenu**.

```bash
# .env: EUVD_TOKEN=<token do MCP>  (opcjonalnie EUVD_MCP_URL, EUVD_LIMIT)
EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
EUVD_LIMIT=5000 EUVD_TOKEN=... bun run scripts/ingest-euvsdisinfo.ts
```

| Zmienna | Znaczenie | DomyÅ›lnie |
|---|---|---|
| `EUVD_TOKEN` | token do MCP (nagÅ‚Ã³wek `Authorization: Bearer â€¦`) | brak â€” ingest koÅ„czy siÄ™ kodem 1 |
| `EUVD_MCP_URL` | endpoint MCP | `https://mcp.euvsd.info/mcp` |
| `EUVD_LIMIT` | ile przypadkÃ³w pobraÄ‡ (1â€“19 248) | `2000` |
| `EUVD_CASES_FILE` | Å›cieÅ¼ka snapshotu dla runtime | `data/euvsdisinfo/cases.ndjson` |

Format rekordu: `{ id, title, claim, fact, date (epoch s), url }`.
Przypadki bez `fact` sÄ… zapisywane, ale runtime ich nie uÅ¼yje â€” bez sprostowania moglibyÅ›my tylko
powtÃ³rzyÄ‡ faÅ‚szywe twierdzenie.

Zachowanie przy bÅ‚Ä™dach:

- brak `EUVD_TOKEN` â†’ czytelny komunikat i kod wyjÅ›cia 1, bez stack trace,
- 401 â†’ komunikat o tokenie; 0 pobranych przypadkÃ³w â†’ **nie nadpisujemy** istniejÄ…cego snapshotu,
- zapis jest atomowy (`cases.ndjson.tmp` â†’ `cases.ndjson`),
- paginacja koÅ„czy siÄ™ na `hasNextPage: false`, na krÃ³tkiej stronie albo po dwÃ³ch stronach bez nowych
  wierszy (zabezpieczenie przed serwerem ignorujÄ…cym `offset`).

## Ograniczenia EUvsDisinfo

- **Token**: MCP wymaga klucza API; nie trzymamy go w repo. Bez tokenu nie da siÄ™ odÅ›wieÅ¼yÄ‡ snapshotu,
  ale runtime dziaÅ‚a dalej na ostatnim pobranym pliku.
- **Brak wyszukiwania w MCP**: dopasowanie robimy lokalnie â€” tokeny (prefix 5 znakÃ³w, normalizacja
  NFKC), prÃ³g pokrycia 0,5, a potem bramka Jev (`noul â‰¥ 0,8`) na â€žczy to ta sama tezaâ€. To celowo
  konserwatywne: wolimy pominÄ…Ä‡ przypadek niÅ¼ przypiÄ…Ä‡ cudzy.
- **JÄ™zyk i zasiÄ™g**: baza jest angielska i skupiona na dezinformacji wymierzonej w UE, wiÄ™c polskie
  twierdzenie moÅ¼e nie mieÄ‡ odpowiednika. **Brak przypadku â‰  dowÃ³d prawdy.**
- **ÅšwieÅ¼oÅ›Ä‡**: snapshot to kopia z dnia ingestu. Publikacja nowych przypadkÃ³w wymaga rÄ™cznego
  uruchomienia skryptu (brak schedulera).
- **Dopasowanie tekstowe**: bez embeddingÃ³w, opiera siÄ™ na wspÃ³Å‚dzielonych tokenach. Parafrazy o innym
  sÅ‚ownictwie mogÄ… nie trafiÄ‡; decyduje bramka Jev, nie sam wynik tokenowy.

## Aktualizacja listy ÅºrÃ³deÅ‚

1. Dopisz rekord do `src/sources/manifest.ts` (id, url, type, lang, summary, topics).
2. Uruchom `bun run scripts/ingest-sources.ts` i sprawdÅº `data/sources/audit.json`.
3. `node node_modules/typescript/bin/tsc --noEmit` musi przechodziÄ‡ bez bÅ‚Ä™dÃ³w.

