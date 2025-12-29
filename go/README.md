# 🐹 Golang Dockerfile Best Practices

> Guide to optimizing Dockerfiles for Go applications using Multi-stage builds, Distroless, and Scratch images.

---

## 📑 Table of Contents

- [0. Go Fundamentals for Docker](#0-go-fundamentals-for-docker)
- [1. Overview](#1-overview)
- [2. Base Images](#2-base-images)
- [3. Optimization Techniques](#3-optimization-techniques)
- [4. Extreme Optimization (Scratch)](#4-extreme-optimization-scratch)
- [5. Security Patterns](#5-security-patterns)
- [6. CI/CD](#6-cicd)
- [7. Production Checklist](#7-production-checklist)

---

## 0. Go Fundamentals for Docker

### Static vs Dynamic Linking
Go allows you to build completely static binaries (no dependencies on system libraries like libc).
*   **Static (`CGO_ENABLED=0`)**: The binary works anywhere (Scratch, Alpine, Debian). Preferred for containers.
*   **Dynamic (`CGO_ENABLED=1`)**: Depends on libc. Need to ensure the runtime OS has compatible libc versions (glibc vs musl).

### Binary Size
Go binaries can be large (~10-20MB for a simple app).
*   **Strip Debug Info**: Use `-ldflags="-s -w"` to remove symbol tables and DWARF debug info. Can reduce size by ~20-30%.
*   **UPX Compression**: Ultimate compression for extreme size reduction (~50-70%).

---

## 1. Overview

| File | Description | Final Size | Use Case |
|------|-------------|------------|----------|
| `Dockerfile` | Alpine Runtime | ~15-25 MB | Development, debugging. Shell available. |
| `Dockerfile.distroless` | Distroless Static | ~8-15 MB | High security. CA Certs included. No shell. |
| `Dockerfile.scratch` | FROM scratch + UPX | ~2-5 MB | **EXTREME**. Minimal attack surface. Maximum performance. |

---

## 2. Base Images

### Builder: `golang:1.22-alpine`
Fast, small builder. Sufficient for most Go projects.

### Runtime: `alpine:3.21`
*   **Pros**: Shell access (`sh`), package manager (`apk`) for debugging.
*   **Cons**: Slightly larger than distroless.

### Runtime: `gcr.io/distroless/static-debian12`
*   **Pros**: CA Certificates, timezone data, `/etc/passwd` (nonroot). No shell.
*   **Cons**: No debugging tools.

### Runtime: `scratch` (ULTIMATE)
*   **Pros**: Literally **NOTHING** except your binary. Zero attack surface.
*   **Cons**: No shell, no certs (must inject), no timezone, no user (must inject).

---

## 3. Optimization Techniques

### Cache Go Modules
Download dependencies before copying source code to leverage Docker layer caching.

```dockerfile
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN go build ...
```

### Compiler Flags for Size
```bash
# -s: Omit the symbol table and debug information
# -w: Omit the DWARF symbol table
# -trimpath: Remove file system paths (reproducibility)
CGO_ENABLED=0 go build -ldflags="-s -w" -trimpath -o app .
```

---

## 4. Extreme Optimization (Scratch)

The `Dockerfile.scratch` achieves **ultimate minimalism**:

### UPX Binary Compression
```dockerfile
# Install UPX in builder
RUN apk add --no-cache upx

# After building
RUN upx --best --lzma app
```
**Result**: ~50-70% size reduction. A 10MB binary becomes ~3MB.

### Self-Contained SSL Certificates
Scratch has no filesystem. If your app makes HTTPS calls, you must inject CA certs:
```dockerfile
# In rootfs preparation stage
RUN cp /etc/ssl/certs/ca-certificates.crt /rootfs/etc/ssl/certs/

# In final scratch image
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
```

### Self-Contained User
Scratch has no `/etc/passwd`. To run as non-root:
```dockerfile
# Create minimal passwd file
RUN echo "nobody:x:65534:65534:Nobody:/:/sbin/nologin" > /rootfs/etc/passwd
# In scratch
USER 65534:65534
```

---

## 5. Security Patterns

### Non-Root User
Even though it's a static binary, **never run as root**.
*   Alpine: `adduser -u 1000 -S appuser`
*   Distroless: Use `:nonroot` tag (UID 65532)
*   Scratch: Inject `/etc/passwd` and use `USER 65534`

### Graceful Shutdown
Handle `SIGTERM` properly in your Go code:
```go
ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
defer stop()
// ... run server ...
<-ctx.Done()
// Graceful shutdown logic
```

---

## 6. CI/CD

### GitHub Actions Example

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        
      - name: Build and push (Scratch - Extreme)
        uses: docker/build-push-action@v5
        with:
          context: ./go
          file: ./go/Dockerfile.scratch
          push: true
          tags: user/go-app:scratch
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 7. Production Checklist

- [ ] Use `CGO_ENABLED=0` for static builds.
- [ ] Strip binary using `-ldflags="-s -w"`.
- [ ] Compress with UPX for extreme size (optional, adds startup latency).
- [ ] Run as non-root user.
- [ ] Handle `SIGTERM` in code.
- [ ] Include CA Certificates if making HTTPS calls.
- [ ] Inject timezone data if using `time.LoadLocation`.
- [ ] Scan image for vulnerabilities (Trivy/Snyk).
