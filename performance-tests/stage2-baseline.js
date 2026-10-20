// performance-tests/stage2-baseline.js
// Stage 2: Measured Performance Baseline (10 & 50 Virtual Users)
//
// Establishes reproducible baseline latency, throughput, error rates, and
// resource profiles at steady-state 10 and 50 concurrent VUs.
// Workload: 80% Reads from populated pool of public pastes, 20% Writes

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, getCsrfHeaders } from './config.js';

const errorRate = new Rate('custom_error_rate');
const pasteCreateTrend = new Trend('create_latency', true);
const pasteReadTrend = new Trend('read_latency', true);

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 10 }, // 10 VUs baseline
    { duration: '15s', target: 50 },
    { duration: '45s', target: 50 }, // 50 VUs baseline
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'custom_error_rate': ['rate<0.01'],
  },
};

// Setup creates a shared cache of readable public paste IDs
export function setup() {
  const authHeaders = getCsrfHeaders();
  const pasteIds = [];

  for (let i = 0; i < 10; i++) {
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-seed-${i}`,
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
  const isWrite = Math.random() < 0.20;

  if (isWrite) {
    const authHeaders = getCsrfHeaders();
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-b-${__VU}-${Date.now()}`,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    pasteCreateTrend.add(Date.now() - start);

    const ok = check(res, {
      'write status is 201': (r) => r.status === 201,
    });
    errorRate.add(!ok);

  } else {
    // Read from seeded public pool
    const pool = data.pasteIds;
    const targetId = pool && pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : 'y3SqfGH2EZ';

    const start = Date.now();
    const res = http.get(`${API_BASE}/pastes/${targetId}`);
    pasteReadTrend.add(Date.now() - start);

    const ok = check(res, {
      'read status is 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  }

  sleep(Math.random() * 1.5 + 0.5);
}
