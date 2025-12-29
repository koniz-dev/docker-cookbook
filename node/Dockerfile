# syntax=docker/dockerfile:1.7

# =============================================================================
# NODE.JS PRODUCTION DOCKERFILE (ADVANCED)
# Best practices: Multi-stage + pnpm deploy + Tini + Security + Pruning
# =============================================================================

ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.21

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install ALL dependencies and build
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies for TypeScript, etc.)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application (TypeScript -> JavaScript)
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 2: Pruner - Create minimal production bundle using pnpm deploy
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS pruner

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy built application
COPY --from=builder /app ./

# Use pnpm deploy to create a minimal production bundle
# This copies only production dependencies and the specified files
# Result: Clean node_modules with NO devDependencies, NO extraneous files
RUN pnpm deploy --prod --filter=. /prod

# -----------------------------------------------------------------------------
# Stage 3: Runtime - Clean production image
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runtime

# Re-declare ARGs for labels
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# OCI Labels
LABEL org.opencontainers.image.title="Node.js API" \
      org.opencontainers.image.description="Production-ready Node.js with pnpm deploy" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="node:alpine"

WORKDIR /app

# Install tini for proper signal handling (PID 1 problem)
RUN apk add --no-cache tini

# Set production environment
ENV NODE_ENV=production \
    PORT=3000

# Copy deployed application from pruner stage
# This contains ONLY production deps and dist
COPY --from=pruner --chown=node:node /prod ./

# Switch to non-root user (node user is built-in, UID 1000)
USER node

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Graceful shutdown
STOPSIGNAL SIGTERM

# Use tini as entrypoint
ENTRYPOINT ["/sbin/tini", "--"]

# Run application
CMD ["node", "dist/main.js"]
