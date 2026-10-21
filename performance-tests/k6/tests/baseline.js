// performance-tests/k6/tests/baseline.js
// Stage B: Baseline — 1, 5, 10 VUs, ~2 min each.
//
// Establishes cold-start and steady-state behavior at low concurrency.
// Run after smoke test passes.
//
// Usage:
//   k6 run performance-tests/k6/tests/baseline.js
//   k6 run performance-tests/k6/tests/baseline.js -e TARGET=production

import { check, sleep } from 'k6';
import { baseline, thinkTime } from '../scenarios.js';
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
import { classifyResponse } from '../helpers/metrics.js';
import http from 'k6/http';

export const options = baseline;

export function setup() {
  console.log('=== Stage B: Baseline Test ===');
  console.log(`Target API: ${API_BASE}`);
  console.log('Phases: 1 VU → 5 VU → 10 VU');

  // Warm up: hit the backend once to trigger cold start (discovery returns 500 in prod)
  const warmup = http.get(`${API_BASE}/pastes/${KNOWN_PASTE_IDS[0]}`, {
    tags: { name: 'warmup' },
  });
  console.log(`Warmup response: ${warmup.status} (${warmup.timings.duration}ms)`);

  return { startTime: new Date().toISOString() };
}

export default function (data) {
  const pasteId = KNOWN_PASTE_IDS[0];
  const roll = Math.random();
  let cumulative = 0;

  // Workload mix: 55% read, 15% raw, 5% typed, 5% download, 10% discovery, 10% write
  cumulative += WORKLOAD_MIX.publicPasteView;
  if (roll < cumulative) {
    const result = readPublicPaste(pasteId);
    check(result, { 'paste read ok': (r) => r.category !== 'server' });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.rawContent;
  if (roll < cumulative) {
    const result = readRawContent(pasteId);
    check(result, { 'raw read ok': (r) => r.category !== 'server' });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.typedApi;
  if (roll < cumulative) {
    const formats = ['json', 'txt', 'md'];
    const fmt = formats[Math.floor(Math.random() * formats.length)];
    const result = readTypedPaste(pasteId, fmt);
    check(result, { 'typed read ok': (r) => r.category !== 'server' });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.download;
  if (roll < cumulative) {
    const result = downloadPaste(pasteId);
    check(result, { 'download ok': (r) => r.category !== 'server' });
    sleep(thinkTime());
    return;
  }

  cumulative += WORKLOAD_MIX.discovery;
  if (roll < cumulative) {
    const result = readDiscoveryFeed(Math.floor(Math.random() * 3));
    check(result, { 'discovery ok': (r) => r.category !== 'server' });
    sleep(thinkTime());
    return;
  }

  // Write (10%)
  const result = createAnonymousPaste();
  check(result, {
    'write attempted': (r) => r !== null,
    'write not 5xx': (r) => r.category !== 'server',
  });
  sleep(thinkTime());
}

export function handleSummary(data) {
  const m = data.metrics;
  const readTotal = m.read_requests?.values?.count || 0;
  const readOk = m.read_successes?.values?.count || 0;
  const writeTotal = m.write_requests?.values?.count || 0;
  const writeOk = m.write_successes?.values?.count || 0;
  const droppedIter = m.dropped_iterations?.values?.count || 0;
  const totalIter = m.iterations?.values?.count || 0;
  const completedIter = totalIter - droppedIter;
  const lines = [
    '',
    '=== Baseline Test Summary ===',
    `Completed iterations: ${completedIter} (dropped: ${droppedIter})`,
    `Total HTTP requests: ${m.http_reqs?.values?.count || 0}`,
    `Achieved throughput: ${(m.http_reqs?.values?.rate || 0).toFixed(1)} req/s`,
    '',
    '── Latency ──',
    `  avg: ${Math.round(m.http_req_duration?.values?.avg || 0)}ms`,
    `  med: ${Math.round(m.http_req_duration?.values?.med || 0)}ms`,
    `  p95: ${Math.round(m.http_req_duration?.values?.['p(95)'] || 0)}ms`,
    `  p99: ${Math.round(m.http_req_duration?.values?.['p(99)'] || 0)}ms`,
    `  max: ${Math.round(m.http_req_duration?.values?.max || 0)}ms`,
    '',
    '── Error Rates ──',
    `  server_errors:    ${((m.server_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  transport_errors: ${((m.transport_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  timeout_errors:   ${((m.timeout_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  auth_errors:      ${((m.auth_errors?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  rate_limit_hits:  ${((m.rate_limit_hits?.values?.rate || 0) * 100).toFixed(2)}%`,
    '',
    '── Business Outcomes ──',
    `  read requests: ${readTotal}, classified success: ${readOk}${readTotal > 0 ? ` (${(readOk / readTotal * 100).toFixed(1)}%)` : ''}`,
    `  write requests: ${writeTotal}, classified success: ${writeOk}${writeTotal > 0 ? ` (${(writeOk / writeTotal * 100).toFixed(1)}%)` : ''}`,
    '',
  ];
  return { stdout: lines.join('\n') };
}
