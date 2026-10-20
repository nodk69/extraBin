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

# Expose standard service port
EXPOSE 8080

# Health check using Actuator probe (management port 8081)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8081/actuator/health/liveness || exit 1

USER pastebin:pastebin

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-XX:+UseContainerSupport", "-jar", "app.jar"]
