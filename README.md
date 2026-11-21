# backend

Minimal [ElysiaJS](https://elysiajs.com/) + [Bun](https://bun.sh/) API.

## Requirements

- Bun 1.4+

## Local development

```bash
bun install
bun run dev
```

The server listens on `http://localhost:3000` by default.

```bash
curl http://localhost:3000/
# {"message":"Hello World"}
```

Set `PORT` to use a different port.

## Production

```bash
bun install --production --frozen-lockfile
bun run start
```

## Docker

```bash
docker build -t backend .
docker run --rm -p 3000:3000 backend
```

To use a different port:

```bash
docker run --rm -e PORT=8080 -p 8080:8080 backend
```

## Scripts

| Script              | Description                     |
| ------------------- | ------------------------------- |
| `bun run dev`       | Start with file watching        |
| `bun run start`     | Start the server                |
| `bun run typecheck` | Type-check with `tsc --noEmit`  |
