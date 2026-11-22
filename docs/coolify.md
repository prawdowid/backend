# Wdrożenie w Coolify (backend + frontend jako dwie aplikacje)

Ten dokument opisuje wdrożenie PRAWDOWID na Coolify w wariancie, który działa:
**dwie osobne aplikacje**, każda z własnego repozytorium.

## 1. Dlaczego nie da się wdrożyć `docker-compose.yml`

Dotychczasowy błąd przy `docker compose build`:

```
unable to prepare context: path "/artifacts/frontend" not found
```

Przyczyna: `docker-compose.yml` ma serwis `frontend` z `build.context: ../frontend`.
Coolify klonuje **tylko jedno repo** (tu: backend) do katalogu `/artifacts/<uuid>`,
więc katalogu `../frontend` tam nie ma i budowanie kontekstu wywala cały compose.

Rozwiązanie: backend ma własny plik `docker-compose.coolify.yml` z **jednym**
serwisem (`backend`), a frontend jest **drugą aplikacją** w Coolify, zbudowaną
ze swojego repo (`prawdowid/frontend`) i własnego `Dockerfile`.
Plik `docker-compose.yml` zostaje bez zmian — dalej służy do lokalnego
`docker compose up --build` z oboma serwisami obok siebie.

## 2. Architektura po wdrożeniu

```
przeglądarka
   │  HTTPS
   ▼
frontend (Next.js, port 3001)  ── /api/analyze ──►  backend (Bun/Elysia, port 3000)
   np. https://prawdowid.org                          np. https://api.prawdowid.org
```

- Przeglądarka gada **tylko** z frontendem. Frontend ma route handler
  `src/app/api/analyze/route.ts`, który po stronie serwera woła backend
  (`BACKEND_API_URL`) i tłumaczy odpowiedź `/verify` na kontrakt UI.
- Dzięki temu **CORS nie jest potrzebny** — dopóki
  `NEXT_PUBLIC_ANALYSIS_API_URL=/api/analyze` (czyli przeglądarka woła własny origin).
- Porty: backend **3000**, frontend **3001**. Nazwy są zaszyte w `Dockerfile`,
  `EXPOSE` i komendach startowych — nie zmieniaj ich bez zmiany tych plików.

## 3. Aplikacja 1 — backend

Nowa aplikacja w Coolify, typ **Docker Compose** (nie „Nixpacks”, nie „Dockerfile”).

| Pole w Coolify | Wartość |
| --- | --- |
| Repository | `prawdowid/backend` (to repo) |
| Branch | `main` |
| Build Pack | **Docker Compose** |
| Base Directory | `/` |
| Docker Compose Location | `/docker-compose.coolify.yml` |
| Port aplikacji / port domeny | `3000` |

Nazwa pliku jest istotna: **nie** zostawiaj domyślnego `/docker-compose.yml`,
bo wróci błąd z punktu 1.

### Domena i port

- Kontener nasłuchuje na **3000** (`ports: 3000:3000` w pliku compose).
- W Coolify ustaw domenę, np. `https://api.prawdowid.org`, wskazując port **3000**
  (Coolify wystawi to przez swój reverse proxy z TLS).
- Healthcheck jest już w compose: `GET /health` co 30 s. Backend ma taki
  endpoint w `src/server/index.ts`. Jeśli Coolify ma własne pole healthchecka,
  może je nadpisać — wtedy wpisz tam `GET /health`, port 3000.

### Wolumeny (dane trwałe)

| Wolumen | Rola |
| --- | --- |
| `prawdowid_data` → `/app/data` | stan runtime: cache, logi, sprawy, metryki, alerty, moderacja |
| `./corpus` → `/app/corpus` (ro) | korpus, commitowany w repo, tylko do odczytu |

`data` jest **nazwanym wolumenem**, a nie bind mountem `./data`, celowo:
`data/` jest w `.gitignore`, więc w klonie Coolify ten katalog nie istnieje.
Docker utworzyłby go jako `root:root`, a proces działa jako `bun` (uid 1000)
i dostałby `EACCES` przy pierwszym zapisie. Wolumen dziedziczy właściciela
z obrazu (`chown -R bun:bun /app` w `Dockerfile`).

