// performance-tests/stage4-spike.js
// Stage 4: Spike Test (Sudden Surge from Baseline to Peak)
//
// Simulates a viral event or sudden traffic spike:
// Baseline (10 VUs) -> Instant jump to 500 VUs in 10s -> Hold 60s -> Drop back to 10 VUs
//
// Evaluates:
// 1. Connection pool buffer shock handling
// 2. Recovery time (does latency normalize immediately when load subsides?)
// 3. Error rate during sudden transition

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, getCsrfHeaders } from './config.js';

const errorRate = new Rate('spike_error_rate');
const latencyTrend = new Trend('spike_req_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Normal baseline: 10 VUs
    { duration: '10s', target: 500 },  // Instant spike to 500 VUs!
    { duration: '1m', target: 500 },   // Hold the spike
    { duration: '10s', target: 10 },   // Rapid drop back to 10 VUs
    { duration: '1m', target: 10 },    // Monitor recovery
    { duration: '10s', target: 0 },    // Cooldown
  ],
  thresholds: {
    // Proposed targets
    'spike_error_rate': ['rate<0.05'], // Max 5% errors during severe spike
    'http_req_duration': ['p(95)<1500'],
  },
};

// Seed pool of public pastes for reads
export function setup() {
  const authHeaders = getCsrfHeaders();
  const pasteIds = [];

  for (let i = 0; i < 15; i++) {
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-spike-seed-${i}`,
      content: PASTE_CONTENT,
      language: 'text',
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
  const isWrite = Math.random() < 0.10; // 10% writes

  if (isWrite) {
    const authHeaders = getCsrfHeaders();
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-spike-${__VU}-${Date.now()}`,
      content: PASTE_CONTENT,
      language: 'text',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    latencyTrend.add(Date.now() - start);

    // 201 = created, 429 = rate-limited (expected under spike)
    check(res, {
      'write handled (201 or 429)': (r) => r.status === 201 || r.status === 429,
    });
    errorRate.add(res.status >= 500);
  } else {
    // Read from seeded pool
    const pool = data.pasteIds;
    const targetId = pool && pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : 'fallback';

    const start = Date.now();
    const res = http.get(`${API_BASE}/pastes/${targetId}`);
    latencyTrend.add(Date.now() - start);

    const ok = check(res, {
      'read status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  }

  sleep(Math.random() * 0.8 + 0.2);
}
