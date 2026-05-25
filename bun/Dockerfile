# syntax=docker/dockerfile:1.7

# =============================================================================
# BUN PRODUCTION DOCKERFILE
# Best practices: bun install --production + non-root + tini-style PID 1
# =============================================================================

ARG BUN_VERSION=1.1.43
ARG ALPINE_VERSION=3.21

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder - install deps + bundle
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

COPY src ./src
RUN bun build src/main.ts --target=bun --outdir=dist --minify

# -----------------------------------------------------------------------------
# Stage 2: Runtime - small Alpine + bun + non-root
# -----------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-alpine AS runtime

ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="Bun Application" \
      org.opencontainers.image.description="Production-ready Bun app" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache curl tini

WORKDIR /app

COPY --from=builder --chown=bun:bun /app/dist ./dist
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

USER bun

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:3000/health || exit 1

STOPSIGNAL SIGTERM

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "dist/main.js"]
