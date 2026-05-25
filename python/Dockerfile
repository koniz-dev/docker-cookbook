# syntax=docker/dockerfile:1.7

# =============================================================================
# PYTHON PRODUCTION DOCKERFILE
# Consolidates best practices: uv + alpine + security + optimization
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments
# -----------------------------------------------------------------------------
ARG PYTHON_VERSION=3.13
ARG ALPINE_VERSION=3.21
ARG UV_VERSION=0.5.11

ARG VERSION=0.1.0
ARG BUILD_DATE
ARG VCS_REF

# Pin uv via a named stage so the version reference is resolved at parse time.
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies with uv
# -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION} AS builder

# Install uv (pinned version) from the dedicated stage above
COPY --from=uv /uv /usr/local/bin/uv

# Build dependencies for native packages
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev

WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies into virtual environment with cache
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Copy source code
COPY src/ ./src/

# Install project itself
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# Strip noise from the venv, then pre-compile to .pyc. Pre-compiling cuts ~10-20%
# off cold start because the import path no longer pays parse cost.
RUN find /app -type d -name tests -exec rm -rf {} + && \
    find /app -type d -name __pycache__ -exec rm -rf {} + && \
    find /app -type f -name '*.pyc' -delete && \
    /app/.venv/bin/python -O -m compileall -q -j 0 /app/.venv /app/src

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Minimal production image
# -----------------------------------------------------------------------------
FROM python:${PYTHON_VERSION}-alpine${ALPINE_VERSION} AS runtime

# Re-declare ARGs
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# OCI Labels
LABEL org.opencontainers.image.title="Python Service" \
      org.opencontainers.image.description="Production-ready Python application" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="python:${PYTHON_VERSION}-alpine"

# Install runtime dependencies only
RUN apk add --no-cache \
    tini \
    curl \
    tzdata && \
    rm -rf /var/cache/apk/*

# Python environment settings.
# We DELIBERATELY do not set PYTHONDONTWRITEBYTECODE=1 — we pre-compiled .pyc
# in the builder stage and want Python to use them instead of re-parsing.
ENV PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Create non-root user
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup -h /app -s /sbin/nologin

WORKDIR /app

# Copy virtual environment and source from builder
COPY --from=builder --chown=appuser:appgroup /app/.venv /app/.venv
COPY --from=builder --chown=appuser:appgroup /app/src /app/src

# Set PATH to use venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/src"

# Application settings
ENV HOST=0.0.0.0 \
    PORT=8000 \
    WORKERS=2 \
    LOG_LEVEL=INFO

# Remove pip, setuptools from runtime (not needed at runtime)
RUN rm -rf \
    /usr/local/lib/python*/site-packages/pip* \
    /usr/local/lib/python*/site-packages/setuptools* \
    /usr/local/lib/python*/ensurepip \
    /usr/local/bin/pip*

# Read+execute for the app tree; writes (if any) should target a mounted tmpfs.
RUN chmod -R 550 /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Healthcheck (single, predictable path — curl is installed above)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT}/health" || exit 1

# Graceful shutdown
STOPSIGNAL SIGTERM

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Change command suitable for your project
CMD ["python", "-m", "src.main"]
