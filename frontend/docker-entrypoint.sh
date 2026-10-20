#!/bin/sh
# Startup script for nginx with environment variable substitution

# Set default backend URL if not provided
BACKEND_URL=${BACKEND_URL:-http://backend:8080}

# Substitute environment variables in nginx config
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
