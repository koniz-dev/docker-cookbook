# syntax=docker/dockerfile:1.7

# =============================================================================
# GOLANG PRODUCTION DOCKERFILE
# Best practices: Multi-stage + BuildKit Cache + Security + Alpine Runtime
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments
# -----------------------------------------------------------------------------
ARG GO_VERSION=1.22
ARG ALPINE_VERSION=3.21

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder - Compile Go binary
# -----------------------------------------------------------------------------
FROM golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS builder

WORKDIR /build

# Install build tools if needed (git for private repos, make for complex builds)
# RUN apk add --no-cache git make

# Copy module files first for caching (go.mod before go.sum for better invalidation)
COPY go.mod go.sum ./

# Download dependencies with BuildKit cache mount
# This caches the entire /go/pkg/mod directory across builds
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download && go mod verify

# Copy source code
COPY . .

# Build the application with maximum optimizations
# CGO_ENABLED=0: Pure Go, no C dependencies (static binary)
# -ldflags="-s -w": Strip symbol table and DWARF debug info (~20-30% smaller)
# -trimpath: Remove file system paths (reproducible builds, security)
# -installsuffix cgo: Ensure static linking
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w -X main.Version=${VERSION} -X main.BuildDate=${BUILD_DATE}" \
    -trimpath \
    -installsuffix cgo \
    -o app ./cmd/main.go || \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o app .

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Minimal production image
# -----------------------------------------------------------------------------
FROM alpine:${ALPINE_VERSION} AS runtime

# Re-declare ARGs for this stage
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# OCI Labels (Standard metadata)
LABEL org.opencontainers.image.title="Go Application" \
      org.opencontainers.image.description="Production-ready Go application" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="alpine:${ALPINE_VERSION}"

WORKDIR /app

# Install minimal runtime dependencies
# ca-certificates: Required for HTTPS calls (TLS verification)
# tzdata: Required for time.LoadLocation() (timezone support)
# tini: Proper init system for signal handling (PID 1 problem)
# curl: For healthcheck (optional, can remove if using TCP check)
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    tini \
    curl && \
    rm -rf /var/cache/apk/* /tmp/*

# Create non-root user with explicit UID/GID
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -h /app -s /sbin/nologin

# Copy binary from builder stage
COPY --from=builder --chown=appuser:appgroup /build/app ./

# Environment configuration
ENV MODE=production \
    PORT=8080 \
    # Go runtime settings
    GOMAXPROCS=0 \
    # Timezone (can be overridden at runtime)
    TZ=UTC

# Set read-only permissions on binary
RUN chmod 550 /app/app

# Switch to non-root user
USER appuser

# Expose port (documentation only)
EXPOSE 8080

# Healthcheck
# Using curl for HTTP check. For TCP-only check, use nc or custom binary.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -fsS http://localhost:8080/health || exit 1

# Graceful shutdown signal
STOPSIGNAL SIGTERM

# Use tini as init system (handles SIGTERM, reaps zombies)
ENTRYPOINT ["/sbin/tini", "--"]

# Run application
CMD ["./app"]
