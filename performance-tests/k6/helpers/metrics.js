// performance-tests/k6/helpers/metrics.js
// Custom k6 metrics and error classification for ExtraBin load tests.

import { Counter, Rate, Trend } from 'k6/metrics';

// ──────────────────────────────────────────────────────────────────────────────
// Custom Counters
// ──────────────────────────────────────────────────────────────────────────────
export const readRequests = new Counter('read_requests');
export const writeRequests = new Counter('write_requests');
export const readSuccesses = new Counter('read_successes');
export const writeSuccesses = new Counter('write_successes');

// ──────────────────────────────────────────────────────────────────────────────
// Custom Rates (error classification)
// ──────────────────────────────────────────────────────────────────────────────
export const transportErrors = new Rate('transport_errors');
export const timeoutErrors = new Rate('timeout_errors');
export const serverErrors = new Rate('server_errors');
export const authErrors = new Rate('auth_errors');
export const validationErrors = new Rate('validation_errors');
export const rateLimitHits = new Rate('rate_limit_hits');

// ──────────────────────────────────────────────────────────────────────────────
// Custom Trends (per-endpoint latency)
// ──────────────────────────────────────────────────────────────────────────────
export const pasteReadLatency = new Trend('paste_read_latency', true);
export const pasteWriteLatency = new Trend('paste_write_latency', true);
export const discoveryLatency = new Trend('discovery_latency', true);
export const rawContentLatency = new Trend('raw_content_latency', true);

// ──────────────────────────────────────────────────────────────────────────────
// Error Classification
// ──────────────────────────────────────────────────────────────────────────────
export function classifyResponse(res, type = 'read') {
  const isRead = type === 'read';

  if (isRead) {
    readRequests.add(1);
  } else {
    writeRequests.add(1);
  }

  // Transport-level failure (DNS, TCP, TLS)
  if (res.error_code > 0) {
    if (res.error_code === 1050 || res.error_code === 1060) {
      timeoutErrors.add(1);
      transportErrors.add(0);
    } else {
      transportErrors.add(1);
      timeoutErrors.add(0);
    }
    serverErrors.add(0);
    authErrors.add(0);
    rateLimitHits.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(0);
    } else {
      writeSuccesses.add(0);
    }
    return { success: false, category: 'transport' };
  }

  // No transport error — clear the transport-level Rates
  timeoutErrors.add(0);
  transportErrors.add(0);

  // Server errors
  if (res.status >= 500) {
    serverErrors.add(1);
    transportErrors.add(0);
    authErrors.add(0);
    rateLimitHits.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(0);
    } else {
      writeSuccesses.add(0);
    }
    return { success: false, category: 'server' };
  }

  // Auth errors
  if (res.status === 401 || res.status === 403) {
    authErrors.add(1);
    serverErrors.add(0);
    transportErrors.add(0);
    rateLimitHits.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(0);
    } else {
      writeSuccesses.add(0);
    }
    return { success: false, category: 'auth' };
  }

  // Rate limiting
  if (res.status === 429) {
    rateLimitHits.add(1);
    serverErrors.add(0);
    transportErrors.add(0);
    authErrors.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(1);
    } else {
      writeSuccesses.add(0);
    }
    return { success: true, category: 'rate_limited', expected: true };
  }

  // Validation errors
  if (res.status === 400 || res.status === 409 || res.status === 422) {
    validationErrors.add(1);
    serverErrors.add(0);
    transportErrors.add(0);
    authErrors.add(0);
    rateLimitHits.add(0);
    if (isRead) {
      readSuccesses.add(0);
    } else {
      writeSuccesses.add(0);
    }
    return { success: false, category: 'validation' };
  }

  // Expected 404 (paste not found, expired, etc.)
  if (res.status === 404) {
    serverErrors.add(0);
    transportErrors.add(0);
    authErrors.add(0);
    rateLimitHits.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(1);
    } else {
      writeSuccesses.add(0);
    }
    return { success: true, category: 'not_found', expected: true };
  }

  // Success
  if (res.status >= 200 && res.status < 300) {
    serverErrors.add(0);
    transportErrors.add(0);
    authErrors.add(0);
    rateLimitHits.add(0);
    validationErrors.add(0);
    if (isRead) {
      readSuccesses.add(1);
    } else {
      writeSuccesses.add(1);
    }
    return { success: true, category: 'ok' };
  }

  serverErrors.add(0);
  transportErrors.add(0);
  authErrors.add(0);
  rateLimitHits.add(0);
  validationErrors.add(0);
  if (isRead) {
    readSuccesses.add(0);
  } else {
    writeSuccesses.add(0);
  }
  return { success: false, category: 'unknown' };
}

// ──────────────────────────────────────────────────────────────────────────────
// Latency Recording
// ──────────────────────────────────────────────────────────────────────────────
export function recordLatency(res, endpoint) {
  const duration = res.timings.duration;

  switch (endpoint) {
    case 'paste_read':
      pasteReadLatency.add(duration);
      break;
    case 'paste_write':
      pasteWriteLatency.add(duration);
      break;
    case 'discovery':
      discoveryLatency.add(duration);
      break;
    case 'raw_content':
      rawContentLatency.add(duration);
      break;
  }
}
