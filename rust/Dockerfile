# syntax=docker/dockerfile:1.7

# =============================================================================
# RUST PRODUCTION DOCKERFILE
# Best practices: cargo chef caching + musl static + Alpine runtime
# =============================================================================

ARG RUST_VERSION=1.95
ARG ALPINE_VERSION=3.22

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: cargo-chef recipe — cache invalidation on Cargo.toml/lock changes
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM rust:${RUST_VERSION}-alpine${ALPINE_VERSION} AS chef
RUN apk add --no-cache musl-dev
RUN cargo install cargo-chef --locked --version 0.1.68
WORKDIR /build

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo chef prepare --recipe-path recipe.json

# -----------------------------------------------------------------------------
# Stage 2: Builder — compile deps using the recipe, then build the app
# -----------------------------------------------------------------------------
FROM chef AS builder
ARG TARGETARCH

# Cache mount notes:
# - cargo registry is identical across architectures (source crates), so it's
#   shared via a single id — but `sharing=locked` serialises concurrent buildx
#   platform builds (otherwise two cargos race on extracting the same crate and
#   collide on `.cargo-ok` markers).
# - `target/` holds arch-specific compiled artifacts; isolate per TARGETARCH so
#   amd64 and arm64 builds never overwrite each other's incremental output.
COPY --from=planner /build/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry,id=cargo-registry,sharing=locked \
    --mount=type=cache,target=/build/target,id=cargo-target-${TARGETARCH} \
    cargo chef cook --release --recipe-path recipe.json

COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry,id=cargo-registry,sharing=locked \
    --mount=type=cache,target=/build/target,id=cargo-target-${TARGETARCH} \
    cargo build --release && \
    cp target/release/app /app

# -----------------------------------------------------------------------------
# Stage 3: Runtime — Alpine with shell for debug
# -----------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS runtime

ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title="Rust Application" \
      org.opencontainers.image.description="Production-ready Rust app on Alpine" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="alpine:${ALPINE_VERSION}"

RUN apk add --no-cache ca-certificates tzdata tini curl && \
    rm -rf /var/cache/apk/*

RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -h /app -s /sbin/nologin

WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app ./app
RUN chmod 550 /app/app

USER appuser

ENV PORT=8080 \
    TZ=UTC

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

STOPSIGNAL SIGTERM
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./app"]
