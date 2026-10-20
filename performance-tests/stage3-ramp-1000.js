// performance-tests/stage3-ramp-1000.js
// Stage 3: Scaled Load & Capacity Curve (Ramp to 1,000 Virtual Users)
//
// Evaluates server behavior under 50 to 1,000 concurrent Virtual Users.
// Workload: 95% Reads of seeded public pastes (to model real traffic without single-IP rate-limit exhaustion)
//           5% Writes (to measure write latency and rate limiting behavior)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, ABORT_THRESHOLDS, getCsrfHeaders } from './config.js';

const errorRate = new Rate('ramp_error_rate');
const requestDuration = new Trend('ramp_req_duration', true);
const readDuration = new Trend('ramp_read_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warmup at 50 VUs
    { duration: '45s', target: 200 },  // Step 1: 200 VUs
    { duration: '45s', target: 500 },  // Step 2: 500 VUs
    { duration: '60s', target: 1000 }, // Step 3: Peak 1,000 VUs
    { duration: '30s', target: 1000 }, // Hold peak
    { duration: '30s', target: 0 },    // Cooldown
  ],
  thresholds: {
    // Abort if p99 exceeds 5000ms
    'http_req_duration': [{ threshold: `p(99)<${ABORT_THRESHOLDS.p99_latency_abort_ms}`, abortOnFail: true }],
  },
};

// Seed pool of public pastes
export function setup() {
  const authHeaders = getCsrfHeaders();
  const pasteIds = [];

  for (let i = 0; i < 20; i++) {
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-ramp-seed-${i}`,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    if (res.status === 201) {
      pasteIds.push(JSON.parse(res.body).id);
    }
  }

  return { pasteIds };
}

export default function (data) {
  const isWrite = Math.random() < 0.05;

  if (isWrite) {
    const authHeaders = getCsrfHeaders();
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-1k-${__VU}-${Date.now()}`,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    requestDuration.add(Date.now() - start);

    // Note: status 201 or 429 (rate limited) are expected
    check(res, {
      'write handled (201 or 429)': (r) => r.status === 201 || r.status === 429,
    });
    errorRate.add(res.status >= 500);

  } else {
    // Read from pool
    const pool = data.pasteIds;
    const targetId = pool && pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : 'y3SqfGH2EZ';

    const start = Date.now();
    const res = http.get(`${API_BASE}/pastes/${targetId}`);
    const elapsed = Date.now() - start;
    requestDuration.add(elapsed);
    readDuration.add(elapsed);

    const ok = check(res, {
      'read status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  }

  sleep(Math.random() * 1.5 + 0.5);
}
