# Wejście obrazu (multimodalność)

Dokument opisuje, jak Prawdowid przyjmuje zdjęcia i zrzuty ekranu, co z nimi robi
i czego świadomie nie robi. Odpowiada też wprost na pytanie o wymagalność obrazu.

## 1. Czy obraz jest wymagany?

**Nie.** Wymagane jest jedno z:

- `text` — treść doniesienia (do 100 000 znaków),
- `url` — poprawny adres `http://` lub `https://`,
- `image` — zdjęcie/zrzut ekranu jako base64 lub data URL.

Obraz jest funkcją **premium, opcjonalną**. Zgłoszenie bez obrazu działa dokładnie
tak jak wcześniej. Zgłoszenie bez `text`, `url` i `image` kończy się
`needs_clarification` („Podaj treść doniesienia, link do niego albo zdjęcie z tekstem.”).

## 2. Co robimy

1. **Walidacja rozmiaru.** Serwer przyjmuje `image` do 12 000 000 znaków base64
   (schema HTTP). Po zdekodowaniu limit wynosi 8 MB; większy obraz kończy się
   `status: "error"` i komunikatem, że to nie jest werdykt.
2. **OCR.** Tekst jest odczytywany przez `DeepSeekOCRExtract`
   (`src/modules/utils.ts`) z DeepSeek OCR: `POST /v1/tools/ocr` z tym samym
   `DEEPSEEK_API_KEY`, którego używa czat. Akceptowane jest raw base64 oraz
   `data:<mime>;base64,` — format pliku rozpoznaje DeepSeek.
3. **Połączenie wejść.** Jeśli podano też `text`, treść do analizy to
   `OCR + "\n\n" + text`. Jeśli podano `url`, dokument ze strony jest pobierany
   i dołączany po tekście OCR.
4. **Pipeline.** Połączony tekst przechodzi przez zwykły pipeline: ekstrakcja
   twierdzeń, cache, research, werdykty i źródła. `input.kind` = `"image"`,
   a `input.preview` to pierwsze 200 znaków tekstu z OCR.
5. **Ujawnienie ograniczeń.** Każda odpowiedź z obrazem zawiera limitation:
   „Treść odczytana OCR. Obraz nie jest niezależnie weryfikowany; data i metadane
   mogą być nieaktualne.”

Błędy OCR (brak `DEEPSEEK_API_KEY`, błąd HTTP, pusty tekst) zwracają
`status: "error"` z komunikatem „Nie udało się odczytać obrazu. To nie jest
werdykt.” oraz krótkim powodem technicznym (bez URL-i i sekretów). **Błąd
techniczny nigdy nie jest werdyktem.**

## 3. Czego nie robimy

> „Odczytujemy tylko tekst ze zdjęcia (OCR). Nie weryfikujemy autentyczności zdjęcia,
> metadanych ani wcześniejszych wystąpień. Wynik może być niepełny.”

Funkcja jest oznaczona w interfejsie jako **EKSPERYMENTALNE** — to informacja
o zakresie, nie błąd.

- **Reverse image search** — nie szukamy wcześniejszych wystąpień zdjęcia.
- **EXIF i metadane** — nie odczytujemy daty wykonania, urządzenia ani geolokalizacji.
- **Detekcja deepfake / manipulacji** — nie oceniamy, czy obraz jest autentyczny,
  ani czy został zmanipulowany.
- **Weryfikacja autentyczności zdjęcia jako takiego** — sprawdzamy tylko tekst,
  który da się z niego odczytać.
- **Porównywanie obrazów** — brak dopasowywania do wcześniejszych obrazów.

Data widoczna na zrzucie ekranu nie jest traktowana jako dowód daty zdarzenia.

## 4. Koszt, zakres, retencja, ograniczenia

Najważniejsze ograniczenie w jednym zdaniu: odczytujemy tylko tekst ze zdjęcia
(OCR). Nie weryfikujemy autentyczności zdjęcia, metadanych ani wcześniejszych
wystąpień. Wynik może być niepełny.

| Aspekt | Stan |
| --- | --- |
| Koszt | OCR to dodatkowe wywołanie DeepSeek (`/v1/tools/ocr`, rozliczane za stronę); nie jest wliczony w `costUsd` pipeline'u. |
| Rozmiar | base64 ≤ 12M znaków w API, ≤ 8 MB po dekodowaniu. |
| Format | DeepSeek OCR: PNG, JPEG, WebP, GIF, BMP, TIFF, PDF, DOC(X), PPT(X); UI oferuje PNG, JPEG i WebP. |
| Retencja | Obraz nie jest zapisywany przez backend. W logu (`data/logs/verify.jsonl`) ląduje tylko `input.preview` — pierwsze 200 znaków OCR — i `inputKind`. |
| Jakość | OCR myli się przy małym druku, nachyleniu, ciemnych tłach i językach mieszanych. Pusty wynik = błąd, nie „brak twierdzeń”. |
| Zakres | Analizowany jest wyłącznie odczytany tekst. Wykresy, tabele w formie graficznej i podpisy bez tekstu mogą zostać pominięte. |
| Bezpieczeństwo | Treść z obrazu jest danymi, nie instrukcjami — pipeline nadal traktuje ją jako tekst do sprawdzenia. |

## 5. Wideo i audio

- **Audio/wideo nie są częścią MVP** i nie są wymagane.
- W repo istnieje `DeepSeekWrapper.Transcribe` (`src/modules/deepseek.ts`, DeepSeek ASR
  `POST /v1/tools/asr`, WAV PCM / Ogg Opus, limit 8 MiB), ale **nie jest podpięty** do `/verify`.
- Ewentualne rozszerzenie: transkrypcja → ten sam pipeline co tekst.
  Wtedy również obowiązywałaby zasada: błąd ASR to `status: "error"`, nie werdykt.

## 6. Test ręczny

```bash
# domyślny zrzut ekranu z DANE/do_udostępnienia/1
bun run scripts/test-image.ts

# albo własny plik
bun run scripts/test-image.ts "C:\sciezka\do\obrazu.png"
# lub
TEST_IMAGE="C:\sciezka\do\obrazu.png" bun run scripts/test-image.ts
```

Skrypt wypisuje `status`, liczbę twierdzeń, limitations i czas. Nie commituje
ani nie zapisuje obrazu.