Uwaga: jeśli w Coolify wyłączysz opcję zachowywania wolumenów przy redeployu,
stan (cache, metryki, sprawy) poleci od zera.

### Zmienne środowiskowe

Plik `.env` **nie jest commitowany** i nie jest używany przez
`docker-compose.coolify.yml`. Wszystkie zmienne ustawiasz w zakładce
*Environment Variables* aplikacji Coolify; Coolify wstrzykuje je przy starcie
kontenera. Dzięki temu konfiguracja nie zależy od składni `env_file` dostępnej
dopiero w nowszych wydaniach Docker Compose.

Minimum do działania pipeline'u (reszta opcjonalna, patrz `.env.example`):

```
PORT=3000
NODE_ENV=production

# CORS: potrzebny tylko, gdy przeglądarka ma wołać backend bezpośrednio.
CORS_ORIGINS=https://prawdowid.org,https://www.prawdowid.org

# Model reasoning / ekstrakcja / embeddingi
OPENROUTER_API_KEY=...
OPENROUTER_RLCD_MODEL=typesafe/jev-latest
OPENROUTER_EXTRACT_MODEL=deepseek/deepseek-v4.1-flash
OPENROUTER_EMBEDDING_MODEL=baai/bge-m3

# Opcjonalne: OpenAI-compatible, DeepSeek OCR/ASR, Google Fact Check,
# Brave/Tavily, webhook moderatora, MYSQL_URL (bez niego stan leci do JSON-ów w data/)
```

Nie ustawiaj `PORT` na coś innego niż `3000` — mapping portów w compose
i `EXPOSE` w `Dockerfile` są na 3000.

## 4. Aplikacja 2 — frontend

Druga aplikacja w Coolify, z repo `prawdowid/frontend`.

| Pole w Coolify | Wartość |
| --- | --- |
| Repository | `prawdowid/frontend` |
| Branch | `main` |
| Build Pack | **Dockerfile** |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Port | `3001` |
| Domena | np. `https://prawdowid.org` (port 3001) |

### Zmienne środowiskowe

```
# runtime, tylko po stronie serwera (route handler /api/analyze)
BACKEND_API_URL=https://api.prawdowid.org

# BUILD ARG — wbudowywane w bundle przy `npm run build`
NEXT_PUBLIC_ANALYSIS_API_URL=/api/analyze
```

Dwie pułapki:

1. `BACKEND_API_URL` to adres **publiczny** backendu (`https://api.prawdowid.org`),
   jeśli nie łączysz aplikacji wspólną siecią Docker (patrz punkt 5).
   Podawaj pełny URL razem ze schematem; końcowy `/` jest obcinany przez kod,
   więc `https://api.prawdowid.org` i `https://api.prawdowid.org/` są równoważne.
2. `NEXT_PUBLIC_ANALYSIS_API_URL` jest **build argiem** `Dockerfile`-a frontendu:
   zmiana tej wartości wymaga **rebuildu**, samo „Redeploy” z cache może
   zostawić starą wartość w bundlu. Domyślnie `/api/analyze` i tak jest OK —
   nie zmieniaj tego bez powodu.

## 5. Jak połączyć backend z frontendem

### Wariant A — przez publiczny HTTPS (zalecany, najprostszy)

`BACKEND_API_URL=https://api.prawdowid.org`. Ruch idzie: frontend → internet →
Coolify proxy → backend. Zero konfiguracji sieci, zero wspólnych sieci Docker,
działa nawet gdy aplikacje są w różnych projektach Coolify.
Koszt: dodatkowy przelot przez proxy i TLS. Dla tego API (requesty po kilka
sekund na pipeline) to nie ma znaczenia.

Jeśli frontend i backend stoją na tej samej maszynie, ten wariant nadal
przechodzi przez reverse proxy — to jest OK i najstabilniejsze.

