# 🐳 Docker Cookbook

> **Bộ sưu tập các best practices, patterns và kỹ thuật tối ưu Dockerfile cho Production.**

Dự án này cung cấp hướng dẫn chi tiết, từ cơ bản đến nâng cao (thậm chí là extreme optimization), giúp bạn build Docker images:
- 📉 **Nhỏ gọn nhất** (Size optimization)
- 🚀 **Khởi động nhanh nhất** (Startup optimization)
- 🛡️ **An toàn nhất** (Security hardening)
- ⚡ **Build hiệu quả nhất** (Build caching & CI/CD)

---

## 📂 Cấu trúc dự án

Dự án được chia thành các modules theo ngôn ngữ/framework phổ biến:

### 1. 📘 [COOKBOOK.md](./COOKBOOK.md) (Core Guide)
Tài liệu nền tảng, áp dụng cho mọi ngôn ngữ:
- **Fundamentals**: Container vs VM, Layers, OCI.
- **Size Optimization**: Multi-stage builds, UPX, Brotli.
- **Security**: Non-root, distroless, scanning.
- **BuildKit**: Cache mounts, secrets, SSH agents.
- **CI/CD & Compose**: Patterns chuẩn cho DevOps.

### 2. ☕ [Java / Spring Boot](./java/README.md)
Tối ưu hóa cho hệ sinh thái Java:
- **Zero-waste**: Custom JRE với `jlink` (~40MB JRE).
- **Fast Startup**: JVM Tuning, CDS, Spring Boot Layertools.
- **Security**: Distroless images, auto-dependency updates.
- **Native**: GraalVM Native Image compilation.

### 3. 🐍 [Python / FastAPI](./python/README.md)
Tối ưu hóa cho Python backend:
- **Performance**: `uv` package manager (nhanh gấp 10-100x pip), `PYTHONOPTIMIZE`.
- **Compatibility**: Xử lý vấn đề `glibc` vs `musl` (Alpine).
- **Security**: Multi-arch Distroless, CVE auto-patching.
- **Structure**: Virtual environments pattern.

### 4. ⚛️ [React / Vite](./react/README.md)
Tối ưu hóa cho Frontend SPA:
- **Extreme Size**: Scratch image với static Nginx (~5MB).
- **Performance**: Pre-compression (Brotli/Gzip), Nginx caching strategy.
- **Routing**: SPA fallback patterns.
- **Alternatives**: Go FastHTTP server, BusyBox httpd.

---

## 🚀 Quick Start

### Xem các ví dụ mẫu

Mỗi thư mục ngôn ngữ đều chứa các `Dockerfile` mẫu có thể chạy ngay:

```bash
# Production ready
docker build -t java-app ./java
docker build -t python-app ./python
docker build -t react-app ./react

# Extreme optimization / Security variants
docker build -f java/Dockerfile.distroless -t java-secure ./java
docker build -f python/Dockerfile.distroless -t python-secure ./python
docker build -f react/Dockerfile.scratch -t react-minimal ./react
```

### Sao chép và áp dụng

1.  Tìm thư mục tương ứng với stack của bạn.
2.  Đọc `README.md` trong thư mục đó để hiểu các concepts.
3.  Copy `Dockerfile` mẫu.
4.  Điều chỉnh tên file, port và build commands cho phù hợp dự án của bạn.

---

## 💡 Philosophy (Triết lý)

1.  **Defaults to Secure**: Luôn chạy non-root, readonly filesystem nếu có thể.
2.  **Every Byte Counts**: Không để file rác, cache thừa trong production image.
3.  **Build Once, Run Anywhere**: Tận dụng multi-platform builds.
4.  **Fail Fast**: Healthcheck chuẩn, signal handling đúng cách.

---

## 🤝 Contributing

Mọi đóng góp (PR, Issue) đều được hoan nghênh! Hãy mở issue nếu bạn muốn request hướng dẫn cho framework khác (Golang, Rust, Node.js API...).

---

*© 2025 Koniz Dev. Open source under MIT License.*
