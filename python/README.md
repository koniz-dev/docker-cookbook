# 🐍 Python Dockerfile Best Practices

> Hướng dẫn tối ưu Dockerfile cho ứng dụng Python, đặc biệt là FastAPI/Flask.

---

## 📑 Mục lục

- [0. Python Fundamentals cho Docker](#0-python-fundamentals-cho-docker)
- [1. Tổng quan](#1-tổng-quan)
- [2. Base Images cho Python](#2-base-images-cho-python)
- [3. Package Managers](#3-package-managers)
- [4. Kỹ thuật tối ưu](#4-kỹ-thuật-tối-ưu)
- [5. Distroless cho Python](#5-distroless-cho-python)
- [6. Environment Variables](#6-environment-variables)
- [7. Healthcheck cho Python](#7-healthcheck-cho-python)
- [8. Bảng so sánh](#8-bảng-so-sánh-các-phương-pháp)
- [9. Checklist Production](#9-checklist-production)
- [10. Docker Compose](#10-docker-compose-cho-python)
- [11. CI/CD](#11-cicd-cho-python)

---

## 0. Python Fundamentals cho Docker

### glibc vs musl (Alpine compatibility)

Đây là vấn đề đau đầu nhất khi dùng Python trên Docker.

| Libc | OS | Đặc điểm | Tương thích Python |
|------|----|----------|--------------------|
| **glibc** | Debian, Ubuntu, Fedora | Chuẩn chung của Linux (GNU) | ✅ Tốt nhất (Manylinux wheels) |
| **musl** | Alpine | Nhẹ, clean code | ⚠️ Kém, cần compile từ source |

**💡 Tại sao `pip install` fail trên Alpine?**
Nhiều thư viện Python (numpy, pandas, psycopg2) là C extensions. PyPI cung cấp sẵn bản compiled (wheels) cho **glibc**.
- Trên **Debian/Slim**: pip tải wheel về chạy ngay → Nhanh.
- Trên **Alpine**: pip không tìm thấy wheel cho musl → Tự compile từ source → Cần GCC, headers → Chậm & dễ lỗi.

### Python Wheels là gì?

Wheel (`.whl`) là định dạng binary distribution của Python packages.

```
numpy-1.26.0-cp311-cp311-manylinux_2_17_x86_64.whl
│            │     │     │             │
│            │     │     │             └── Architecture (amd64)
│            │     │     └──────────────── Platform (glibc compatible)
│            │     └────────────────────── ABI tag
│            └──────────────────────────── Python version (3.11)
└───────────────────────────────────────── Package name & version
```

**💡 Lợi ích của Wheels:**
- **Installation Speed**: Không cần compile, chỉ cần unzip.
- **Size**: Build tools (gcc, make) không cần thiết trong runtime image.

### Tại sao cần Virtual Environment (venv) trong Docker?

"Docker đã là isolation rồi, tại sao cần venv?"

1.  **System vs App**: Debian/Ubuntu có sắn Python hệ thống (`/usr/bin/python3`). Nếu dùng pip trực tiếp (`pip install ...`), bạn có thể làm hỏng system packages (lỗi `ExternallyManagedEnvironment`).
2.  **Multi-stage COPY**: Dễ dàng copy toàn bộ dependencies từ builder sang runtime bằng cách copy folder `/opt/venv`.

```dockerfile
# Builder stage
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install -r requirements.txt

# Runtime stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
```

### GIL & Workers Configuration

Python (CPython) có **Global Interpreter Lock (GIL)**, chỉ cho phép 1 thread chạy code Python tại một thời điểm (trước Python 3.13 no-GIL).

**💡 Ý nghĩa khi chạy trong Container:**
- Một container 1-process chỉ dùng được **1 CPU core** cho Python code.
- Để tận dụng multi-core, phải dùng **Process Manager** (Gunicorn/Uvicorn workers).

**Formula:**
`WORKERS = 2 * CPU_CORES + 1`

Ví dụ container limit `cpus: '2'`:
→ Set `WEB_CONCURRENCY=5` (hoặc 4 workers).

---

## 1. Tổng quan

Python applications có đặc thù riêng:
- **Interpreted language**: Cần Python runtime
- **Dependencies**: Nhiều packages có native extensions (C/C++)
- **Virtual environments**: Best practice để isolate
- **libc compatibility**: Alpine (musl) vs Debian (glibc)

### Mục tiêu tối ưu

| Tiêu chí | Target |
|----------|--------|
| Image size | < 150MB (slim), < 80MB (alpine) |
| Startup time | < 3s |
| Security | 0 HIGH/CRITICAL CVEs |
| Build time | < 2 phút với cache |

---

## 2. Base Images cho Python

### Bảng so sánh

| Base Image | Size | libc | Ưu điểm | Nhược điểm |
|------------|------|------|---------|------------|
| `python:3.13` | ~900MB | glibc | Đầy đủ, dễ dùng | Quá lớn cho production |
| `python:3.13-slim` | ~120MB | glibc | Cân bằng size/compatibility | Thiếu build tools |
| `python:3.13-alpine` | ~50MB | musl | Rất nhỏ | Native packages có thể fail |
| `gcr.io/distroless/python3` | ~50MB | glibc | Cực kỳ secure | Không có pip, khó setup |

### Alpine vs Slim - Khi nào dùng gì?

**Dùng Alpine khi:**
- Ứng dụng chỉ dùng pure Python packages
- Không có native extensions (numpy, pandas)
- Size là ưu tiên hàng đầu

**Dùng Slim khi:**
- Có packages cần compile (numpy, pandas, pillow)
- Cần tương thích với nhiều libraries
- Gặp lỗi với Alpine

### Vấn đề với Alpine

```dockerfile
# Packages này CÓ THỂ fail trên Alpine
pip install numpy pandas scipy pillow cryptography

# Vì cần glibc nhưng Alpine dùng musl
# Workaround: Install build deps
RUN apk add --no-cache gcc musl-dev python3-dev
```

---

## 3. Package Managers

### Bảng so sánh

| Tool | Speed | Lockfile | Disk Usage | Best For |
|------|-------|----------|------------|----------|
| **pip** | Chậm | requirements.txt | Cao | Simple projects |
| **pip-tools** | Chậm | requirements.txt | Cao | Deterministic builds |
| **poetry** | Trung bình | poetry.lock | Trung bình | Full project management |
| **uv** | **Rất nhanh** | uv.lock | **Thấp** | **Modern, fast builds** |

### uv - Package Manager hiện đại

`uv` là package manager mới từ Astral (makers of Ruff), nhanh hơn pip 10-100x.

```dockerfile
FROM python:3.13-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./

# Install dependencies với cache
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Copy source và install project
COPY src/ src/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev
```

### pip với requirements.txt

```dockerfile
FROM python:3.13-slim

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .
```

---

## 4. Kỹ thuật tối ưu

### 4.1 Multi-stage Build

```dockerfile
# Stage 1: Builder
FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc python3-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

# Stage 2: Runtime
FROM python:3.13-slim

WORKDIR /app

# Copy installed packages
COPY --from=builder /install /usr/local

# Copy source
COPY src/ ./src/

USER 1000
CMD ["python", "-m", "src.main"]
```

### 4.2 Wheels Pre-building

Pre-build wheels để tránh compile trong runtime stage:

```dockerfile
FROM python:3.13-slim AS builder

COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

FROM python:3.13-slim
COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels -r requirements.txt && \
    rm -rf /wheels
```

### 4.3 Strip Unnecessary Files

```dockerfile
# Xóa bytecode cache
RUN find /usr/local -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
RUN find /usr/local -type f -name '*.pyc' -delete

# Xóa pip, setuptools (không cần trong runtime)
RUN rm -rf /usr/local/lib/python3.13/site-packages/pip* \
           /usr/local/lib/python3.13/site-packages/setuptools*

# Xóa test files
RUN find /usr/local -type d -name tests -exec rm -rf {} + 2>/dev/null || true
```

### 4.4 Virtual Environment trong Docker

```dockerfile
FROM python:3.13-slim

# Tạo venv
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install vào venv
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["python", "app.py"]
```

### 4.5 Aggressive Optimization (Extreme Size Reduction)

Kỹ thuật tối ưu "cực đoan" để giảm kích thước image tới mức tối đa:

```dockerfile
FROM python:3.13-alpine AS builder

# Install dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt

# ULTRA AGGRESSIVE optimization
RUN apk add --no-cache binutils && \
    # Strip ALL .so files
    find /install -type f \( -name '*.so*' -o -name '*.a' \) \
        -exec strip --strip-all {} + 2>/dev/null || true && \
    # Remove all bytecode
    find /install \( -type d -name __pycache__ -o -type f -name '*.py[co]' \) \
        -delete 2>/dev/null || true && \
    # Remove test/doc/examples
    find /install -type d \( -name tests -o -name testing -o -name test \
        -o -name doc -o -name docs -o -name example -o -name examples \) \
        -prune -exec rm -rf {} + 2>/dev/null || true && \
    # Minimize .dist-info (keep only essential files)
    find /install -name '*.dist-info' -type d -exec sh -c \
        'cd "$1" && find . -type f ! -name "METADATA" ! -name "top_level.txt" -delete' _ {} \; 2>/dev/null || true && \
    # Remove typing stubs, headers, C files
    find /install -type f \( -name '*.pyi' -o -name '*.c' -o -name '*.h' \) -delete && \
    # Remove license/readme files
    find /install -type f \( -name 'LICENSE*' -o -name 'README*' -o -name 'CHANGELOG*' \) \
        -delete 2>/dev/null || true
```

### 4.6 PYTHONOPTIMIZE - Bytecode Optimization

```dockerfile
# Level 0 (default): Không tối ưu
# Level 1 (-O): Remove assert statements
# Level 2 (-OO): Remove assert + docstrings

ENV PYTHONOPTIMIZE=2
```

| Level | Flag | Effect | Size Reduction |
|-------|------|--------|----------------|
| 0 | (none) | Full bytecode | - |
| 1 | `-O` | Remove asserts | ~5% |
| 2 | `-OO` | Remove asserts + docstrings | ~10-15% |

**Lưu ý**: Level 2 có thể break code nếu code sử dụng `__doc__`.

### 4.7 CVE Auto-fix trong Build

Tự động patch CVE bằng cách parse `pyproject.toml` và upgrade vulnerable packages:

```dockerfile
FROM python:3.13-slim AS builder

COPY pyproject.toml ./

# Fix CVE bằng cách upgrade starlette/fastapi
RUN python << 'PY'
import tomllib, pathlib, re

def parse_req(s):
    m = re.match(r'^\s*([A-Za-z0-9_.-]+)(\[[^\]]+\])?\s*(.*)$', s)
    if m:
        return m.group(1), (m.group(2) or ''), (m.group(3) or '')
    return s.split('[')[0], '', ''

data = tomllib.loads(pathlib.Path('pyproject.toml').read_text())
deps = data.get('project', {}).get('dependencies', [])
safe = []

for d in deps:
    name, extras, rest = parse_req(d)
    norm = name.lower().replace('_','-')
    # Force upgrade vulnerable packages
    if norm == 'fastapi':
        safe.append(f'fastapi{extras}>=0.118,<0.121')
    elif norm == 'starlette':
        safe.append('starlette>=0.49.1,<0.50')
    else:
        safe.append(d)

# Add missing security patches
if 'starlette' not in [parse_req(d)[0].lower() for d in deps]:
    safe.append('starlette>=0.49.1,<0.50')

pathlib.Path('/requirements.safe.txt').write_text('\n'.join(safe) + '\n')
print('Patched deps:', *safe, sep='\n- ')
PY

RUN pip install -r /requirements.safe.txt
```

---

## 5. Distroless cho Python

Distroless là base image cực kỳ minimal, không có shell, package manager, hay bất kỳ tools nào.

### Challenges

1. **Không có pip** → Phải copy packages từ builder
2. **Không có shell** → Khó debug
3. **Shared libraries** → Phải copy đúng libs cần thiết

### Pattern cho Distroless

```dockerfile
FROM python:3.13-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --target=/app/deps -r requirements.txt

COPY src/ ./src/

# Runtime với distroless
FROM gcr.io/distroless/python3-debian12

WORKDIR /app
COPY --from=builder /app/deps /app/deps
COPY --from=builder /app/src /app/src

ENV PYTHONPATH=/app/deps
CMD ["src/main.py"]
```

### Multi-arch Distroless

Khi build cho multiple architectures (amd64, arm64), cần copy đúng shared libraries.

**Danh sách shared libraries thường cần:**

```dockerfile
ARG TARGETARCH

# Copy shared libraries đủ để chạy Python trong distroless
# Kiểm tra shared libraries cần với: ldd $(which python3)
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        LIBARCH="x86_64"; \
    elif [ "$TARGETARCH" = "arm64" ]; then \
        LIBARCH="aarch64"; \
    else \
        LIBARCH="unknown"; \
    fi && \
    mkdir -p /lib/multi-arch && \
    # Core libraries
    cp /lib/${LIBARCH}-linux-gnu/libc.so.6 /lib/multi-arch/ && \
    cp /lib/${LIBARCH}-linux-gnu/libm.so.6 /lib/multi-arch/ && \
    cp /lib/${LIBARCH}-linux-gnu/libz.so.1 /lib/multi-arch/ && \
    cp /lib/${LIBARCH}-linux-gnu/libgcc_s.so.1 /lib/multi-arch/ && \
    # SSL/Crypto (nếu cần)
    cp /lib/${LIBARCH}-linux-gnu/libssl.so.* /lib/multi-arch/ 2>/dev/null || true && \
    cp /lib/${LIBARCH}-linux-gnu/libcrypto.so.* /lib/multi-arch/ 2>/dev/null || true
```

**Trong runtime stage:**

```dockerfile
FROM gcr.io/distroless/base-debian12:nonroot

# Copy shared libraries
COPY --from=builder /lib/multi-arch/ /lib/multi-arch/

# Set LD_LIBRARY_PATH để tìm shared libs
ENV LD_LIBRARY_PATH=/lib/multi-arch
```

**Lưu ý**: `gcr.io/distroless/base-debian12` đã có sẵn một số shared libraries, chỉ cần copy những gì còn thiếu.

---

## 6. Environment Variables

### Python-specific ENV

```dockerfile
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
```

### Giải thích

| Variable | Mục đích |
|----------|----------|
| `PYTHONDONTWRITEBYTECODE=1` | Không tạo .pyc files (giảm size) |
| `PYTHONUNBUFFERED=1` | Output không bị buffer (logs realtime) |
| `PYTHONFAULTHANDLER=1` | In traceback khi crash |
| `PYTHONHASHSEED=random` | Security: random hash seed |
| `PIP_NO_CACHE_DIR=1` | Không cache pip downloads |

### Application ENV

```dockerfile
ENV HOST=0.0.0.0 \
    PORT=8000 \
    WORKERS=4 \
    LOG_LEVEL=INFO
```

---

## 7. Healthcheck cho Python

### HTTP Check với curl

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
```

### Không cần curl (Pure Python)

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import http.client; c=http.client.HTTPConnection('localhost', 8000); c.request('GET', '/health'); exit(0 if c.getresponse().status==200 else 1)"
```

### Với wget (Alpine)

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8000/health || exit 1
```

---

## 8. Bảng so sánh các phương pháp

| Phương pháp | Image Size | Build Time | Compatibility | Security | Use Case |
|-------------|------------|------------|---------------|----------|----------|
| python:slim + pip | 150-200MB | Chậm | Cao | Trung bình | Đơn giản, nhanh start |
| python:alpine + pip | 80-120MB | Chậm | Thấp | Trung bình | Pure Python only |
| slim + uv | 140-180MB | **Rất nhanh** | Cao | Trung bình | Modern projects |
| alpine + uv | 70-100MB | **Rất nhanh** | Thấp | Trung bình | Size-critical |
| distroless | 50-80MB | Trung bình | Trung bình | **Rất cao** | Security-critical |

---

## 9. Checklist Production

### ✅ Security

- [ ] Chạy với non-root user (USER 1000)
- [ ] Pin base image với SHA digest
- [ ] Không include pip, setuptools trong runtime
- [ ] Scan CVEs với trivy/grype
- [ ] Không hardcode secrets

### ✅ Performance

- [ ] Sử dụng uv hoặc pip với cache mount
- [ ] Multi-stage build để giảm size
- [ ] Set `PYTHONDONTWRITEBYTECODE=1`
- [ ] Set `PYTHONUNBUFFERED=1` cho logs

### ✅ Size Optimization

- [ ] Xóa __pycache__, .pyc files
- [ ] Xóa test files, docs
- [ ] Chỉ copy files cần thiết
- [ ] Sử dụng .dockerignore

### ✅ Observability

- [ ] Healthcheck endpoint
- [ ] STOPSIGNAL SIGTERM
- [ ] OCI labels
- [ ] Structured logging

---

## 🔧 Fixing Common Issues

### Issue: pip install fails on Alpine

```dockerfile
# Install build dependencies
RUN apk add --no-cache gcc musl-dev python3-dev libffi-dev

# After pip install, remove build deps
RUN apk del gcc musl-dev python3-dev libffi-dev
```

### Issue: Container chạy root

```dockerfile
# Tạo user và switch
RUN adduser -D -u 1000 appuser
USER appuser
```

### Issue: Logs không hiện realtime

```dockerfile
ENV PYTHONUNBUFFERED=1
# Hoặc chạy với -u flag
CMD ["python", "-u", "app.py"]
```

---

## 10. Docker Compose cho Python

### FastAPI Development Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=development
      - DEBUG=true
      - DATABASE_URL=postgresql://user:password@postgres:5432/mydb
    volumes:
      - ./src:/app/src:cached
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      start_period: 10s
      retries: 3
    command: uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d mydb"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres-data:
```

### Production Override

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    command: uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4
    environment:
      - ENVIRONMENT=production
      - DEBUG=false
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
      replicas: 2
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

### Celery Worker Setup

```yaml
# docker-compose.yml (thêm vào)
services:
  celery-worker:
    build: .
    command: celery -A src.celery worker --loglevel=info
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
    depends_on:
      - redis
    deploy:
      replicas: 2

  celery-beat:
    build: .
    command: celery -A src.celery beat --loglevel=info
    environment:
      - CELERY_BROKER_URL=redis://redis:6379/0
    depends_on:
      - redis
```

---

## 11. CI/CD cho Python

### GitHub Actions

```yaml
# .github/workflows/python-docker.yml
name: Python Docker Build

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

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'
          cache: 'pip'

      - name: Install dependencies
        run: |
          pip install uv
          uv sync --dev

      - name: Run tests
        run: uv run pytest --cov=src

      - name: Lint
        run: uv run ruff check src/

  build:
    needs: test
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

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

      - name: Scan image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
          exit-code: '1'
          severity: 'HIGH,CRITICAL'
```

---

*Xem thêm: [COOKBOOK.md](../COOKBOOK.md) cho best practices chung*