### Wariant B — wspólna sieć Docker (ruch wewnętrzny, bez wychodzenia na świat)

Coolify podpina aplikacje do swojej sieci proxy (w typowej instalacji nazywa się
`coolify`, sprawdź `docker network ls` na serwerze). Aby wołać backend po nazwie,
oba kontenery muszą być w **tej samej** sieci i backend
musi mieć **stabilną nazwę** — Docker DNS nie zna nazw serwisów z *innego*
projektu compose.

Kroki:

1. W `docker-compose.coolify.yml` (backend) dodaj do serwisu:

   ```yaml
       container_name: prawdowid-backend
       networks:
         - default
         - coolify
   ```

   oraz na końcu pliku:

   ```yaml
   networks:
     coolify:
       external: true
   ```

2. We frontendzie (compose lub w ustawieniach sieci aplikacji) podepnij
   ten sam network `coolify`.
3. Ustaw `BACKEND_API_URL=http://prawdowid-backend:3000`.
4. Zostaw `NEXT_PUBLIC_ANALYSIS_API_URL=/api/analyze` — przeglądarka nadal
   gada z frontendem, tylko hop serwer→serwer idzie po sieci wewnętrznej.

To jest zmiana w pliku compose, więc wariant B wymaga edycji repo i redeployu.
**Nie zweryfikowałem** tego wariantu na żywym Coolify (nazwa sieci i polityka
`container_name` mogą się różnić między wersjami) — jeśli nie działa,
wróć do wariantu A, to nie jest awaria, tylko inny (równie poprawny) sposób.

## 6. Kolejność wdrożenia

1. Wdróż **backend** (`docker-compose.coolify.yml`), ustaw env, domenę,
   poczekaj aż healthcheck będzie zielony.
2. Sprawdź z zewnątrz: `curl -i https://api.prawdowid.org/health` → `200`.
3. Wdróż **frontend** z `BACKEND_API_URL=https://api.prawdowid.org`.
4. Otwórz `https://prawdowid.org`, wklej tekst i sprawdź, czy werdykt wraca.
5. Jeśli frontend zwraca 502/500 — patrz tabela niżej.

## 7. Typowe błędy

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| `path "/artifacts/frontend" not found` | Coolify buduje `docker-compose.yml` z serwisem `frontend` | ustaw Docker Compose Location na `/docker-compose.coolify.yml` |
| build OK, kontener restartuje się w pętli | brak wymaganych env (klucze API) albo zły `PORT` | sprawdź zmienne w UI i logi; `PORT` musi być `3000` |
| `EACCES: permission denied, open '/app/data/...'` | `data` jako bind mount `./data` na klonie bez tego katalogu | używaj wariantu z `docker-compose.coolify.yml` (nazwany wolumen) |
| frontend: 502 z `/api/analyze` | zły `BACKEND_API_URL` albo backend nie odpowiada | `curl https://api.prawdowid.org/health`; potem popraw env i zrób **rebuild** frontendu |
| przeglądarka: CORS error | `NEXT_PUBLIC_ANALYSIS_API_URL` wskazuje bezpośrednio na API | ustaw `/api/analyze` i przebuduj frontend; albo dopisz origin do `CORS_ORIGINS` |
| zmiana `NEXT_PUBLIC_*` nie działa | to build arg, nie runtime env | wymuś rebuild bez cache |
| healthcheck backendu „unhealthy”, choć `curl` działa | `start_period` 20 s bywa za krótko na zimny start | zwiększ `start_period` w compose |

## 8. Czego ten dokument nie potwierdza

- Nie testowałem tego na instancji Coolify — w środowisku, w którym pisałem,
  nie ma Dockera, więc nie dało się nawet odpalić `docker compose config`.
  Zweryfikowana jest składnia YAML pliku compose, nie zachowanie Coolify.
- Nazwy pól UI (Base Directory, Docker Compose Location itd.) odpowiadają
  Coolify v4; w starszych wersjach mogą się różnić.
- Wariant B (wspólna sieć) to instrukcja, nie przetestowana konfiguracja.
