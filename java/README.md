# ☕ Java/Spring Boot Dockerfile Best Practices

> Hướng dẫn tối ưu Dockerfile cho ứng dụng Java, đặc biệt là Spring Boot.

---

## 📑 Mục lục

- [0. Java Fundamentals cho Docker](#0-java-fundamentals-cho-docker)
- [1. Tổng quan](#1-tổng-quan)
- [2. Base Images cho Java](#2-base-images-cho-java)
- [3. Kỹ thuật tối ưu](#3-kỹ-thuật-tối-ưu)
- [4. JVM Tuning cho Container](#4-jvm-tuning-cho-container)
- [5. Spring Boot Layertools](#5-spring-boot-layertools)
- [6. Custom JRE với jlink](#6-custom-jre-với-jlink)
- [7. Auto Dependency Update](#7-auto-dependency-update-cve-patching)
- [8. Healthcheck cho Java](#8-healthcheck-cho-java)
- [9. Bảng so sánh](#9-bảng-so-sánh-các-phương-pháp)
- [10. Dockerfile Variants](#10-dockerfile-variants)
- [11. Checklist Production](#11-checklist-production)
- [12. GraalVM Native Image](#12-graalvm-native-image)
- [13. Docker Compose](#13-docker-compose-cho-java)
- [14. CI/CD](#14-cicd-cho-java)

---

## 0. Java Fundamentals cho Docker

### JVM là gì và tại sao cần hiểu?

```
┌─────────────────────────────────────────────────────────────┐
│                    Java Application Stack                    │
├─────────────────────────────────────────────────────────────┤
│  Your Application Code (.java → .class)                     │
├─────────────────────────────────────────────────────────────┤
│  Third-party Libraries (JARs)                               │
├─────────────────────────────────────────────────────────────┤
│  Spring Boot Framework                                       │
├─────────────────────────────────────────────────────────────┤
│  Java Runtime Environment (JRE)                              │
│  ├── Java Class Library (rt.jar, modules)                   │
│  └── Java Virtual Machine (JVM)                             │
│      ├── JIT Compiler (HotSpot)                             │
│      ├── Garbage Collector                                   │
│      └── Class Loader                                        │
├─────────────────────────────────────────────────────────────┤
│  Operating System (Linux)                                    │
└─────────────────────────────────────────────────────────────┘
```

**💡 Tại sao JVM quan trọng trong Docker?**
- JVM **không tự biết** giới hạn memory của container (trước Java 10)
- JVM cố gắng sử dụng **toàn bộ RAM của host** → OOM kill
- Cần flags đặc biệt: `UseContainerSupport`, `MaxRAMPercentage`

### Fat JAR là gì?

Spring Boot đóng gói ứng dụng thành **Fat JAR** (còn gọi là Uber JAR):

```
app.jar (100MB)
├── BOOT-INF/
│   ├── classes/         ← Your compiled code (2MB)
│   │   └── com/myapp/...
│   └── lib/             ← ALL dependencies (98MB)
│       ├── spring-core-6.1.0.jar
│       ├── spring-boot-3.2.0.jar
│       ├── jackson-databind-2.15.0.jar
│       └── ... (hundreds of JARs)
├── META-INF/
│   └── MANIFEST.MF
└── org/springframework/boot/loader/
    └── JarLauncher.class
```

**💡 Vấn đề với Fat JAR:**
- Mỗi code change → push lại toàn bộ 100MB
- Dependencies ít thay đổi nhưng vẫn bị push lại
- **Giải pháp**: Spring Boot Layertools (xem section 5)

### Java Platform Module System (JPMS) - Cần cho jlink

JPMS (Java 9+) chia JDK thành các **modules** có thể chọn lọc:

```
java.base (required)     ← Core classes (String, Object, System)
java.logging             ← Logging API
java.sql                 ← JDBC
java.naming              ← JNDI
java.desktop             ← AWT/Swing (thường không cần)
java.xml                 ← XML processing
...
```

**💡 Tại sao JPMS quan trọng?**

Full JRE chứa **tất cả modules** (~200MB). Với `jlink`, bạn chọn **chỉ modules cần thiết**:

```bash
# Xem modules cần cho app
jdeps --print-module-deps app.jar
# Output: java.base,java.logging,java.sql,java.naming

# Tạo custom JRE chỉ với những modules đó
jlink --add-modules java.base,java.logging,java.sql,java.naming \
      --output custom-jre
# Kết quả: ~40MB thay vì ~200MB
```

### JVM Memory trong Container

**⚠️ Vấn đề quan trọng:**

```
┌─────────────────────────────────────────────────────────────┐
│              Container Memory (1GB limit)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              JVM Heap Memory                        │    │
│  │  -XX:MaxRAMPercentage=75 → Max ~750MB              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────┐     │
│  │  Metaspace (~100MB)  │  │  Native Memory (~100MB)  │     │
│  │  (Class metadata)    │  │  (JIT, GC, Threads)      │     │
│  └──────────────────────┘  └──────────────────────────┘     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Remaining for OS/Other (~50MB buffer)               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**💡 Tại sao không set 100% RAM cho Heap?**
- JVM cần memory cho: Metaspace, GC, JIT compiler, native threads
- Nếu Heap = 100% → OOM khi allocate native memory

**Rule of thumb:**

| Container RAM | MaxRAMPercentage | Actual Heap |
|---------------|------------------|-------------|
| 512MB | 50% | ~256MB |
| 1GB | 70% | ~700MB |
| 2GB | 75% | ~1.5GB |
| 4GB+ | 80% | ~3.2GB |

### CDS (Class Data Sharing) - Tăng tốc Startup

CDS cho phép share class metadata giữa các JVM instances:

```bash
# Bước 1: Generate class list
java -Xshare:off -XX:DumpLoadedClassList=classes.lst -jar app.jar

# Bước 2: Create archive
java -Xshare:dump -XX:SharedClassListFile=classes.lst \
     -XX:SharedArchiveFile=app-cds.jsa -jar app.jar

# Bước 3: Use archive (faster startup)
java -Xshare:on -XX:SharedArchiveFile=app-cds.jsa -jar app.jar
```

**💡 CDS giảm startup time 10-30%** bằng cách skip class parsing/verification.

---

## 1. Tổng quan

Java applications có đặc thù riêng:
- **JVM overhead**: Cần JRE/JDK để chạy
- **Startup time**: Thường chậm hơn compiled languages
- **Memory**: JVM cần cấu hình heap size phù hợp
- **Fat JAR**: Spring Boot JAR có thể > 100MB

### Mục tiêu tối ưu

| Tiêu chí | Target |
|----------|--------|
| Image size | < 150MB (với custom JRE) |
| Startup time | < 10s |
| Memory footprint | Phù hợp container limits |
| Security | 0 HIGH/CRITICAL CVEs |

---

## 2. Base Images cho Java

### Bảng so sánh

| Base Image | Size | JDK/JRE | Ưu điểm | Nhược điểm |
|------------|------|---------|---------|------------|
| `eclipse-temurin:21-jdk` | ~340MB | Full JDK | Có đủ tools (javac, jlink) | Quá lớn cho production |
| `eclipse-temurin:21-jre` | ~220MB | JRE only | Đủ để chạy app | Vẫn lớn |
| `eclipse-temurin:21-jre-alpine` | ~130MB | JRE + Alpine | Nhỏ gọn | musl libc có thể gây issues |
| `gcr.io/distroless/java21` | ~220MB | Distroless | Cực kỳ secure | Không có shell để debug |
| **Custom JRE (jlink)** | **~80-120MB** | Minimal | **Nhỏ nhất** | Cần build thêm |

### Khi nào dùng gì?

```
┌─────────────────────────────────────────────────────────────┐
│              Chọn Base Image cho Java                       │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    Development?                      Production?
            │                               │
            ▼                               ▼
    eclipse-temurin:21-jdk          Cần kích thước nhỏ nhất?
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                Custom JRE + Alpine              Distroless Java
                   (~80-100MB)                     (~220MB, secure)
```

---

## 3. Kỹ thuật tối ưu

### 3.1 Caching Gradle/Maven Dependencies

**Gradle với BuildKit cache:**

```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Copy build files trước
COPY gradlew build.gradle settings.gradle ./
COPY gradle/ gradle/

# Cache dependencies
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew dependencies --no-daemon

# Copy source và build
COPY src/ src/
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon -x test
```

**Maven với BuildKit cache:**

```dockerfile
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline

COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests
```

### 3.2 Multi-stage Build Pattern

```dockerfile
# Stage 1: Build
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app
COPY . .
RUN ./gradlew bootJar --no-daemon

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar

USER 1000
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
```

---

## 4. JVM Tuning cho Container

### Container-aware JVM Flags

```dockerfile
ENV JAVA_OPTS="\
    -XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=100 \
    -XX:+UseStringDeduplication \
    -XX:+ExitOnOutOfMemoryError \
    -Djava.security.egd=file:/dev/./urandom"

CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### Giải thích các flags

| Flag | Mục đích |
|------|----------|
| `UseContainerSupport` | JVM nhận biết container memory limits |
| `MaxRAMPercentage=75.0` | Sử dụng tối đa 75% RAM của container |
| `UseG1GC` | Garbage Collector phù hợp cho container |
| `ExitOnOutOfMemoryError` | Fail fast khi OOM thay vì bị treo |
| `java.security.egd` | Tăng tốc SecureRandom initialization |

### Memory Sizing Guide

| Container RAM | MaxRAMPercentage | Heap (approx) |
|---------------|------------------|---------------|
| 256MB | 50% | ~128MB |
| 512MB | 70% | ~360MB |
| 1GB | 75% | ~750MB |
| 2GB+ | 80% | ~1.6GB |

---

## 5. Spring Boot Layertools

Spring Boot 2.3+ hỗ trợ tách JAR thành các layers để tối ưu Docker caching.

### Tại sao cần Layertools?

```
Fat JAR (~100MB) = dependencies (ít thay đổi) + application code (thay đổi thường xuyên)
```

Nếu không dùng layertools, mỗi lần deploy phải push lại toàn bộ 100MB dù chỉ thay đổi 1 dòng code.

### Cách sử dụng

```dockerfile
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app
COPY . .
RUN ./gradlew bootJar --no-daemon

# Extract layers
RUN java -Djarmode=layertools -jar build/libs/*.jar extract --destination /extracted

# Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Copy theo thứ tự: ít thay đổi → nhiều thay đổi
COPY --from=builder /extracted/dependencies/ ./
COPY --from=builder /extracted/spring-boot-loader/ ./
COPY --from=builder /extracted/snapshot-dependencies/ ./
COPY --from=builder /extracted/application/ ./

USER 1000
EXPOSE 8080
CMD ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

### Layers hierarchy

| Layer | Nội dung | Tần suất thay đổi |
|-------|----------|-------------------|
| `dependencies/` | Third-party JARs | Thấp (weeks/months) |
| `spring-boot-loader/` | Spring Boot loader | Rất thấp |
| `snapshot-dependencies/` | SNAPSHOT JARs | Trung bình |
| `application/` | Your code | Cao (every commit) |

---

## 6. Custom JRE với jlink

`jlink` cho phép tạo JRE chỉ chứa các modules cần thiết, giảm đáng kể kích thước.

### Cách xác định modules cần thiết

```bash
# Phân tích dependencies của JAR
jdeps --ignore-missing-deps -q \
    --recursive \
    --multi-release 21 \
    --print-module-deps \
    --class-path 'BOOT-INF/lib/*' \
    app.jar
```

Output sẽ là danh sách modules, ví dụ:
```
java.base,java.logging,java.sql,java.naming,...
```

### Dockerfile với jlink

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app

# Build JAR
COPY . .
RUN ./gradlew bootJar --no-daemon

# Analyze và tạo custom JRE
RUN jar xf build/libs/app.jar && \
    jdeps --ignore-missing-deps -q \
        --recursive --multi-release 21 \
        --print-module-deps \
        --class-path 'BOOT-INF/lib/*' \
        build/libs/app.jar > deps.info

RUN jlink \
    --add-modules $(cat deps.info) \
    --strip-debug \
    --no-man-pages \
    --no-header-files \
    --compress=zip-9 \
    --output /custom-jre

# Runtime với custom JRE
FROM alpine:3.21
ENV JAVA_HOME=/opt/java
ENV PATH="$JAVA_HOME/bin:$PATH"

COPY --from=builder /custom-jre $JAVA_HOME
COPY --from=builder /app/build/libs/*.jar /app/app.jar

USER 1000
EXPOSE 8080
CMD ["java", "-jar", "/app/app.jar"]
```

### Kết quả

| Phương pháp | Image Size |
|-------------|------------|
| eclipse-temurin:21-jre | ~220MB |
| eclipse-temurin:21-jre-alpine | ~130MB |
| **Custom JRE + Alpine** | **~80-100MB** |
| **Custom JRE + Distroless** | **~90-110MB** |

---

## 7. Auto Dependency Update (CVE Patching)

Kỹ thuật tự động quét và cập nhật dependencies để patch CVEs trong quá trình build.

### Tại sao cần?

- Dependencies cũ thường chứa CVEs
- Manual update tốn thời gian
- CI/CD pipeline có thể tự động patch

### Cách hoạt động

1. Chạy `dependencyUpdates` để tạo report
2. Parse report file để tìm versions mới
3. Sử dụng `sed` để update `build.gradle`
4. Build với versions đã patch

### Dockerfile Implementation

```dockerfile
FROM gradle:8.14-jdk21-alpine AS builder
WORKDIR /app

COPY gradlew build.gradle settings.gradle ./
COPY gradle/ gradle/
COPY src/main src/main

# Tạo dependency update report
RUN ./gradlew --no-daemon dependencyUpdates -Drevision=release

# Auto-update script
RUN REPORT_FILE="build/dependencyUpdates/report.txt" && \
    echo "=== Parsing $REPORT_FILE ===" && \
    \
    # Danh sách plugins cần update
    PLUGINS_TO_UPGRADE="org.springframework.boot org.sonarqube" && \
    \
    # Danh sách dependencies cần update (GROUP:NAME:NEW_VERSION)
    DEPENDENCIES_FORCE_UPDATE="org.apache.commons:commons-lang3:3.19.0" && \
    \
    # Helper function để escape cho sed
    escape_sed() { printf '%s\n' "$1" | sed 's/[.[\*^$/&]/\\&/g'; } && \
    \
    # Plugin updates
    for plugin in $PLUGINS_TO_UPGRADE; do \
        LINE=$(grep -A1 "$plugin" "$REPORT_FILE" | grep '\[' | head -1 || true); \
        OLD_VERSION=$(echo "$LINE" | sed -E 's/.*\[(.*) -> .*\].*/\1/' || true); \
        NEW_VERSION=$(echo "$LINE" | sed -E 's/.*\[.* -> (.*)\].*/\1/' || true); \
        if [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$OLD_VERSION" ]; then \
            echo "Upgrading plugin $plugin: $OLD_VERSION → $NEW_VERSION"; \
            sed -i "s#id '$plugin' version '$(escape_sed "$OLD_VERSION")'#id '$plugin' version '$(escape_sed "$NEW_VERSION")'#g" build.gradle; \
        fi; \
    done && \
    \
    # Force dependency updates
    for dep in $DEPENDENCIES_FORCE_UPDATE; do \
        GROUP=$(echo "$dep" | cut -d':' -f1); \
        NAME=$(echo "$dep" | cut -d':' -f2); \
        NEW_VERSION=$(echo "$dep" | cut -d':' -f3); \
        echo "Forcing update: $GROUP:$NAME → $NEW_VERSION"; \
        sed -i "s#group: '$GROUP', name: '$NAME', version: '[^']*'#group: '$GROUP', name: '$NAME', version: '$NEW_VERSION'#g" build.gradle; \
    done && \
    \
    echo "Version upgrade complete!"

# Build với dependencies đã patch
RUN ./gradlew --no-daemon bootJar
```

### Lưu ý

| Aspect | Recommendation |
|--------|----------------|
| Timing | Chạy trong CI/CD, không phải mỗi local build |
| Testing | Luôn test sau khi auto-update |
| Pinning | Chỉ update patch/minor versions, cẩn thận major |
| Audit | Log lại những gì đã update |

---

## 8. Healthcheck cho Java

### Sử dụng Spring Boot Actuator

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health || exit 1
```

### Không cần curl (Pure Java)

```dockerfile
# Tạo class HealthCheck.java trong build stage
RUN cat > HealthCheck.java << 'EOF'
import java.net.*;
public class HealthCheck {
    public static void main(String[] args) {
        try {
            URL url = new URL("http://localhost:8080/health");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            System.exit(conn.getResponseCode() == 200 ? 0 : 1);
        } catch (Exception e) {
            System.exit(1);
        }
    }
}
EOF
RUN javac HealthCheck.java

# Trong runtime stage
COPY --from=builder HealthCheck.class /app/
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["java", "HealthCheck"]
```

### Start period cho Java

Java apps thường khởi động chậm, nên set `--start-period` cao (30-60s).

---

## 9. Bảng so sánh các phương pháp

| Phương pháp | Image Size | Build Time | Complexity | Security | Use Case |
|-------------|------------|------------|------------|----------|----------|
| JRE-alpine + JAR | 130-150MB | Nhanh | Thấp | Trung bình | Quick start |
| Layertools | 130-150MB | Trung bình | Trung bình | Trung bình | Tối ưu push |
| Custom JRE (jlink) | 80-100MB | Chậm | Cao | Cao | Size-critical |
| Distroless | 220MB | Nhanh | Thấp | Rất cao | Security-critical |
| jlink + Distroless | 90-110MB | Chậm | Cao | Rất cao | Production best |
| **jlink + UPX** | **60-80MB** | Rất chậm | Rất cao | Cao | Extreme optimization |

---

## 10. Dockerfile Variants

Trong folder này có các Dockerfile variants:

| File | Mô tả | Size | Use Case |
|------|-------|------|----------|
| `Dockerfile` | Standard production build | ~100MB | Default choice |
| `Dockerfile.distroless` | Maximum security | ~110MB | Security-critical |

---

## 11. Checklist Production

### ✅ Security

- [ ] Chạy với non-root user
- [ ] Sử dụng distroless hoặc minimal base
- [ ] Pin image version với SHA digest
- [ ] Update dependencies để patch CVEs
- [ ] Không include JDK trong runtime (chỉ JRE)

### ✅ Performance

- [ ] Set JVM container-aware flags
- [ ] Tính toán MaxRAMPercentage phù hợp
- [ ] Sử dụng G1GC cho container
- [ ] Enable CDS (Class Data Sharing) nếu applicable

### ✅ Size

- [ ] Multi-stage build
- [ ] Xóa test, docs, source files
- [ ] Sử dụng jlink nếu cần image nhỏ
- [ ] Sử dụng layertools để tối ưu push

### ✅ Observability

- [ ] Healthcheck endpoint
- [ ] Proper STOPSIGNAL (SIGTERM)
- [ ] OCI labels cho traceability
- [ ] Prometheus metrics (optional)

---

## 12. GraalVM Native Image

GraalVM cho phép compile Java thành native binary, startup trong ~50ms thay vì 5-10s.

### Dockerfile với GraalVM

```dockerfile
# Stage 1: Build với GraalVM
FROM ghcr.io/graalvm/native-image:22 AS builder

WORKDIR /app

# Copy source
COPY . .

# Build native image
RUN ./gradlew nativeCompile --no-daemon

# Stage 2: Minimal runtime
FROM gcr.io/distroless/base-debian12:nonroot

COPY --from=builder /app/build/native/nativeCompile/app /app

USER nonroot
EXPOSE 8080

# Native image không cần JVM flags
CMD ["/app"]
```

### So sánh Native vs JVM

| Metric | JVM | Native Image |
|--------|-----|--------------|
| Startup time | 5-10s | **~50ms** |
| Memory (idle) | 200-500MB | **50-100MB** |
| Image size | 100-200MB | **50-80MB** |
| Peak throughput | **Cao hơn** | Thấp hơn ~10% |
| Build time | 1-2 phút | **10-20 phút** |

### Khi nào dùng Native Image?

- ✅ Serverless/Lambda functions
- ✅ CLI tools
- ✅ Microservices với scale-to-zero
- ❌ Long-running services cần peak performance
- ❌ Applications dùng nhiều reflection

### Spring Boot 3 Native Support

```groovy
// build.gradle
plugins {
    id 'org.graalvm.buildtools.native' version '0.9.28'
}
```

```bash
./gradlew nativeCompile
```

---

## 13. Docker Compose cho Java

### Development Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder  # Stop at builder stage for dev
    ports:
      - "8080:8080"
      - "5005:5005"  # Debug port
    environment:
      - SPRING_PROFILES_ACTIVE=dev
      - JAVA_OPTS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
    volumes:
      - ./src:/app/src:cached
      - gradle-cache:/root/.gradle
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  gradle-cache:
  postgres-data:
```

### Production Override

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  app:
    build:
      target: runtime
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - JAVA_OPTS=-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
      replicas: 2
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 14. CI/CD cho Java

### GitHub Actions

```yaml
# .github/workflows/java-docker.yml
name: Java Docker Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: gradle

      - name: Run tests
        run: ./gradlew test

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
