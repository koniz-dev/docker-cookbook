# syntax=docker/dockerfile:1.7

# =============================================================================
# JAVA/SPRING BOOT PRODUCTION DOCKERFILE
# Combines best practices: jlink + layertools + security + JVM tuning
# =============================================================================

# -----------------------------------------------------------------------------
# Build Arguments
# -----------------------------------------------------------------------------
ARG JDK_VERSION=21
ARG BUILD_IMAGE=eclipse-temurin:${JDK_VERSION}-jdk-alpine
ARG RUNTIME_IMAGE=alpine:3.21

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

# -----------------------------------------------------------------------------
# Stage 1: Builder - Build JAR and create Custom JRE
# -----------------------------------------------------------------------------
FROM ${BUILD_IMAGE} AS builder

ENV GRADLE_USER_HOME=/cache/.gradle

WORKDIR /build

# Copy Gradle wrapper and config files (for layer caching)
COPY gradlew ./
COPY gradle/ gradle/
COPY build.gradle settings.gradle* ./

RUN chmod +x gradlew

# Cache dependencies
RUN --mount=type=cache,target=/cache/.gradle \
    ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src/ src/

# Build JAR
RUN --mount=type=cache,target=/cache/.gradle \
    ./gradlew bootJar --no-daemon -x test

# Move JAR to known location
RUN mkdir -p /app && \
    mv build/libs/*.jar /app/app.jar

# -----------------------------------------------------------------------------
# Stage 2: JRE Builder - Create minimal JRE with jlink
# -----------------------------------------------------------------------------
FROM ${BUILD_IMAGE} AS jre-builder

WORKDIR /app

# Copy JAR from builder
COPY --from=builder /app/app.jar ./

# Extract JAR to analyze dependencies
RUN jar xf app.jar

# Analyze required modules
RUN jdeps --ignore-missing-deps -q \
    --recursive \
    --multi-release 21 \
    --print-module-deps \
    --class-path 'BOOT-INF/lib/*' \
    app.jar > deps.info

# Create custom JRE with jlink
RUN jlink \
    --add-modules $(cat deps.info) \
    --strip-debug \
    --no-man-pages \
    --no-header-files \
    --compress=zip-9 \
    --output /custom-jre

# -----------------------------------------------------------------------------
# Stage 3: Layer Extractor - Separate Spring Boot layers
# -----------------------------------------------------------------------------
FROM ${BUILD_IMAGE} AS layer-extractor

WORKDIR /app
COPY --from=builder /app/app.jar ./

RUN java -Djarmode=layertools -jar app.jar extract --destination /extracted

# -----------------------------------------------------------------------------
# Stage 4: Runtime - Minimal production image
# -----------------------------------------------------------------------------
FROM ${RUNTIME_IMAGE} AS runtime

# Re-declare ARGs for this stage
ARG VERSION
ARG BUILD_DATE
ARG VCS_REF

# OCI Labels
LABEL org.opencontainers.image.title="Spring Boot Application" \
      org.opencontainers.image.description="Production-ready Spring Boot with custom JRE" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.base.name="alpine:3.21"

# Install minimal runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    tini \
    curl && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 -S appgroup && \
    adduser -u 1000 -S appuser -G appgroup

# Copy custom JRE
ENV JAVA_HOME=/opt/java
ENV PATH="$JAVA_HOME/bin:$PATH"
COPY --from=jre-builder /custom-jre $JAVA_HOME

# Set up application directory
WORKDIR /app

# Copy Spring Boot layers (in optimal caching order)
COPY --from=layer-extractor --chown=appuser:appgroup /extracted/dependencies/ ./
COPY --from=layer-extractor --chown=appuser:appgroup /extracted/spring-boot-loader/ ./
COPY --from=layer-extractor --chown=appuser:appgroup /extracted/snapshot-dependencies/ ./
COPY --from=layer-extractor --chown=appuser:appgroup /extracted/application/ ./

# JVM Configuration for Container
ENV JAVA_OPTS="\
    -XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -XX:+UseG1GC \
    -XX:MaxGCPauseMillis=100 \
    -XX:+UseStringDeduplication \
    -XX:+ParallelRefProcEnabled \
    -XX:+DisableExplicitGC \
    -XX:+ExitOnOutOfMemoryError \
    -Djava.security.egd=file:/dev/./urandom \
    -Djava.awt.headless=true \
    -Dfile.encoding=UTF-8"

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8080/actuator/health || exit 1

# Graceful shutdown
STOPSIGNAL SIGTERM

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Run Spring Boot with JarLauncher (optimized for layered JAR)
CMD ["sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher"]
