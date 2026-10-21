// performance-tests/k6/scenarios.js
// Workload and execution profiles for ExtraBin k6 tests.
//
// Each stage is independently runnable. Stages must be executed sequentially —
// never launch multiple stages simultaneously.

import { THINK_TIME, WORKLOAD_MIX, SAFETY } from './config.js';

// ──────────────────────────────────────────────────────────────────────────────
// Stage A: Smoke Test
// ──────────────────────────────────────────────────────────────────────────────
// 1-2 VUs, ~2 minutes. Verify endpoint correctness, fixtures, auth, metrics.
export const smoke = {
  setupTimeout: '2m',
  stages: [
    { duration: '30s', target: 1 },
    { duration: '1m', target: 2 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000'],
    'server_errors': ['rate<0.05'],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage B: Baseline
// ──────────────────────────────────────────────────────────────────────────────
// 1, 5, 10 VUs. ~2 min each. Cold-start vs steady-state.
export const baseline = {
  setupTimeout: '2m',
  stages: [
    { duration: '30s', target: 1 },
    { duration: '1m30s', target: 1 },
    { duration: '30s', target: 5 },
    { duration: '1m30s', target: 5 },
    { duration: '30s', target: 10 },
    { duration: '1m30s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000', 'p(99)<15000'],
    'server_errors': ['rate<0.02'],
    'transport_errors': ['rate<0.01'],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage C: Load Test
// ──────────────────────────────────────────────────────────────────────────────
// Ramp through 25, 50, 100, 200 VUs. Gradual ramp-up, steady-state, ramp-down.
export const load = {
  setupTimeout: '2m',
  stages: [
    { duration: '30s', target: 25 },
    { duration: '1m30s', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '1m30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m30s', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '1m30s', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': [`p(95)<${SAFETY.abortP99LatencyMs}`],
    'server_errors': [`rate<${SAFETY.abort5xxRate}`],
    'transport_errors': ['rate<0.02'],
    'read_requests': ['count>0'],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage D: Capacity Exploration (requires explicit approval)
// ──────────────────────────────────────────────────────────────────────────────
// Only run after Stage C passes all health gates.
export const capacity = {
  stages: [
    { duration: '30s', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '30s', target: 300 },
    { duration: '2m', target: 300 },
    { duration: '30s', target: 400 },
    { duration: '2m', target: 400 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'http_req_duration': [`p(95)<${SAFETY.abortP99LatencyMs}`],
    'server_errors': [`rate<${SAFETY.abort5xxRate}`],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage E: Spike Test (requires explicit approval)
// ──────────────────────────────────────────────────────────────────────────────
// Sudden traffic increase from stable baseline.
export const spike = {
  executor: 'ramping-arrival-rate',
  startRate: 10,
  timeUnit: '1s',
  preAllocatedVUs: 300,
  maxVUs: 500,
  stages: [
    { duration: '1m', target: 10 },   // Baseline
    { duration: '10s', target: 100 },  // Spike up
    { duration: '1m', target: 100 },   // Hold spike
    { duration: '10s', target: 10 },   // Spike down
    { duration: '1m', target: 10 },    // Recovery
  ],
  thresholds: {
    'http_req_duration': [`p(95)<${SAFETY.abortP99LatencyMs}`],
    'server_errors': [`rate<${SAFETY.abort5xxRate}`],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Stage F: Soak Test (requires explicit approval)
// ──────────────────────────────────────────────────────────────────────────────
// Sustained representative workload for 30-60 minutes.
export const soak = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '29m', target: 50 },  // 30 min total
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000'],
    'server_errors': ['rate<0.01'],
    'transport_errors': ['rate<0.005'],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Workload Mix Helper
// ──────────────────────────────────────────────────────────────────────────────
export function shouldDo(action) {
  return Math.random() < WORKLOAD_MIX[action];
}

export function thinkTime() {
  return Math.random() * (THINK_TIME.max - THINK_TIME.min) + THINK_TIME.min;
}
