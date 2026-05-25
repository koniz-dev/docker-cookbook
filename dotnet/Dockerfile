# syntax=docker/dockerfile:1.7

# =============================================================================
# .NET PRODUCTION DOCKERFILE
# Best practices: SDK build + chiseled-ubuntu runtime (rootless)
# =============================================================================

ARG DOTNET_VERSION=9.0

ARG VERSION=1.0.0
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION}-alpine AS builder
WORKDIR /src

# Restore — only csproj copied so this layer is cached on source-only edits
COPY sample.csproj ./
RUN dotnet restore sample.csproj

COPY . .
RUN dotnet publish sample.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    -p:UseAppHost=true

# -----------------------------------------------------------------------------
# Stage 2: Healthcheck binary — chiseled has no shell, curl or wget.
# -----------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.23-alpine AS healthcheck-builder

WORKDIR /build
ARG TARGETARCH
ARG TARGETOS
COPY <<'EOF' /build/healthcheck.go
package main

import (
	"net/http"
	"os"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://localhost:" + port + "/health")
	if err != nil {
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		os.Exit(0)
	}
	os.Exit(1)
}
EOF
RUN go mod init healthcheck && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
        go build -ldflags="-s -w" -trimpath -o /healthcheck healthcheck.go

# -----------------------------------------------------------------------------
# Stage 3: Runtime — chiseled (minimal) ASP.NET image, non-root by default
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION}-noble-chiseled AS runtime

ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.title=".NET Application" \
      org.opencontainers.image.description="Production-ready .NET app on chiseled Ubuntu" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION}-noble-chiseled"

WORKDIR /app

# Chiseled ubuntu images run as UID 1654 ("app") by default
COPY --from=builder --chown=app:app /app/publish ./
COPY --from=healthcheck-builder --chown=app:app /healthcheck /healthcheck

ENV PORT=8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true \
    ASPNETCORE_URLS=http://+:8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["/healthcheck"]

STOPSIGNAL SIGTERM
ENTRYPOINT ["dotnet", "app.dll"]
