# ⚛️ React/Vite Dockerfile Best Practices

> Hướng dẫn tối ưu Dockerfile cho ứng dụng React SPA với Vite.

---

## 📑 Mục lục

- [0. Web/React Fundamentals cho Docker](#0-webreact-fundamentals-cho-docker)
- [1. Tổng quan](#1-tổng-quan)
- [2. Web Server Options](#2-web-server-options)
- [3. Node Package Managers](#3-node-package-managers)
- [4. Kỹ thuật tối ưu](#4-kỹ-thuật-tối-ưu)
- [5. Nginx Configuration](#5-nginx-configuration)
- [6. Static File Compression](#6-static-file-compression)
- [7. Extreme Optimization: From Scratch](#7-extreme-optimization-from-scratch)
- [8. Bảng so sánh các phương pháp](#8-bảng-so-sánh-các-phương-pháp)
- [9. Checklist Production](#9-checklist-production)
- [10. Docker Compose](#10-docker-compose-cho-react)
- [11. CI/CD](#11-cicd-cho-react)

---

## 0. Web/React Fundamentals cho Docker

### Client-side Routing vs Server-side Routing

React dùng **HTML5 History API** (`pushState`) để thay đổi URL mà không reload trang. Nhưng Web Server (Nginx) không biết điều này.

**Vấn đề:**
1. User vào `/dashboard`
2. Nginx tìm file `dashboard.html` hoặc thư mục `dashboard/`
3. Không thấy → Trả về **404 Not Found**

**Giải pháp (SPA Fallback):**
Cấu hình Nginx để **luôn trả về index.html** nếu không tìm thấy file.

```nginx
location / {
    # Thử tìm file ($uri), nếu không có tìm thư mục ($uri/), nếu không có → index.html
    try_files $uri $uri/ /index.html;
}
```

### HTTP Caching Strategy (Cache Control)

Để tối ưu performance, chúng ta cần cache mạnh assets nhưng không được cache index.html.

| File Type | Pattern | Cache Strategy | Tại sao? |
|-----------|---------|----------------|----------|
| **HTML** | `index.html` | `no-cache` / `max-age=0` | User luôn nhận được version mới nhất của app entry point. |
| **Assets** | `index-a1b2.js` | `public, max-age=31536000, immutable` | Filename chứa hash unique. Nếu file đổi → tên đổi → browser tải mới. |

```nginx
# Cache vĩnh viễn cho assets có hash
location ~* \.(js|css|png|jpg|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Không cache index.html
location = /index.html {
    expires -1;
    add_header Cache-Control "no-cache";
}
```

### Content Hashing (Cache Busting)

Build tools như Vite tự động thêm hash vào filename: `index-2f9a.js`.

**Quy trình update:**
1. Dev sửa code → Build
2. Vite tạo file mới: `index-9z8y.js` (hash đổi)
3. Vite update `index.html` để trỏ vào file mới
4. Browser tải `index.html` (no-cache) → Thấy file JS mới → Tải file JS mới.
5. File JS cũ (`index-2f9a.js`) vẫn nằm trong cache browser nhưng không ai gọi nữa.

### Gzip vs Brotli Compression

Nén file text (JS, CSS, HTML) để giảm tải network.

| Algorithm | Compression Ratio | Speed | Browser Support |
|-----------|------------------|-------|-----------------|
| **Gzip** | Tốt (`-9`) | Rất nhanh | 99.9% |
| **Brotli** | **Tốt hơn Gzip 20%** (`-11`) | Chậm hơn | 96% (All modern browsers) |

**Best Practice:**
1. **Pre-compress** trong lúc build Docker (dùng CPU của build server).
2. Nginx dùng module `gzip_static` và `brotli_static` để serve file đã nén sẵn.
3. Không tốn CPU của Nginx runtime để nén on-the-fly.

---

## 1. Tổng quan

React applications là Single Page Applications (SPA):
- **Build output**: Static files (HTML, JS, CSS)
- **Runtime**: Chỉ cần web server để serve static files
- **Size**: Build output thường 1-5MB
- **Routing**: Client-side routing cần fallback đến index.html

### Mục tiêu tối ưu

| Tiêu chí | Target |
|----------|--------|
| Image size | < 20MB (nginx-alpine), < 5MB (scratch) |
| Time to First Byte | < 100ms |
| Build time | < 2 phút với cache |
| Lighthouse Score | 90+ |

---

## 2. Web Server Options

### Bảng so sánh

| Web Server | Image Size | Performance | Features | Complexity |
|------------|------------|-------------|----------|------------|
| **Nginx (Alpine)** | ~25MB | Xuất sắc | Full-featured | Thấp |
| **Nginx (Scratch)** | ~5MB | Xuất sắc | Limited | Cao |
| **Caddy** | ~40MB | Tốt | Auto HTTPS | Thấp |
| **BusyBox httpd** | ~1MB | Cơ bản | Minimal | Thấp |
| **Go/Rust binary** | ~2-5MB | Xuất sắc | Custom | Cao |

### Khi nào dùng gì?

```
┌─────────────────────────────────────────────────────────────┐
│              Chọn Web Server                                │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    Cần features đầy đủ?              Size là ưu tiên?
    (gzip, headers, SSL)                    │
            │                               ▼
            ▼                     ┌─────────┴─────────┐
    Nginx Alpine (~25MB)          ▼                   ▼
                            BusyBox (~1MB)      Custom binary
                                              (Go/Rust, ~3MB)
```

---

## 3. Node Package Managers

### Bảng so sánh

| Package Manager | Install Speed | Disk Usage | Lockfile |
|-----------------|---------------|------------|----------|
| npm | Chậm | Cao | package-lock.json |
| yarn | Trung bình | Trung bình | yarn.lock |
| **pnpm** | **Nhanh** | **Thấp** | pnpm-lock.yaml |
| bun | Rất nhanh | Thấp | bun.lockb |

### pnpm - Recommended

```dockerfile
FROM node:22-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy lockfile trước để cache dependencies
COPY package.json pnpm-lock.yaml ./

# Install với cache mount
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source và build
COPY . .
RUN pnpm build
```

### npm

```dockerfile
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build
```

---

## 4. Kỹ thuật tối ưu

### 4.1 Basic Multi-stage Build

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Runtime
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 4.2 Optimized Layer Caching

Sắp xếp COPY theo tần suất thay đổi:

```dockerfile
# 1. Package files (thay đổi khi thêm package)
COPY package.json pnpm-lock.yaml ./

# 2. Config files (thay đổi ít)
COPY tsconfig.json vite.config.ts tailwind.config.ts ./
COPY postcss.config.js ./

# 3. Static assets
COPY public ./public

# 4. Source code (thay đổi thường xuyên)
COPY src ./src
COPY index.html ./
```

### 4.3 Clean Build Output

```dockerfile
RUN pnpm build && \
    # Xóa source maps
    find dist -name "*.map" -delete && \
    # Xóa license files
    find dist -name "*.LICENSE.*" -delete && \
    # Xóa stats
    rm -f dist/stats.html
```

### 4.4 .dockerignore

```
node_modules/
dist/
.git/
.gitignore
*.md
.env*
.vscode/
coverage/
tests/
__tests__/
*.test.*
*.spec.*
```

---

## 5. Nginx Configuration

### nginx.conf cho SPA

```nginx
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

    # Gzip compression
    gzip on;
    gzip_static on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # SPA fallback - quan trọng cho client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache control cho assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Không cache index.html
    location = /index.html {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

### Key Points

| Directive | Mục đích |
|-----------|----------|
| `try_files $uri /index.html` | Fallback cho SPA routing |
| `gzip_static on` | Serve pre-compressed .gz files |
| `expires 1y` | Long cache cho immutable assets |
| `no-cache` cho index.html | Luôn lấy version mới |

---

## 6. Static File Compression

### Pre-compress trong Build Stage

```dockerfile
RUN pnpm build && \
    # Gzip compression (level 9)
    find dist -type f \( \
        -name "*.html" -o \
        -name "*.css" -o \
        -name "*.js" -o \
        -name "*.json" -o \
        -name "*.svg" \
    \) -exec gzip -9 -k {} \;
```

### Brotli Compression (tốt hơn gzip)

```dockerfile
RUN apk add --no-cache brotli && \
    find dist -type f \( \
        -name "*.html" -o \
        -name "*.css" -o \
        -name "*.js" \
    \) -exec brotli -q 11 {} \;
```

### So sánh Compression

| Method | Compression Ratio | CPU Usage | Browser Support |
|--------|-------------------|-----------|-----------------|
| None | 0% | - | 100% |
| Gzip | 60-70% | Thấp | 100% |
| **Brotli** | **70-80%** | Cao | 95%+ |

---

## 7. Extreme Optimization: From Scratch

### 7.1 UPX Binary Compression

[UPX](https://upx.github.io/) nén binary giữ nguyên chức năng, giảm ~50-70% size.

```dockerfile
FROM alpine:3.21 AS compressor

RUN apk add --no-cache upx

# Compress nginx binary
COPY --from=nginx-builder /usr/sbin/nginx /nginx
RUN upx --best --lzma /nginx

# Kết quả: 2.5MB → 800KB
```

**Các level compression:**

| Level | Command | Compression | Speed |
|-------|---------|-------------|-------|
| Fast | `upx -1` | 40% | Nhanh |
| Default | `upx` | 55% | Trung bình |
| Best | `upx --best` | 65% | Chậm |
| **Ultra** | `upx --best --lzma` | **70%** | Rất chậm |

### 7.2 Static C Healthcheck Binary

Healthcheck binary viết bằng C, không cần curl/wget:

```dockerfile
FROM alpine:3.21 AS healthcheck-builder

RUN apk add --no-cache build-base

# Tạo healthcheck.c
RUN cat > /tmp/healthcheck.c << 'EOF'
#include <netdb.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main() {
    struct hostent *h = gethostbyname("localhost");
    if (!h) return 1;

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return 1;

    struct sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_port = htons(3000);
    addr.sin_addr = *(struct in_addr *)h->h_addr_list[0];

    int result = connect(sock, (struct sockaddr *)&addr, sizeof(addr));
    close(sock);
    return (result == 0) ? 0 : 1;
}
EOF

# Compile static binary
RUN gcc -static -O2 -o /healthcheck /tmp/healthcheck.c
RUN strip /healthcheck

# Kết quả: Binary ~20KB, không có dependencies
```

Sử dụng trong scratch image:
```dockerfile
FROM scratch
COPY --from=healthcheck-builder /healthcheck /healthcheck
HEALTHCHECK CMD ["/healthcheck"]
```

### 7.3 BusyBox httpd (Ultra-minimal)

[lipanski/docker-static-website](https://github.com/lipanski/docker-static-website) chỉ ~100KB base image:

```dockerfile
FROM node:22-alpine AS builder
# ... build React app ...
RUN pnpm build && \
    # Pre-compress
    find dist -type f \( -name "*.html" -o -name "*.js" -o -name "*.css" \) \
        -exec gzip -9 -k {} \;

FROM lipanski/docker-static-website:latest

# Copy built assets (serves from /home/static)
COPY --from=builder /app/dist /home/static

EXPOSE 3000
# Base image tự động serve .gz files khi Accept-Encoding: gzip
```

**Kết quả**: Image ~1-2MB (bao gồm cả static files)!

### 7.4 Custom Nginx (Static Build + Scratch)

Biên dịch Nginx thành static binary và chạy trên `scratch`:

```dockerfile
FROM alpine:3.21 AS nginx-builder

ARG NGINX_VERSION=1.27.3
ARG NGINX_SHA256=...

# Install build deps
RUN apk add --no-cache \
    gcc g++ musl-dev make linux-headers curl \
    pcre-dev pcre2-dev zlib-dev zlib-static \
    openssl-dev openssl-libs-static upx

# Download và verify
RUN curl -fSL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o nginx.tar.gz && \
    echo "${NGINX_SHA256}  nginx.tar.gz" | sha256sum -c -

# Build static nginx với minimal modules
RUN tar -xzf nginx.tar.gz && cd nginx-${NGINX_VERSION} && \
    ./configure \
        --prefix=/usr/local/nginx \
        --with-cc-opt='-static -Os -ffunction-sections -fdata-sections' \
        --with-ld-opt='-static -Wl,--gc-sections' \
        --with-http_gzip_static_module \
        --with-http_ssl_module \
        --with-http_v2_module \
        # Disable unused modules
        --without-http_rewrite_module \
        --without-http_proxy_module \
        --without-http_fastcgi_module \
        --without-http_uwsgi_module \
        --without-http_scgi_module \
        --without-http_grpc_module \
        --without-mail_pop3_module \
        --without-mail_imap_module \
        --without-mail_smtp_module && \
    make -j$(nproc) && \
    strip --strip-all /usr/local/nginx/sbin/nginx && \
    upx --best --lzma /usr/local/nginx/sbin/nginx

# Final: scratch image
FROM scratch

COPY --from=nginx-builder /usr/local/nginx/sbin/nginx /nginx
COPY --from=builder /app/dist /html
# Copy minimal configs...

USER 65534:65534
EXPOSE 3000
CMD ["/nginx", "-g", "daemon off;"]
```

### 7.5 Go FastHTTP Server (Embed + Single Binary)

Embed static files vào Go binary với FastHTTP (nhanh hơn net/http):

```dockerfile
FROM golang:1.22-alpine AS go-builder

RUN apk add --no-cache binutils upx

WORKDIR /app

# Copy dist files để embed
COPY --from=builder /app/dist ./dist

# Tạo Go server với FastHTTP
RUN cat > main.go << 'GOSRC'
package main

import (
    "embed"
    "log"
    "os"
    "path"
    "strings"

    "github.com/valyala/fasthttp"
)

//go:embed dist
var distFiles embed.FS

func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "3000"
    }

    handler := func(ctx *fasthttp.RequestCtx) {
        pathStr := string(ctx.Path())
        
        // Static asset với file extension
        if strings.Contains(path.Base(pathStr), ".") {
            file, err := distFiles.Open("dist" + pathStr)
            if err == nil {
                defer file.Close()
                
                // Set content type
                ext := path.Ext(pathStr)
                switch ext {
                case ".js":
                    ctx.SetContentType("application/javascript")
                case ".css":
                    ctx.SetContentType("text/css")
                case ".svg":
                    ctx.SetContentType("image/svg+xml")
                default:
                    ctx.SetContentType("application/octet-stream")
                }
                
                ctx.Response.SetBodyStream(file, -1)
                return
            }
        }
        
        // SPA fallback
        file, err := distFiles.Open("dist/index.html")
        if err != nil {
            ctx.SetStatusCode(404)
            return
        }
        defer file.Close()
        
        ctx.SetContentType("text/html; charset=utf-8")
        ctx.Response.SetBodyStream(file, -1)
    }

    // Built-in healthcheck
    if len(os.Args) > 1 && os.Args[1] == "-health" {
        _, _, err := fasthttp.Get(nil, "http://127.0.0.1:"+port)
        if err != nil {
            os.Exit(1)
        }
        os.Exit(0)
    }

    log.Printf("FastHTTP server on :%s", port)
    log.Fatal(fasthttp.ListenAndServe(":"+port, handler))
}
GOSRC

# Build optimized
RUN cat > go.mod << 'GOMOD'
module server
go 1.22
require github.com/valyala/fasthttp v1.51.0
GOMOD

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o server && \
    strip server && \
    upx --ultra-brute --lzma server

# Final: scratch image
FROM scratch

COPY --from=go-builder /app/server /server

USER 1000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/server", "-health"]

CMD ["/server"]
```

**Kết quả**: Image ~3-4MB chứa cả server lẫn static files!

---

## 8. Bảng so sánh các phương pháp

| Phương pháp | Image Size | Build Complexity | Performance | Use Case |
|-------------|------------|------------------|-------------|----------|
| nginx:alpine | 25-30MB | Thấp | Xuất sắc | Production standard |
| Custom nginx (scratch) | 5-8MB | Cao | Xuất sắc | Size-critical |
| BusyBox httpd | 1-2MB | Thấp | Cơ bản | Ultra-minimal |
| Go embed (scratch) | 3-5MB | Trung bình | Xuất sắc | Single binary deploy |
| Caddy | 40-50MB | Thấp | Tốt | Auto HTTPS |

---

## 9. Checklist Production

### ✅ Build Optimization

- [ ] Multi-stage build
- [ ] pnpm với cache mount
- [ ] Xóa source maps, license files
- [ ] Pre-compress với gzip/brotli
- [ ] .dockerignore đầy đủ

### ✅ Nginx Configuration

- [ ] SPA fallback (try_files)
- [ ] gzip_static enabled
- [ ] Security headers
- [ ] Cache control cho assets
- [ ] No cache cho index.html

### ✅ Security

- [ ] Non-root user
- [ ] Security headers (X-Frame-Options, etc.)
- [ ] Pin base image version
- [ ] Không expose source maps

### ✅ Performance

- [ ] Long cache cho static assets
- [ ] Pre-compression
- [ ] sendfile, tcp_nopush enabled
- [ ] Worker connections tuned

### ✅ Observability

- [ ] Healthcheck endpoint
- [ ] OCI labels
- [ ] STOPSIGNAL configured

---

## 🔧 Common Issues

### Issue: Client-side routing 404

**Nguyên nhân**: Nginx không biết fallback về index.html

**Fix**:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### Issue: Assets không cache

**Fix**:
```nginx
location ~* \.(js|css|png|jpg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Issue: Old version vẫn hiển thị

**Nguyên nhân**: Browser cache index.html

**Fix**:
```nginx
location = /index.html {
    expires -1;
    add_header Cache-Control "no-cache";
}
```

---

## 10. Docker Compose cho React

### Development Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder  # Stop at builder stage
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://localhost:8080
    volumes:
      - .:/app:cached
      - /app/node_modules  # Exclude node_modules
    command: pnpm dev --host

  # Mock API for development
  api-mock:
    image: mockoon/cli:latest
    ports:
      - "8080:8080"
    volumes:
      - ./mock-api.json:/data/mock-api.json
    command: --data /data/mock-api.json --port 8080
```

### Production with Nginx

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:3000"
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M
      replicas: 2
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
    restart: unless-stopped
```

### Full Stack Example

```yaml
# docker-compose.full-stack.yml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://api:8080
    depends_on:
      - api

  api:
    build:
      context: ./backend
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/db
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d db"]

volumes:
  postgres-data:
```

---

## 11. CI/CD cho React

### GitHub Actions

```yaml
# .github/workflows/react-docker.yml
name: React Docker Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

      - name: Build
        run: pnpm build

  build-docker:
    needs: test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            VERSION=${{ github.ref_name }}

      - name: Scan image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
          format: 'table'
          exit-code: '1'
          severity: 'HIGH,CRITICAL'
```

### Lighthouse CI (Optional)

```yaml
# Thêm vào workflow
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v10
  with:
    urls: |
      http://localhost:3000
    uploadArtifacts: true
    temporaryPublicStorage: true
```

---

*Xem thêm: [COOKBOOK.md](../COOKBOOK.md) cho best practices chung*
