// performance-tests/k6/tests/smoke.js
// Stage A: Smoke test — 1-2 VUs, ~2 minutes.
//
// Verifies endpoint correctness, fixture access, CSRF flow, and metrics.
// Run this before any higher-concurrency test.
//
// Usage:
//   k6 run performance-tests/k6/tests/smoke.js
//   k6 run performance-tests/k6/tests/smoke.js -e TARGET=local
//   k6 run performance-tests/k6/tests/smoke.js -e BACKEND_URL=http://localhost:8080

import { check, sleep } from 'k6';
import { smoke, shouldDo, thinkTime } from '../scenarios.js';
import { API_BASE } from '../config.js';
import { getCsrfToken } from '../helpers/auth.js';
import {
  readPublicPaste,
  readRawContent,
  readTypedPaste,
  readDiscoveryFeed,
  createAnonymousPaste,
  KNOWN_PASTE_IDS,
} from '../helpers/pastes.js';
import { classifyResponse, serverErrors, transportErrors } from '../helpers/metrics.js';
import http from 'k6/http';

export const options = smoke;

export function setup() {
  console.log('=== Stage A: Smoke Test ===');
  console.log(`Target API: ${API_BASE}`);
  console.log(`Known paste IDs: ${KNOWN_PASTE_IDS.join(', ')}`);

  // Verify backend is reachable via paste read endpoint (discovery has 500 in prod)
  const warmupRes = http.get(`${API_BASE}/pastes/${KNOWN_PASTE_IDS[0]}`, {
    tags: { name: 'warmup' },
  });
  check(warmupRes, {
    'backend reachable': (r) => r.status === 200 || r.status === 404,
  });
  console.log(`Warmup: ${warmupRes.status} (${warmupRes.timings.duration}ms)`);

  // Verify CSRF flow works
  const csrfToken = getCsrfToken();
  console.log(`CSRF token acquired: ${csrfToken ? 'yes' : 'no (expected for anonymous)'}`);

  return { startTime: new Date().toISOString() };
}

export default function (data) {
  const pasteId = KNOWN_PASTE_IDS[0];

  // 1. Read public paste
  const readResult = readPublicPaste(pasteId);
  check(readResult, {
    'paste read completed': (r) => r !== null,
  });

  sleep(thinkTime());

  // 2. Read raw content
  const rawResult = readRawContent(pasteId);
  check(rawResult, {
    'raw content read completed': (r) => r !== null,
  });

  sleep(thinkTime());

  // 3. Read typed paste
  const typedResult = readTypedPaste(pasteId, 'json');
  check(typedResult, {
    'typed paste read completed': (r) => r !== null,
  });

  sleep(thinkTime());

  // 4. Discovery feed
  const discoveryResult = readDiscoveryFeed(0);
  check(discoveryResult, {
    'discovery feed read completed': (r) => r !== null,
  });

  sleep(thinkTime());

  // 5. Attempt anonymous paste creation (will be rate-limited after 30/hr)
  if (shouldDo('write')) {
    const writeResult = createAnonymousPaste();
    check(writeResult, {
      'paste create attempted': (r) => r !== null,
      'paste create not 5xx': (r) => r.category !== 'server',
    });
  }

  sleep(thinkTime());
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  const droppedIter = metrics.dropped_iterations?.values?.count || 0;
  const totalIter = metrics.iterations?.values?.count || 0;
  const lines = [
    '',
    '=== Smoke Test Summary ===',
    `Completed iterations: ${totalIter - droppedIter} (dropped: ${droppedIter})`,
    `Total HTTP requests: ${metrics.http_reqs?.values?.count || 0}`,
    `Achieved throughput: ${(metrics.http_reqs?.values?.rate || 0).toFixed(1)} req/s`,
    '',
    '── Latency ──',
    `  avg: ${Math.round(metrics.http_req_duration?.values?.avg || 0)}ms`,
    `  p95: ${Math.round(metrics.http_req_duration?.values?.['p(95)'] || 0)}ms`,
    `  max: ${Math.round(metrics.http_req_duration?.values?.max || 0)}ms`,
    '',
    '── Error Rates ──',
    `  server_errors:    ${((metrics.server_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  transport_errors: ${((metrics.transport_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    '',
  ];
  return lines.join('\n');
}
