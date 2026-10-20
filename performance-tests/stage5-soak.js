// performance-tests/stage5-soak.js
// Stage 5: Soak / Endurance Test (Sustained Concurrency over Time)
//
// Runs a steady load of 50 VUs over an extended period to detect:
// 1. Memory leaks (steady-state heap creep via Prometheus jvm_memory_used_bytes)
// 2. Database connection leaks (HikariCP active connections never returned)
// 3. Redis connection or file descriptor creep
// 4. Degradation over prolonged load

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API_BASE, PASTE_CONTENT, PASTE_TITLE, getCsrfHeaders } from './config.js';

const errorRate = new Rate('soak_error_rate');
const soakDuration = new Trend('soak_req_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm up
    { duration: '4m', target: 50 },    // Sustained soak at 50 VUs
    { duration: '30s', target: 0 },    // Wind down
  ],
  thresholds: {
    // Latency must remain stable across the entire window without creeping
    'http_req_duration': ['p(95)<600', 'p(99)<1200'],
    'soak_error_rate': ['rate<0.005'], // < 0.5% errors
  },
};

// Seed pool of public pastes for read workload
export function setup() {
  const authHeaders = getCsrfHeaders();
  const pasteIds = [];

  for (let i = 0; i < 20; i++) {
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-soak-seed-${i}`,
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
  const isWrite = Math.random() < 0.10; // 10% writes

  if (isWrite) {
    const authHeaders = getCsrfHeaders();
    const payload = JSON.stringify({
      title: `${PASTE_TITLE}-soak-${__VU}-${Date.now()}`,
      content: PASTE_CONTENT,
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
    soakDuration.add(Date.now() - start);

    // 201 or 429 are both acceptable under sustained load
    check(res, {
      'soak write handled (201 or 429)': (r) => r.status === 201 || r.status === 429,
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
    soakDuration.add(Date.now() - start);

    const ok = check(res, {
      'soak read 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  }

  sleep(Math.random() * 1.5 + 0.5);
}
