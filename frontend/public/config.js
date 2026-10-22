// Runtime configuration placeholder for local development.
//
// In container deployments nginx writes this file at startup from the
// VITE_SUPABASE_* / VITE_API_BASE_URL environment variables (see
// frontend/docker-entrypoint.sh). Vite's dev server has no nginx, so without
// this file index.html's <script src="/config.js"> would 404 and the app would
// have to rely on the undefined window.__CONFIG__.
//
// The object is intentionally empty: every lookup in src/lib/supabase/client.ts
// and src/lib/api-client/client.ts falls back to import.meta.env (loaded from
// .env) when the key is absent.
window.__CONFIG__ = {};
