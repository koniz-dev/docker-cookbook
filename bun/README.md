# 🥟 Bun Dockerfile Best Practices

> Guide to running Bun in production containers — bundled output or compiled standalone binaries.

---

## 1. Overview

| File | Description | Measured Size | Cold start | Use Case |
|------|-------------|---------------|------------|----------|
| `Dockerfile` | Alpine + bun runtime + bundled JS | **170 MB** | ~0.5 s | Default — server with non-root + tini |

> **Why no scratch/distroless variant?** Bun's compiled binary (`bun build --compile`) embeds the entire runtime — ~100 MB by itself. Stacking it on `distroless/cc` ends up **larger** than just shipping the alpine image with the runtime + your tiny JS bundle. The compile-mode trade-off is "single deploy unit", not "smaller image". See section 4.

```mermaid
flowchart LR
    SRC[TS source] --> B[bun build --minify<br/>→ dist/main.js]
    B --> D([oven/bun:alpine<br/>+ your bundled JS])
```

---

## 2. Why Bun in Docker?

- **Single binary**: Bun itself is one ~80 MB executable — no Node + npm + pnpm dance.
- **`bun install` is fast**: 5-20x faster than npm in practice, and the binary lockfile (`bun.lockb`) is part of the speedup.
- **`bun build --compile`**: produces a fully standalone executable that embeds the runtime + your code. Ideal for `FROM scratch`.

---

## 3. Production setup

```dockerfile
FROM oven/bun:1.3.14-alpine AS builder
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production
COPY src ./src
RUN bun build src/main.ts --target=bun --outdir=dist --minify
```

Tips:

- **Pin Bun version**: `oven/bun:1.3.14-alpine`, never `:latest`.
- **Use `--frozen-lockfile`**: fail the build if lockfile mismatches `package.json`.
- **Use `--production`** during install: skip dev deps automatically.
- **Mount the install cache**: `--mount=type=cache,target=/root/.bun/install/cache`.

---

## 4. About `bun build --compile`

`bun build --compile` produces a single executable that embeds the Bun runtime + your JS. It's tempting as a "minimal" deploy:

```dockerfile
FROM oven/bun:1.3.14-slim AS builder
RUN bun build src/main.ts --compile --outfile=app

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/app /app
ENTRYPOINT ["/app"]
```

But the binary itself is ~100 MB (the entire Bun runtime), and the resulting image came out **larger** than the alpine variant in our measurements (173 MB vs 170 MB). The actual benefits of `--compile` are:

- **Single binary deploy** (no `node_modules`, no `bun install` at deploy time)
- **Slightly faster cold start** (no parsing)
- **No package manager in production image** (smaller attack surface than alpine + bun)

So pick it for *operational* reasons, not for *image size*. If size is the goal, the alpine variant is currently the smaller of the two.

---

## 5. Production Checklist

- [ ] Pin Bun version (avoid `oven/bun:latest`)
- [ ] `bun install --frozen-lockfile --production`
- [ ] Build with `--minify`
- [ ] Run as non-root (`USER bun` exists in `oven/bun` images, UID 1000)
- [ ] Healthcheck endpoint
- [ ] Handle SIGTERM in the JS code (no automatic shutdown in Bun.serve)
- [ ] Consider `--compile` for the smallest deploy unit
