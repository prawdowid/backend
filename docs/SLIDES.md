# Slajdy (12) — PRAWDOWID

1. **Tytuł** — PRAWDOWID. „Weryfikacja, która pokazuje źródła i umie się wycofać.”
   Zespół, hackathon, data.
2. **Problem** — FIMI i lawina doniesień; obywatel nie ma czasu ani warsztatu, by sprawdzać.
   Ręczne fact-checkowanie nie skaluje się.
3. **Kto jest użytkownikiem** — obywatel bez kompetencji cyfrowych; analityk/moderator jako
   odbiorca alertów; redakcja jako odbiorca API.
4. **Zasada** — pięć werdyktów i twarde „nie wiem”. Werdykt bez dowodu jest zakazany.
   Błąd techniczny ≠ werdykt.
5. **Jak działa** — schemat: tekst/URL → claimy (SPO) → korpus + Google → werdykt + dowody.
   Model: DeepSeek Flash (ekstrakcja, bramka, dopasowanie) + lokalne embeddingi hashowe.
6. **Dowody** — tytuł, wydawca, data, link, fragment; siła z liczby niezależnych źródeł.
   Zrzut z odpowiedzi `/verify`.
7. **Czas i cache** — okna `validFrom/validUntil`; przykład „Nawrocki wygrał wybory”
   przed i po ogłoszeniu wyniku; ostrzeżenie o archiwum.
8. **Pętla informacji** — nierozstrzygnięte pytania grupowane po embeddingach; sprawa moderatora;
   alert po 3. zgłoszeniu; rekomendacja vs faktyczne przekazanie.
9. **Bezpieczeństwo** — dane vs instrukcje, detekcja injection, walidacja, rate limit,
   maskowanie PII, sekrety poza repo.
10. **Skala i koszt** — MySQL: 135 źródeł → ~40k claimów po dedupe ≈ 250 MB; 0,3–1 USD/1000 zapytań;
    Redis tylko jako warstwa ulotna.
11. **Wyniki testów** — tabela: macro-F1, pokrycie cytowań, wstrzymanie, injection, mediana, koszt,
    E2E, spójność kanałów. Liczby z `data/eval/report.json`.
12. **Co dalej / ryzyka** — pełny ingest dokumentów, ANN przy >100k claimów, OCR/ASR,
    licencje i retencja, pilotaż w trybie wspierania decyzji (człowiek zatwierdza publikację).

## Demo (slajd 6/7)

1. `POST /verify` z prawdziwym twierdzeniem → werdykt + źródła.
2. To samo twierdzenie drugi raz → cache, czas spada.
3. Twierdzenie bez dowodów → `insufficient_evidence`, nie „prawda”.
4. Tekst z injection → claim wyciągnięty, instrukcja zignorowana, ograniczenie w odpowiedzi.
5. Trzy razy to samo bez dowodów → `GET /cases` pokazuje sprawę i rekomendację alertu.
