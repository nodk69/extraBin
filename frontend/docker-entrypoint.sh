#!/bin/sh
# Startup script for nginx with environment variable substitution

# Set default backend URL if not provided
BACKEND_URL=${BACKEND_URL:-http://backend:8080}

# Substitute environment variables in nginx config
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Generate runtime config for frontend (Vite env vars injected at runtime, not build time)
cat > /usr/share/nginx/html/config.js <<EOF
window.__CONFIG__ = {
  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL}",
  VITE_SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY}",
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-${BACKEND_URL}/api/v1}"
};
EOF

# Start nginx
exec nginx -g 'daemon off;'
