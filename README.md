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
- **Extreme Size**: Scratch image with statically compiled Nginx (~5MB).
- **Performance**: Pre-compression (Gzip), Nginx caching strategy.
- **Routing**: SPA fallback patterns.

### 7. 🦀 [Rust / Axum](./rust/README.md)
Optimized for Rust services:
- **cargo-chef**: cached dependency builds.
- **Static musl**: portable single binary.
- **Distroless static**: ~9 MB final image.

### 8. 🥟 [Bun](./bun/README.md)
Optimized for Bun runtimes:
- **`bun install`**: 5-20× faster than npm.
- **`--compile`**: standalone executable for distroless deploys.

### 9. 🟣 [.NET / ASP.NET Core](./dotnet/README.md)
Optimized for .NET 9 services:
- **Chiseled Ubuntu**: distroless-style runtime, glibc-based.
- **Non-root by default** (UID 1654, `app` user).
- **`CreateSlimBuilder`**: trim-friendly minimal API host.

---

## 🚀 Quick Start

### Check out Examples

Each module contains ready-to-run `Dockerfile` examples:

```bash
# All variants in one shot via the Makefile
make build       # build every cookbook-* image
make sizes       # print a Markdown table of real measured sizes
make sizes.md    # write SIZES.md
./scripts/bench.sh   # cold start + RSS + throughput → BENCHMARKS.md

# Or build individually
docker build -t java-app ./java
docker build -f java/Dockerfile.distroless -t java-secure ./java
docker build -f go/Dockerfile.scratch -t go-extreme ./go
# ...etc
```

> **Sample apps** are included in each language folder (a minimal HTTP server
> with `/` and `/health`). So `docker build ./go` works end-to-end against the
> sample; swap in your own app code by replacing the sources.

See [`SIZES.md`](./SIZES.md) and [`BENCHMARKS.md`](./BENCHMARKS.md) for live measurements, and [`docs/distroless-debugging.md`](./docs/distroless-debugging.md) for surviving when something breaks inside a shell-less image.

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
