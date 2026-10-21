// Load test: 100-200 concurrent users against production backend
// Target: https://backend-umrd.onrender.com

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = 'https://backend-umrd.onrender.com';
const API_BASE = `${BASE_URL}/api/v1`;

const errorRate = new Rate('errors');
const readDuration = new Trend('read_duration', true);
const writeDuration = new Trend('write_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp to 100 VUs
    { duration: '1m', target: 100 },   // Hold at 100
    { duration: '30s', target: 200 },  // Ramp to 200 VUs
    { duration: '1m', target: 200 },   // Hold at 200
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'], // 95% < 2s, 99% < 5s
    'errors': ['rate<0.1'], // < 10% errors
  },
};

export default function () {
  const isWrite = Math.random() < 0.1; // 10% writes, 90% reads

  if (isWrite) {
    // Write: create a public paste
    const payload = JSON.stringify({
      title: `load-test-${__VU}-${Date.now()}`,
      content: '// Load test paste content\nconsole.log("test");',
      language: 'javascript',
      visibility: 'PUBLIC',
      expiration: 'NEVER',
    });

    const start = Date.now();
    const res = http.post(`${API_BASE}/pastes`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    writeDuration.add(Date.now() - start);

    check(res, {
      'write status 201 or 429': (r) => r.status === 201 || r.status === 429,
    });
    errorRate.add(res.status >= 500);
  } else {
    // Read: fetch a public paste (use a known paste ID or fallback)
    const pasteId = 'y3SqfGH2EZ'; // fallback paste ID
    const start = Date.now();
    const res = http.get(`${API_BASE}/pastes/${pasteId}`);
    readDuration.add(Date.now() - start);

    check(res, {
      'read status 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
    errorRate.add(res.status >= 500);
  }

  sleep(Math.random() * 2 + 1); // 1-3s think time
}
