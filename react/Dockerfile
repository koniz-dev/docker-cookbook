# syntax=docker/dockerfile:1.7

# =============================================================================
# REACT/VITE PRODUCTION DOCKERFILE
# Collection of best practices: pnpm + nginx + compression + security
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.21
ARG NGINX_VERSION=1.27

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder - Build React app
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install gzip for pre-compression
RUN apk add --no-cache gzip

WORKDIR /app

# Copy package files first to cache dependencies
COPY package.json pnpm-lock.yaml ./

# Install dependencies with cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy config files (less frequently changed)
COPY tsconfig.json tsconfig.node.json vite.config.ts ./
COPY tailwind.config.ts postcss.config.js ./

# Copy source files
COPY index.html ./
COPY public ./public
COPY src ./src

# Build production bundle
ENV NODE_ENV=production
RUN pnpm build && \
    # Delete source maps
    find dist -type f -name "*.map" -delete && \
    # Delete license files
    find dist -type f -name "*.LICENSE.*" -delete && \
    # Delete stats if present
    rm -f dist/stats.html && \
    # Pre-compress with gzip level 9
    find dist -type f \( \
        -name "*.html" -o \
        -name "*.css" -o \
        -name "*.js" -o \
        -name "*.json" -o \
        -name "*.svg" -o \
        -name "*.xml" \
    \) -exec gzip -9 -k {} \;

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Nginx serving static files
# -----------------------------------------------------------------------------
FROM nginx:${NGINX_VERSION}-alpine AS runtime

# Re-declare ARGs
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# OCI Labels
LABEL org.opencontainers.image.title="React Application" \
      org.opencontainers.image.description="Production-ready React SPA with Nginx" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="nginx:alpine"

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Create nginx config with SPA support
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 3000;
    server_name localhost;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" always;
    
    # Hide nginx version
    server_tokens off;
    
    # Gzip settings
    gzip on;
    gzip_static on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;
    
    # SPA fallback - important for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Long cache for static assets (hashed filenames)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Do not cache index.html to ensure fresh version
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }
    
    # Health check endpoint
    location = /health {
        access_log off;
        return 200 "OK";
        add_header Content-Type text/plain;
    }
}
EOF

# Copy build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user and set permissions
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Graceful shutdown
STOPSIGNAL SIGQUIT

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
