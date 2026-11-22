# PRAWDOWID — materiał zgłoszeniowy

## Zespół

- Nazwa zespołu: **[UZUPEŁNIJ]**
- Tytuł: **PRAWDOWID — weryfikacja doniesień oparta na źródłach**
- Repozytorium: **https://github.com/prawdowid/backend**
- Demo: `bun install && bun run dev` → `http://localhost:3000`

## Opis rozwiązania (limit 4 000 znaków)

PRAWDOWID sprawdza doniesienie w kilkanaście sekund i pokazuje, **na czym opiera odpowiedź**.
Użytkownik wkleja tekst albo link. System wyciąga z niego sprawdzalne twierdzenia (sprowadzone
do relacji podmiot–orzeczenie–obiekt), a następnie szuka dla nich dowodów w korpusie źródeł
urzędowych i fact-checkingowych oraz w Google Fact Check Tools. Wynik to jeden z pięciu
werdyktów: potwierdzone, fałszywe, wprowadzające w błąd, brak wystarczających dowodów albo
nie podlega weryfikacji.

Najważniejsza decyzja projektowa: **system woli się wstrzymać, niż zgadnąć**. Twierdzenie bez
wiarygodnego źródła nie dostaje werdyktu, tylko `insufficient_evidence` wraz z informacją, czego
nie udało się ustalić. Błąd techniczny i prośba o doprecyzowanie są osobnymi statusami, nigdy
werdyktem. Każda teza faktograficzna prowadzi do dowodu: tytułu, wydawcy, daty, linku i fragmentu.
Siła odpowiedzi jest jawna (wysoka/średnia/niska) i wynika z liczby niezależnych źródeł, ich typu
oraz aktualności.

Warstwa czasu jest wbudowana w cache. Wpis pamięta, **od kiedy i do kiedy** jego werdykt obowiązuje.
Dzięki temu „Nawrocki wygrał wybory” przed ogłoszeniem wyniku trafia w wersję fałszywą, a po nim —
w prawdziwą. Materiał archiwalny dostaje ostrzeżenie zamiast być podany jako aktualny.

Rozwiązanie jest modułowe: kanał (WWW, API, zewnętrzny bot Discord) woła tę samą funkcję
weryfikacji, więc wynik jest spójny niezależnie od wejścia. Modele i dostawcy są wymienni przez
konfigurację. Warstwa danych domyślnie działa na plikach, a po ustawieniu `MYSQL_URL` na MySQL:
dokumenty są niezmiennymi wersjami, embeddingi leżą jako `BLOB` (4 KB), a wyszukiwanie odbywa się
w ograniczonym oknie czasowym.

Bezpieczeństwo: treść użytkownika jest traktowana wyłącznie jako dane, instrukcje w materiałach
nie zmieniają zasad systemu, wykryte próby wpływu są raportowane jako ograniczenie. Wejście jest
walidowane, `/verify` ma limit 20 zapytań na minutę, logi maskują e-maile i numery, a sekrety żyją
tylko w `.env`.

Pętla informacji: gdy brak zaufanego źródła, pytanie trafia do spraw moderatora. Podobne pytania
są grupowane po embeddingach; przy trzecim zgłoszeniu system wysyła alert. Rozróżniamy
**rekomendację przekazania** od **faktycznego przekazania** — bez webhooka sprawa pozostaje otwarta
z jawnym powodem.

Koszt: ok. 0,0003–0,001 USD na sprawdzenie, czyli 0,3–1 USD za 1000 zapytań. Mediana odpowiedzi
w testach: kilka sekund. System nie pobiera opłat od użytkownika.

Ograniczenia: to prototyp. Korpus dowodowy jest ograniczony, jakość zależy od dostępności źródeł
i klucza Google Fact Check, a werdykt nie jest opinią prawną. Pełna lista ryzyk i wyniki testów
znajdują się w `docs/EVAL.md` i `README.md`.

## Architektura

```
WWW / API / bot Discord
        │
        ▼
   verifyInput()
        ├─ gate + ekstrakcja claimów (SPO)      DeepSeek v4.1 Flash (OpenRouter)
        ├─ embeddingi                            bge-m3
        ├─ cache z oknami czasu                  pliki JSON / MySQL
        ├─ research                              korpus 135 źródeł + Google Fact Check
        └─ pętla informacji                      sprawy moderatora + alert
        ▼
  VerifyResponse: werdykt, dowody, ograniczenia, siła, koszt, czas
```

## Źródła i licencje

- 135 rekordów, 48 domen, typy: `primary` (104), `secondary` (21), `fact_check` (10).
- Źródła pierwotne: gov.pl, Dziennik Ustaw, Monitor Polski, ISAP, PKW, GUS, NBP, EUR-Lex, NIK, RPO.
- Źródła wtórne i fact-checkingowe: PAP, RMF24, Demagog, AFP Fact Check, EUvsDisinfo, EDMO, NASK.
- Zasady: przechowujemy metadane i **krótkie cytaty** (≤1500 znaków) potrzebne do uzasadnienia;
  pełny tekst tylko dla dokumentów urzędowych/publicznych. Dokumenty urzędowe i urzędowe materiały
  są wyłączone z ochrony autorskiej na podstawie art. 4 pkt 2 ustawy o prawie autorskim; cytaty
  z mediów są krótkie i przypisane do źródła.
- Audyt linków: `bun run scripts/ingest-sources.ts` → `data/sources/audit.json`.

## Wyniki testów

- `bun run scripts/eval.ts` → `data/eval/report.json` (macro-F1, pokrycie i poprawność cytowań,
  wstrzymanie, injection, mediana, koszt).
- `bun run scripts/e2e.ts` → E2E i spójność kanałów.
- `bun run scripts/ui-check.ts` → dostępność interfejsu.
- Szczegóły: `docs/EVAL.md`.

## Ryzyka

1. **Halucynacje** — model tylko ekstrahuje i porównuje; werdykt bez dowodu jest niemożliwy.
2. **Stronniczość źródeł** — typ źródła jest jawny, a samo pochodzenie nie przesądza werdyktu.
3. **Aktualność** — okna ważności i ostrzeżenia o materiale archiwalnym; recheck po stronie schedulera.
4. **Prompt injection** — separacja danych, heurystyka, testy w zestawie ewaluacyjnym.
5. **Prywatność** — maskowanie PII w logach, retencja (`scripts/cleanup.ts`), brak przechowywania sesji.
6. **Dostępność i nadużycia** — rate limit, limity wejścia, czytelny interfejs, komunikaty błędów.
7. **Zależności zewnętrzne** — OpenRouter, Jina, Google; awaria kończy się statusem `error`, nie werdyktem.

## Ograniczenia demonstracji

- Drugi kanał (Discord) jest w osobnym repozytorium i korzysta z `POST /verify`.
- Klucz `GOOGLE_FACT_CHECK_API_KEY` musi być ustawiony, aby system mógł wydawać werdykty
  potwierdzające/obalające na podstawie fact-checków.
- Multimodalność (OCR, transkrypcja) jest przygotowana w modułach, ale nie jest częścią ścieżki MVP.
