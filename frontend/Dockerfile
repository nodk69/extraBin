# -----------------------------------------------------------------------------
# Stage 1: Build Application
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and produce static bundle
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Serve with Nginx
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Remove default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy nginx config template (will be processed at runtime)
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy build artifacts from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# The nginx:alpine image runs the master process as root (required to bind port 80)
# and worker processes as the unprivileged `nginx` user — this is the standard secure
# nginx container pattern. We harden file ownership for defense-in-depth.
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider -q http://localhost:80/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
