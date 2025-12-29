# 🐳 Docker Cookbook

> **A collection of production-grade Dockerfile best practices, optimization patterns, and advanced techniques.**

This project provides comprehensive guides, ranging from fundamentals to advanced (and extreme) optimization techniques, helping you build Docker images that are:
- 📉 **Smallest** (Size optimization)
- 🚀 **Fastest Startup** (Startup optimization)
- 🛡️ **Most Secure** (Security hardening)
- ⚡ **Most Efficient** (Build caching & CI/CD)

---

## 📂 Project Structure

The project is organized into modules based on popular languages/frameworks:

### 1. 📘 [COOKBOOK.md](./COOKBOOK.md) (Core Guide)
The foundational guide applicable to all stacks:
- **Fundamentals**: Containers vs VMs, Layers, OCI standards.
- **Size Optimization**: Multi-stage builds, UPX, Brotli.
- **Security**: Non-root users, distroless images, vulnerability scanning.
- **BuildKit**: Cache mounts, secrets, SSH agents.
- **CI/CD & Compose**: Standard patterns for DevOps.

### 2. ☕ [Java / Spring Boot](./java/README.md)
Optimized for the Java ecosystem:
- **Zero-waste**: Custom JRE with `jlink` (~40MB JRE).
- **Fast Startup**: JVM Tuning, CDS, Spring Boot Layertools.
- **Security**: Distroless images, auto-dependency updates.
- **Native**: GraalVM Native Image compilation.

### 3. 🐍 [Python / FastAPI](./python/README.md)
Optimized for Python backends:
- **Performance**: `uv` package manager (10-100x faster than pip), `PYTHONOPTIMIZE`.
- **Compatibility**: Solving `glibc` vs `musl` (Alpine) issues.
- **Security**: Multi-arch Distroless, CVE auto-patching.
- **Structure**: Virtual environment patterns.

### 4. 🟩 [Node.js / Express](./node/README.md)
Optimized for Node.js Backends/APIs:
- **Stability**: `tini` for proper signal handling (PID 1).
- **Security**: non-root user enforcement, distroless options.
- **Efficiency**: `pnpm deploy` for ultimate dependency pruning.
- **Production**: Multi-stage builds with minimal final image.

### 5. 🐹 [Golang](./go/README.md)
Optimized for Go Applications:
- **Static**: `CGO_ENABLED=0` pure Go builds.
- **Extreme**: `FROM scratch` + UPX compression (~2-5MB final image).
- **Self-contained**: Inject SSL certs and user data into scratch.
- **Security**: Zero-OS images for maximum hardening.

### 6. ⚛️ [React / Vite](./react/README.md)
Optimized for Frontend SPAs:
- **Extreme Size**: Scratch image with static Nginx (~5MB).
- **Performance**: Pre-compression (Brotli/Gzip), Nginx caching strategy.
- **Routing**: SPA fallback patterns.
- **Alternatives**: Go FastHTTP server, BusyBox httpd.

---

## 🚀 Quick Start

### Check out Examples

Each module contains ready-to-run `Dockerfile` examples:

```bash
# Production ready
docker build -t java-app ./java
docker build -t python-app ./python
docker build -t node-app ./node
docker build -t go-app ./go
docker build -t react-app ./react

# Extreme optimization / Security variants
docker build -f java/Dockerfile.distroless -t java-secure ./java
docker build -f python/Dockerfile.distroless -t python-secure ./python
docker build -f node/Dockerfile.distroless -t node-secure ./node
docker build -f go/Dockerfile.distroless -t go-secure ./go
docker build -f go/Dockerfile.scratch -t go-extreme ./go   # ULTIMATE (~2-5MB)
docker build -f react/Dockerfile.scratch -t react-minimal ./react
```

### Copy and Apply

1.  Navigate to the directory matching your stack.
2.  Read the `README.md` to understand the concepts.
3.  Copy the sample `Dockerfile`.
4.  Adjust filenames, ports, and build commands to fit your project.

---

## 💡 Philosophy

1.  **Defaults to Secure**: Always run as non-root, read-only filesystem where possible.
2.  **Every Byte Counts**: No waste, no redundant caches in production images.
3.  **Build Once, Run Anywhere**: Leverage multi-platform builds.
4.  **Fail Fast**: Proper healthchecks and signal handling.

---

## 🤝 Contributing

All contributions (PRs, Issues) are welcome! Please open an issue if you'd like to request a guide for another framework (Golang, Rust, Node.js API, etc.).

---

*© 2025 Koniz Dev. Open source under MIT License.*
