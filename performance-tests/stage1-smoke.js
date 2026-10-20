// performance-tests/stage1-smoke.js
// Stage 1: Smoke Test (1-5 Virtual Users)
//
// Establishes a minimal multi-user baseline under light load (1-5 VUs) for 60s.
// Verifies response times, error rates, and system stability under minimal concurrency.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, PROPOSED_THRESHOLDS, getCsrfHeaders } from './config.js';

// Custom metrics
const errorRate = new Rate('custom_error_rate');
const pasteCreateDuration = new Trend('paste_create_duration', true);
const pasteReadDuration = new Trend('paste_read_duration', true);
const voteDuration = new Trend('vote_duration', true);

export const options = {
  stages: [
    { duration: '15s', target: 2 }, // Warm up to 2 VUs
    { duration: '30s', target: 5 }, // Hold at 5 VUs
    { duration: '15s', target: 0 }, // Ramp down
  ],
  thresholds: {
    // Proposed targets — verify with baseline
    'http_req_duration': [`p(95)<${PROPOSED_THRESHOLDS.p95_latency_ms}`, `p(99)<${PROPOSED_THRESHOLDS.p99_latency_ms}`],
    'custom_error_rate': [`rate<${PROPOSED_THRESHOLDS.max_error_rate}`],
  },
};

export default function () {
  const authHeaders = getCsrfHeaders();
  let pasteId = null;

  group('Create Paste', function () {
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-vu${__VU}-iter${__ITER}`,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    pasteCreateDuration.add(Date.now() - start);

    const ok = check(res, {
      'create status is 201': (r) => r.status === 201,
      'has paste id': (r) => {
        try {
          return !!JSON.parse(r.body).id;
        } catch (_) {
          return false;
        }
      },
    });

    errorRate.add(!ok);

    if (ok) {
      pasteId = JSON.parse(res.body).id;
    }
  });

  if (!pasteId) {
    sleep(1);
    return;
  }

  group('Read Paste', function () {
    const start = Date.now();
    const res = http.get(`${API_BASE}/pastes/${pasteId}`);
    pasteReadDuration.add(Date.now() - start);

    const ok = check(res, {
      'read status is 200': (r) => r.status === 200,
    });

    errorRate.add(!ok);
  });

  group('Vote Paste', function () {
    const start = Date.now();
    const payload = JSON.stringify({ voteType: 'UP' });
    const res = http.post(`${API_BASE}/pastes/${pasteId}/vote`, payload, { headers: authHeaders });
    voteDuration.add(Date.now() - start);

    const ok = check(res, {
      'vote status is 200': (r) => r.status === 200,
    });

    errorRate.add(!ok);
  });

  // Pacing
  sleep(Math.random() * 1.5 + 0.5);
}
