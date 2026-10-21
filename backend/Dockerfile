# -----------------------------------------------------------------------------
# Stage 1: Build Application
# -----------------------------------------------------------------------------
FROM eclipse-temurin:17-jdk-jammy AS builder
WORKDIR /workspace

# Copy Maven wrapper and pom for layer caching
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw
RUN ./mvnw dependency:go-offline -B

# Copy source code and build runnable archive
COPY src/ src/
RUN ./mvnw clean package -DskipTests -B

# -----------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# -----------------------------------------------------------------------------
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

# Create unprivileged system user and group
RUN groupadd -r pastebin && useradd -r -g pastebin -d /app -s /sbin/nologin pastebin

# Copy executable jar from builder stage
COPY --from=builder /workspace/target/pastebin-backend-*.jar app.jar
RUN chown -R pastebin:pastebin /app

# Render sets PORT env var; fall back to 8080 for local Docker builds
ENV PORT=8080
EXPOSE ${PORT}

# Actuator moves to MANAGEMENT_PORT when it is set (8081 in compose) and otherwise
# shares the application port, which is what Render exposes. Probe that same port.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD sh -c 'wget --no-verbose --tries=1 --spider "http://localhost:${MANAGEMENT_PORT:-${PORT}}/actuator/health/liveness" || exit 1'

USER pastebin:pastebin

ENTRYPOINT ["sh", "-c", "java -Djava.security.egd=file:/dev/./urandom -XX:+UseContainerSupport -Dserver.port=${PORT} -jar app.jar"]
