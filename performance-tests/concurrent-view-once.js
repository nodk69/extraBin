// performance-tests/concurrent-view-once.js
// Specialized k6 test: Atomic View-Once Consumption Under High Concurrency
//
// Protocol requirement: Verify that when N virtual users concurrently attempt to
// read the exact same view-once paste, EXACTLY ONE gets 200 OK and all others (N-1)
// receive 404 (indistinguishable security failure).
//
// Invariants:
// - zero duplicate reads
// - zero race-condition window leaks
// - atomic DB status transition

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API_BASE, getCsrfHeaders } from './config.js';

const successfulReads = new Counter('view_once_success_count');
const notFoundReads = new Counter('view_once_404_count');
const otherStatusCount = new Counter('view_once_unexpected_status_count');

export const options = {
  scenarios: {
    concurrent_burn: {
      executor: 'per-vu-iterations',
      vus: 20,           // 20 concurrent readers race to read the same paste
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // Exact invariant: exactly 1 success across all 20 concurrent requests
    'view_once_success_count': ['count==1'],
    // All 19 remaining requests must get 404
    'view_once_404_count': ['count==19'],
    // Zero unexpected status codes (no 500s, no unhandled exceptions)
    'view_once_unexpected_status_count': ['count==0'],
  },
};

// Setup runs once before VUs start: Create a single view-once paste
export function setup() {
  const authHeaders = getCsrfHeaders();
  const payload = JSON.stringify({
    title: 'k6-concurrent-view-once-target',
    content: 'TOP_SECRET_ATOMIC_PAYLOAD_12345',
    language: 'text',
    visibility: 'PUBLIC',
    expiration: 'VIEW_ONCE',
  });

  const res = http.post(`${API_BASE}/pastes`, payload, { headers: authHeaders });
  if (res.status !== 201) {
    throw new Error(`Setup failed to create view-once paste: ${res.status} ${res.body}`);
  }

  const data = JSON.parse(res.body);
  return { pasteId: data.id };
}

export default function (data) {
  const pasteId = data.pasteId;
  const res = http.get(`${API_BASE}/pastes/${pasteId}`);

  if (res.status === 200) {
    successfulReads.add(1);
    check(res, {
      'content matches secret': (r) => {
        try {
          return JSON.parse(r.body).content === 'TOP_SECRET_ATOMIC_PAYLOAD_12345';
        } catch (_) {
          return false;
        }
      },
    });
  } else if (res.status === 404) {
    notFoundReads.add(1);
  } else {
    otherStatusCount.add(1);
  }
}
