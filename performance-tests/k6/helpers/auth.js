// performance-tests/k6/helpers/auth.js
// Authentication and CSRF handling for ExtraBin k6 tests.
//
// ExtraBin uses session-based auth with CookieCsrfTokenRepository.
// Without dedicated test credentials, authenticated scenarios are blocked.
// This helper provides CSRF token acquisition for anonymous write attempts.

import http from 'k6/http';
import { API_BASE } from '../config.js';

// ──────────────────────────────────────────────────────────────────────────────
// CSRF Token Acquisition
// ──────────────────────────────────────────────────────────────────────────────
// ExtraBin's CsrfCookieFilter sets XSRF-TOKEN cookie on every request.
// For mutations (POST/PUT/DELETE), the SPA reads the cookie and sends it
// as X-XSRF-TOKEN header.

export function getCsrfToken() {
  const res = http.get(`${API_BASE}/auth/me`, {
    tags: { name: 'csrf_bootstrap' },
  });

  let token = '';

  if (res.cookies && res.cookies['XSRF-TOKEN'] && res.cookies['XSRF-TOKEN'].length > 0) {
    token = res.cookies['XSRF-TOKEN'][0].value;
  }

  if (!token) {
    const jar = http.cookieJar();
    const cookies = jar.cookiesForURL(API_BASE);
    if (cookies && cookies['XSRF-TOKEN'] && cookies['XSRF-TOKEN'].length > 0) {
      token = cookies['XSRF-TOKEN'][0];
    }
  }

  return token;
}

export function getMutationHeaders() {
  const token = getCsrfToken();
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-XSRF-TOKEN': token,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth Status Check
// ──────────────────────────────────────────────────────────────────────────────
export function checkAuthStatus() {
  const res = http.get(`${API_BASE}/auth/me`, {
    tags: { name: 'auth_check' },
  });

  return {
    authenticated: res.status === 200,
    status: res.status,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Blocked Scenarios (no test credentials)
// ──────────────────────────────────────────────────────────────────────────────
export const BLOCKED_SCENARIOS = [
  'Authenticated paste creation',
  'Private paste access',
  'Paste editing/deletion',
  'Star/folder operations',
  'Comment/reply workflows',
  'Account library operations',
];
