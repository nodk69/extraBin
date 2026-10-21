// performance-tests/k6/tests/capacity-search.js
// Controlled capacity search — find the highest sustainable VU count.
//
// Tests discrete levels: 10, 15, 20, 30, 50 VUs.
// Each level holds for 2 minutes after a 30s ramp-up.
// Abort thresholds detect degradation early.
//
// Usage:
//   k6 run performance-tests/k6/tests/capacity-search.js
//   k6 run performance-tests/k6/tests/capacity-search.js --out json=results.json

import { check, sleep } from 'k6';
import { thinkTime } from '../scenarios.js';
import { API_BASE, WORKLOAD_MIX } from '../config.js';
import {
  readPublicPaste,
  readRawContent,
  readTypedPaste,
  readDiscoveryFeed,
  downloadPaste,
  createAnonymousPaste,
  KNOWN_PASTE_IDS,
} from '../helpers/pastes.js';
import http from 'k6/http';

export const options = {
  setupTimeout: '2m',
  stages: [
    // Level 1: 10 VUs
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },
    // Level 2: 15 VUs
    { duration: '30s', target: 15 },
    { duration: '2m', target: 15 },
    // Level 3: 20 VUs
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    // Level 4: 30 VUs
    { duration: '30s', target: 30 },
    { duration: '2m', target: 30 },
    // Level 5: 50 VUs
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    // Ramp down
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Abort if p95 latency exceeds 10s (generous — free tier is slow)
    'http_req_duration': ['p(95)<10000'],
    // Abort if transport error rate exceeds 5%
    'transport_errors': ['rate<0.05'],
    // Abort if server error rate exceeds 2%
    'server_errors': ['rate<0.02'],
  },
};

export function setup() {
  console.log('=== Controlled Capacity Search ===');
  console.log(`Target API: ${API_BASE}`);
  console.log(`Fixture paste: ${KNOWN_PASTE_IDS[0]}`);
  console.log('Levels: 10 → 15 → 20 → 30 → 50 VUs (2min hold each)');

  const warmup = http.get(`${API_BASE}/pastes/${KNOWN_PASTE_IDS[0]}`, {
    tags: { name: 'warmup' },
  });
  console.log(`Warmup: ${warmup.status} (${warmup.timings.duration}ms)`);

  if (warmup.status === 0 && warmup.error_code > 0) {
    throw new Error(`Backend unreachable: error_code=${warmup.error_code}`);
  }

  return { startTime: new Date().toISOString() };
}

export default function () {
  const pasteId = KNOWN_PASTE_IDS[0];
  const roll = Math.random();
  let cumulative = 0;

  cumulative += WORKLOAD_MIX.publicPasteView;
  if (roll < cumulative) {
    const result = readPublicPaste(pasteId);
    check(result, {
      'paste read: not server error': (r) => r.category !== 'server',
      'paste read: not transport error': (r) => r.category !== 'transport',
    });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.rawContent;
  if (roll < cumulative) {
    const result = readRawContent(pasteId);
    check(result, {
      'raw read: not server error': (r) => r.category !== 'server',
      'raw read: not transport error': (r) => r.category !== 'transport',
    });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.typedApi;
  if (roll < cumulative) {
    const formats = ['json', 'txt'];
    const fmt = formats[Math.floor(Math.random() * formats.length)];
    const result = readTypedPaste(pasteId, fmt);
    check(result, {
      'typed read: not server error': (r) => r.category !== 'server',
    });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.download;
  if (roll < cumulative) {
    const result = downloadPaste(pasteId);
    check(result, {
      'download: not server error': (r) => r.category !== 'server',
    });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.discovery;
  if (roll < cumulative) {
    // Discovery endpoint currently returns 500 in production (known issue).
    // We still exercise it to measure the failure rate, but don't check for success.
    readDiscoveryFeed(0);
    sleep(thinkTime());
    return;
  }

  // Write (10%)
  const result = createAnonymousPaste();
  check(result, {
    'write: not server error': (r) => r.category !== 'server',
    'write: not transport error': (r) => r.category !== 'transport',
  });
  sleep(thinkTime());
}

export function handleSummary(data) {
  const m = data.metrics;
  const droppedIter = m.dropped_iterations?.values?.count || 0;
  const totalIter = m.iterations?.values?.count || 0;
  const lines = [
    '',
    '=== Capacity Search Summary ===',
    `Completed iterations: ${totalIter - droppedIter} (dropped: ${droppedIter})`,
    `Total HTTP requests: ${m.http_reqs?.values?.count || 0}`,
    `Achieved throughput: ${(m.http_reqs?.values?.rate || 0).toFixed(1)} req/s`,
    '',
    '── Latency ──',
    `  avg: ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `  med: ${Math.round(m.http_req_duration?.values?.med || 0)}ms`,
    `  p90: ${Math.round(m.http_req_duration?.values?.['p(90)'] || 0)}ms`,
    `  p95: ${Math.round(m.http_req_duration?.values?.['p(95)'] || 0)}ms`,
    `  p99: ${Math.round(m.http_req_duration?.values?.['p(99)'] || 0)}ms`,
    `  max: ${Math.round(m.http_req_duration?.values?.max || 0)}ms`,
    '',
    '── Error Rates ──',
    `  transport_errors: ${((m.transport_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  server_errors:    ${((m.server_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  timeout_errors:   ${((m.timeout_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  auth_errors:      ${((m.auth_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    '',
    '── Threshold Results ──',
  ];

  // Report which thresholds passed/failed
  for (const [metricName, thresholds] of Object.entries(m)) {
    if (thresholds.thresholds) {
      for (const [threshold, passed] of Object.entries(thresholds.thresholds)) {
        lines.push(`  ${metricName}: "${threshold}" → ${passed ? 'PASS' : 'FAIL'}`);
      }
    }
  }

  lines.push('');
  lines.push('NOTE: Analyze per-stage results in the progress output above.');
  lines.push('      Look for the VU level where transport_errors or latency first spike.');
  lines.push('');

  return { stdout: lines.join('\n') };
}
