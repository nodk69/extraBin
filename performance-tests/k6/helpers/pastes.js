// performance-tests/k6/helpers/pastes.js
// Reusable paste API operations for ExtraBin k6 tests.

import http from 'k6/http';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, TEST_PREFIX } from '../config.js';
import { getMutationHeaders } from './auth.js';
import { classifyResponse, recordLatency } from './metrics.js';

// ──────────────────────────────────────────────────────────────────────────────
// Public Paste Read
// ──────────────────────────────────────────────────────────────────────────────
export function readPublicPaste(pasteId) {
  const res = http.get(`${API_BASE}/pastes/${pasteId}`, {
    tags: { name: 'paste_read' },
  });

  recordLatency(res, 'paste_read');
  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Raw Content Read
// ──────────────────────────────────────────────────────────────────────────────
export function readRawContent(pasteId) {
  const res = http.get(`${API_BASE}/pastes/${pasteId}/raw`, {
    tags: { name: 'raw_content' },
  });

  recordLatency(res, 'raw_content');
  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Typed API Read
// ──────────────────────────────────────────────────────────────────────────────
export function readTypedPaste(pasteId, format = 'json') {
  const res = http.get(`${API_BASE}/pastes/${pasteId}.${format}`, {
    tags: { name: `typed_${format}` },
    headers: { 'Accept': `application/${format}` },
  });

  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Download
// ──────────────────────────────────────────────────────────────────────────────
export function downloadPaste(pasteId) {
  const res = http.get(`${API_BASE}/pastes/${pasteId}/download`, {
    tags: { name: 'download' },
  });

  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery Feed
// ──────────────────────────────────────────────────────────────────────────────
export function readDiscoveryFeed(page = 0) {
  const res = http.get(`${API_BASE}/discovery?page=${page}&size=20`, {
    tags: { name: 'discovery' },
  });

  recordLatency(res, 'discovery');
  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery Search
// ──────────────────────────────────────────────────────────────────────────────
export function searchDiscovery(query) {
  const res = http.get(`${API_BASE}/discovery?q=${encodeURIComponent(query)}&page=0&size=20`, {
    tags: { name: 'discovery_search' },
  });

  return classifyResponse(res, 'read');
}

// ──────────────────────────────────────────────────────────────────────────────
// Anonymous Paste Create (will be rate-limited)
// ──────────────────────────────────────────────────────────────────────────────
export function createAnonymousPaste() {
  const headers = getMutationHeaders();
  const payload = JSON.stringify({
    title: `${PASTE_TITLE}-${__VU}-${Date.now()}`,
    content: PASTE_CONTENT,
    language: 'javascript',
    visibility: 'PUBLIC',
    expiration: 'NEVER',
  });

  const res = http.post(`${API_BASE}/pastes`, payload, {
    headers,
    tags: { name: 'paste_create' },
  });

  recordLatency(res, 'paste_write');
  const result = classifyResponse(res, 'write');

  if (result.success && res.status === 201) {
    try {
      const body = JSON.parse(res.body);
      result.pasteId = body.publicId || body.id;
    } catch (e) {
      // ignore parse errors
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Vote (Anonymous)
// ──────────────────────────────────────────────────────────────────────────────
export function voteOnPaste(pasteId, direction = 'UP') {
  const headers = getMutationHeaders();
  const payload = JSON.stringify({ direction });

  const res = http.post(`${API_BASE}/pastes/${pasteId}/vote`, payload, {
    headers,
    tags: { name: 'vote' },
  });

  return classifyResponse(res, 'write');
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixture: Known Public Paste IDs
// ──────────────────────────────────────────────────────────────────────────────
// Verified existing public pastes in the target database.
// Reads against these IDs should return 200, not 404.
// If a paste is deleted, replace its ID with a new verified one.
export const KNOWN_PASTE_IDS = [
  'R7l0vHk6HT',  // k6-loadtest-fixture (created 2026-10-21, PUBLIC, 10 lines)
];

export function getRandomPasteId() {
  return KNOWN_PASTE_IDS[Math.floor(Math.random() * KNOWN_PASTE_IDS.length)];
}
