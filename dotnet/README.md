# 🟣 .NET Dockerfile Best Practices

> Guide to running ASP.NET Core 9 in production containers using Microsoft's chiseled Ubuntu base images.

---

## 1. Overview

| File | Description | Measured Size | Use Case |
|------|-------------|---------------|----------|
| `Dockerfile` | SDK build + `aspnet:9.0-noble-chiseled` | **170 MB** | Default for ASP.NET Core 9 services |

```mermaid
flowchart LR
    SRC[C# source] --> SDK[mcr.microsoft.com/dotnet/sdk:9.0-alpine<br/>restore + publish]
    SDK --> PUB[/app/publish - DLLs + runtime]
    PUB -->|+ chiseled aspnet| CHISEL([noble-chiseled<br/>~170 MB])

    classDef out fill:#dbeafe,stroke:#1e40af,color:#1e3a8a;
    class CHISEL out;
```

---

## 2. Why chiseled Ubuntu?

Microsoft's `-noble-chiseled` images are .NET's answer to distroless: only the minimum filesystem needed by `dotnet` to run, no shell, no package manager. They run as a non-root `app` user (UID 1654) by default.

| Tag | Approximate base | Shell |
|-----|------------------|-------|
| `aspnet:9.0-noble` | Full Ubuntu 24.04 | ✅ |
| `aspnet:9.0-noble-chiseled` | Minimal Ubuntu, glibc, libssl | ❌ |
| `aspnet:9.0-alpine` | Alpine + musl | ✅ |

Chiseled is the production default — it's smaller than Ubuntu, more secure (no shell), and runs glibc so native deps work like on regular Linux. Alpine is fine if you prefer musl + the option to `apk` into the image at runtime.

---

## 3. Layer ordering for fast iteration

```dockerfile
COPY sample.csproj ./
RUN dotnet restore    # cached until csproj changes

COPY . .
RUN dotnet publish    # only this layer invalidates on source edits
```

`dotnet restore` populates `/root/.nuget/packages/` with ~hundreds of MB of NuGet packages on first build. Splitting restore from publish means an edit to `Program.cs` reuses the package layer.

For multi-project solutions, restore each `csproj` first, then `COPY . .` and publish.

---

## 4. Why not AOT for ASP.NET Core?

ASP.NET Core 9 supports `PublishAot=true`, producing a single native binary (~10-15 MB). It's tempting:

- Cold start drops from ~150 ms to ~20 ms
- No JIT, no metadata, smaller memory footprint

But the catch — the minimal API surface (`MapGet(Delegate)`, model binding, JSON via reflection, MVC controllers) emits **trim warnings** that silently break at runtime. Going AOT requires:

- Using source-generated routing (`MapGet` with typed lambdas)
- Replacing reflection-based JSON with `System.Text.Json` source generators
- Auditing every NuGet for `[RequiresUnreferencedCode]`

For a **new project** designed AOT-first, it works. Retrofitting an existing API is a project of its own. This cookbook ships the standard JIT path; you can graduate to AOT once your app surface is trim-safe.

---

## 5. Production Checklist

- [ ] Use `WebApplication.CreateSlimBuilder` instead of `CreateBuilder`
- [ ] Pin .NET SDK version (avoid `:latest`)
- [ ] Chiseled runtime image for production
- [ ] Restore in its own layer for cache reuse
- [ ] `DOTNET_RUNNING_IN_CONTAINER=true` (informs runtime)
- [ ] Non-root (chiseled does this by default — UID 1654)
- [ ] `ASPNETCORE_URLS=http://+:8080` (or your port)
- [ ] Healthcheck endpoint (`/health` or built-in Health Checks)
- [ ] Set up `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true` if you don't need ICU (saves ~30 MB)
