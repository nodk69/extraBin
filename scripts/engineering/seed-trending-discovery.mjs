#!/usr/bin/env node
/**
 * ExtraBin Trending & Discovery Load-Test Seeder CLI
 *
 * Simulates activity from synthetic user actors, creates varied public pastes,
 * drives realistic engagement velocity (views, upvotes, downvotes, stars),
 * queries and verifies Explore, Trending, and Most Saved feeds, and supports
 * safe isolated cleanup.
 *
 * Usage:
 *   node scripts/engineering/seed-trending-discovery.mjs [options]
 *
 * Options:
 *   --base-url <url>      Base URL of backend (default: http://localhost:8080)
 *   --actors <count>      Number of synthetic actors to simulate (default: 20)
 *   --pastes <count>      Number of public pastes to publish (default: 40)
 *   --seed <number>       Deterministic random seed (default: 1337)
 *   --run-id <string>     Custom test-run identifier (default: auto-generated timestamp/hash)
 *   --dry-run             Plan and display execution dataset without modifying target database
 *   --cleanup             Delete only pastes created by the specified --run-id
 *   --report <file>       Path for machine-readable JSON report (default: target/trending-seeder-report-<runId>.json)
 *   --force-remote        Allow execution against non-localhost targets
 *   --help                Display usage instructions
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPrng,
  generateActors,
  generatePastes,
  computeEngagementPlan,
  assertSafeEnvironment
} from "./lib/trending-seeder-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultValue;
}

const hasFlag = (flag) => args.includes(flag);

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`
ExtraBin Trending & Discovery Load-Test Seeder

Usage:
  node scripts/engineering/seed-trending-discovery.mjs [options]

Options:
  --base-url <url>      Base URL of backend (default: http://localhost:8080)
  --actors <count>      Number of synthetic actors to simulate (default: 20)
  --pastes <count>      Number of public pastes to publish (default: 40, range 30-40)
  --seed <number>       Deterministic random seed (default: 1337)
  --run-id <string>     Custom test-run identifier (default: auto-generated)
  --dry-run             Plan and display execution dataset without sending write requests
  --cleanup             Delete only pastes created by the specified --run-id
  --report <file>       Path for JSON report output
  --force-remote        Allow execution against non-localhost targets
  --help                Show this help message
`);
  process.exit(0);
}

const BASE_URL = (getArg("--base-url", "http://localhost:8080")).replace(/\/+$/, "");
const ACTOR_COUNT = parseInt(getArg("--actors", "20"), 10);
const PASTE_COUNT = parseInt(getArg("--pastes", "40"), 10);
const SEED = parseInt(getArg("--seed", "1337"), 10);
const DRY_RUN = hasFlag("--dry-run");
const DO_CLEANUP = hasFlag("--cleanup");
const FORCE_REMOTE = hasFlag("--force-remote");

const DEFAULT_RUN_ID = `ld_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000).toString(36)}`;
const RUN_ID = getArg("--run-id", DEFAULT_RUN_ID);
const REPORT_FILE = getArg("--report", resolve(ROOT, "target", `trending-seeder-report-${RUN_ID}.json`));

// Enforce environment safety gate
try {
  assertSafeEnvironment(BASE_URL, FORCE_REMOTE);
} catch (err) {
  console.error(`\n[SAFETY ABORT] ${err.message}\n`);
  process.exit(2);
}

// HTTP Helper with retry and cookie jar
class HttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map(); // name -> value
    this.csrfToken = null;
  }

  updateCookies(response) {
    const rawSetCookie = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

    for (const cookieStr of rawSetCookie) {
      if (!cookieStr) continue;
      const parts = cookieStr.split(";");
      const [nameVal] = parts;
      const eqIdx = nameVal.indexOf("=");
      if (eqIdx !== -1) {
        const name = nameVal.substring(0, eqIdx).trim();
        const value = nameVal.substring(eqIdx + 1).trim();
        this.cookies.set(name, value);
      }
    }

    const csrfHeader = response.headers.get("x-csrf-token");
    if (csrfHeader) {
      this.csrfToken = csrfHeader;
    }
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async ensureCsrf() {
    if (this.csrfToken) return this.csrfToken;
    const res = await this.request("/api/v1/auth/me", { method: "GET" });
    return this.csrfToken;
  }

  async request(path, options = {}, retries = 2) {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...options.headers };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    if (options.method && options.method !== "GET" && options.method !== "HEAD") {
      if (this.csrfToken) {
        headers["X-XSRF-TOKEN"] = this.csrfToken;
      }
    }

    let attempt = 0;
    while (attempt <= retries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers
        });
        this.updateCookies(response);
        return response;
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
  }

  clone() {
    const client = new HttpClient(this.baseUrl);
    client.cookies = new Map(this.cookies);
    client.csrfToken = this.csrfToken;
    return client;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("           ExtraBin Trending & Discovery Load-Test Seeder          ");
  console.log("==================================================================");
  console.log(`Target Base URL   : ${BASE_URL}`);
  console.log(`Test Run ID       : ${RUN_ID}`);
  console.log(`Actors to Simulate: ${ACTOR_COUNT}`);
  console.log(`Pastes to Publish : ${PASTE_COUNT}`);
  console.log(`Random PRNG Seed  : ${SEED}`);
  console.log(`Dry-Run Mode      : ${DRY_RUN ? "YES (simulation only)" : "NO (live HTTP)"}`);
  console.log(`Cleanup Mode      : ${DO_CLEANUP ? "YES (delete run records)" : "NO (seed & verify)"}`);
  console.log("==================================================================\n");

  const prng = createPrng(SEED);
  const actors = generateActors(RUN_ID, ACTOR_COUNT);
  const pasteSpecs = generatePastes(RUN_ID, PASTE_COUNT, prng);
  const engagementPlan = computeEngagementPlan(pasteSpecs, actors, prng);

  const report = {
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    seed: SEED,
    dryRun: DRY_RUN,
    actorCount: ACTOR_COUNT,
    pasteCount: PASTE_COUNT,
    createdPastes: [],
    createdActors: [],
    rankingResults: {},
    failures: [],
    summary: {}
  };

  const rootClient = new HttpClient(BASE_URL);

  if (DO_CLEANUP) {
    console.log(`[CLEANUP] Initiating cleanup for Test Run ID: ${RUN_ID}...`);
    await performCleanup(rootClient, RUN_ID, actors, report);
    finalizeReport(report);
    return;
  }

  if (DRY_RUN) {
    console.log("[DRY-RUN] Simulating dataset generation...");
    console.log(`[DRY-RUN] Generated ${actors.length} actor specifications.`);
    console.log(`[DRY-RUN] Generated ${pasteSpecs.length} paste specifications.`);
    console.log(`[DRY-RUN] Sample Paste 1: "${pasteSpecs[0].title}" (${pasteSpecs[0].language})`);
    console.log(`[DRY-RUN] Sample Engagement: Tier="${engagementPlan[0].tier}", Upvotes=${engagementPlan[0].upvoteActors.length}, Stars=${engagementPlan[0].starActors.length}`);
    finalizeReport(report);
    return;
  }

  // 1. Ensure backend is reachable and get initial CSRF
  console.log("[1/5] Checking target backend health & CSRF bootstrap...");
  try {
    const healthRes = await rootClient.request("/actuator/health");
    if (!healthRes.ok) {
      throw new Error(`Health probe failed with HTTP status ${healthRes.status}`);
    }
    await rootClient.ensureCsrf();
    console.log("      Backend is UP. CSRF token acquired.");
  } catch (err) {
    console.error(`      ERROR: Cannot connect to backend at ${BASE_URL}: ${err.message}`);
    process.exit(1);
  }

  // 2. Register & Login Synthetic Actors
  console.log(`[2/5] Provisioning ${actors.length} synthetic actors via /api/v1/auth/register...`);
  const actorClients = new Map(); // username -> HttpClient

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    const client = new HttpClient(BASE_URL);
    await client.ensureCsrf();

    // Register
    const regRes = await client.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: actor.username,
        email: actor.email,
        password: actor.password
      })
    });

    if (regRes.status !== 201 && regRes.status !== 409) {
      const errText = await regRes.text();
      report.failures.push({ phase: "register", actor: actor.username, status: regRes.status, error: errText });
      console.warn(`      [WARN] Actor registration failed for ${actor.username}: ${regRes.status}`);
      continue;
    }

    // Login to establish session
    const loginRes = await client.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: actor.username,
        password: actor.password
      })
    });

    if (loginRes.ok) {
      actorClients.set(actor.username, client);
      report.createdActors.push(actor.username);
    } else {
      const errText = await loginRes.text();
      report.failures.push({ phase: "login", actor: actor.username, status: loginRes.status, error: errText });
      console.warn(`      [WARN] Actor login failed for ${actor.username}: ${loginRes.status}`);
    }

    if ((i + 1) % 5 === 0 || i === actors.length - 1) {
      process.stdout.write(`      Authenticated ${actorClients.size}/${actors.length} actors\r`);
    }
  }
  console.log(`\n      Provisioned and authenticated ${actorClients.size} actors successfully.`);

  if (actorClients.size === 0) {
    console.error("      ERROR: No actors could be authenticated. Aborting seeder.");
    finalizeReport(report);
    process.exit(1);
  }

  // 3. Publish Public Pastes
  console.log(`[3/5] Publishing ${pasteSpecs.length} public pastes across ${new Set(pasteSpecs.map(p => p.language)).size} languages...`);
  const createdPastes = []; // { id, title, language, index, author }

  const actorNames = Array.from(actorClients.keys());
  for (let i = 0; i < pasteSpecs.length; i++) {
    const spec = pasteSpecs[i];
    const authorName = actorNames[i % actorNames.length];
    const authorClient = actorClients.get(authorName);

    const createRes = await authorClient.request("/api/v1/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: spec.title,
        content: spec.content,
        language: spec.language,
        visibility: spec.visibility,
        expiration: spec.expiration
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      report.failures.push({ phase: "create_paste", title: spec.title, status: createRes.status, error: errText });
      console.warn(`      [WARN] Paste creation failed for #${spec.index}: ${createRes.status}`);
      continue;
    }

    const pasteData = await createRes.json();
    const created = {
      id: pasteData.id,
      title: spec.title,
      language: spec.language,
      index: spec.index,
      author: authorName,
      tags: spec.tags
    };
    createdPastes.push(created);
    report.createdPastes.push(created);

    // Apply tags via tag controller
    for (const tag of spec.tags) {
      await authorClient.request(`/api/v1/pastes/${pasteData.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tag })
      });
    }

    if ((i + 1) % 10 === 0 || i === pasteSpecs.length - 1) {
      process.stdout.write(`      Created ${createdPastes.length}/${pasteSpecs.length} public pastes\r`);
    }
  }
  console.log(`\n      Successfully published ${createdPastes.length} pastes.`);

  // 4. Simulate Engagement (Views, Upvotes, Downvotes, Stars)
  console.log("[4/5] Simulating engagement velocity (views, upvotes, downvotes, stars)...");
  let totalUpvotes = 0;
  let totalDownvotes = 0;
  let totalStars = 0;
  let totalViews = 0;

  for (let i = 0; i < createdPastes.length; i++) {
    const paste = createdPastes[i];
    const plan = engagementPlan.find((p) => p.pasteIndex === paste.index);
    if (!plan) continue;

    // A. Views: trigger views via authenticated actor clients or guest sessions
    for (let v = 0; v < plan.viewCount; v++) {
      const viewerName = actorNames[v % actorNames.length];
      const viewerClient = actorClients.get(viewerName) || rootClient;
      const vRes = await viewerClient.request(`/api/v1/pastes/${paste.id}`);
      if (vRes.ok) totalViews++;
    }

    // B. Upvotes
    for (const actorName of plan.upvoteActors) {
      const voterClient = actorClients.get(actorName);
      if (!voterClient) continue;
      const voteRes = await voterClient.request(`/api/v1/pastes/${paste.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voteType: "UP" })
      });
      if (voteRes.ok) totalUpvotes++;
      else {
        report.failures.push({ phase: "vote_up", pasteId: paste.id, actor: actorName, status: voteRes.status });
      }
    }

    // C. Downvotes
    for (const actorName of plan.downvoteActors) {
      const voterClient = actorClients.get(actorName);
      if (!voterClient) continue;
      const voteRes = await voterClient.request(`/api/v1/pastes/${paste.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voteType: "DOWN" })
      });
      if (voteRes.ok) totalDownvotes++;
      else {
        report.failures.push({ phase: "vote_down", pasteId: paste.id, actor: actorName, status: voteRes.status });
      }
    }

    // D. Stars (Saves)
    for (const actorName of plan.starActors) {
      const starClient = actorClients.get(actorName);
      if (!starClient) continue;
      const starRes = await starClient.request(`/api/v1/pastes/${paste.id}/star`, {
        method: "POST"
      });
      if (starRes.ok) totalStars++;
      else {
        report.failures.push({ phase: "star", pasteId: paste.id, actor: actorName, status: starRes.status });
      }
    }

    if ((i + 1) % 5 === 0 || i === createdPastes.length - 1) {
      process.stdout.write(`      Engaged ${i + 1}/${createdPastes.length} pastes (Up: ${totalUpvotes}, Down: ${totalDownvotes}, Stars: ${totalStars})\r`);
    }
  }
  console.log(`\n      Total Engagement Generated: ${totalViews} views, ${totalUpvotes} upvotes, ${totalDownvotes} downvotes, ${totalStars} stars.`);

  // 5. Query and Validate Discovery Endpoints
  console.log("[5/5] Querying discovery endpoints and validating ranking...");
  await validateDiscovery(rootClient, createdPastes, engagementPlan, report);

  finalizeReport(report);
}

async function validateDiscovery(client, createdPastes, engagementPlan, report) {
  const pasteIdMap = new Map(createdPastes.map((p) => [p.id, p]));

  // 1. Explore Feed
  const exploreRes = await client.request(`/api/v1/discovery?size=50`);
  if (exploreRes.ok) {
    const data = await exploreRes.json();
    const foundRunPastes = (data.items || []).filter((item) => pasteIdMap.has(item.id));
    report.rankingResults.explore = {
      totalFound: data.totalElements,
      matchingThisRun: foundRunPastes.length,
      status: "PASS"
    };
    console.log(`      [EXPLORE] Found ${foundRunPastes.length} of our run's pastes in Explore feed.`);
  } else {
    report.rankingResults.explore = { status: "FAIL", statusCode: exploreRes.status };
    console.error(`      [EXPLORE] Failed to fetch /api/v1/discovery: ${exploreRes.status}`);
  }

  // 2. Tag Filter
  const tagRes = await client.request(`/api/v1/discovery?tag=loadtest-${RUN_ID}&size=50`);
  if (tagRes.ok) {
    const data = await tagRes.json();
    report.rankingResults.tagFilter = {
      tag: `loadtest-${RUN_ID}`,
      count: data.totalElements,
      status: data.totalElements >= createdPastes.length ? "PASS" : "WARN"
    };
    console.log(`      [TAG FILTER] Tag 'loadtest-${RUN_ID}' returned ${data.totalElements} pastes.`);
  }

  // 3. Trending Feed (24h)
  const trendingRes = await client.request(`/api/v1/discovery/trending?window=24h&size=20`);
  if (trendingRes.ok) {
    const data = await trendingRes.json();
    const items = data.items || [];
    const topIds = items.slice(0, 3).map((it) => it.id);

    // Identify which pastes from our run were expected to be in Top Popular
    const topPlanIndices = new Set(engagementPlan.filter((p) => p.tier === "TOP_POPULAR").map((p) => p.pasteIndex));
    const expectedTopPastes = createdPastes.filter((p) => topPlanIndices.has(p.index)).map((p) => p.id);

    const matchesTop = expectedTopPastes.some((id) => topIds.includes(id));
    report.rankingResults.trending = {
      window: "24h",
      topIds,
      expectedTopPastes,
      topTierRepresented: matchesTop,
      status: matchesTop ? "PASS" : "VERIFY_RANK"
    };
    console.log(`      [TRENDING] Top 3 IDs: ${topIds.join(", ")} | Expected top: ${expectedTopPastes.join(", ")} (Match: ${matchesTop ? "YES" : "NO"})`);
  } else {
    report.rankingResults.trending = { status: "FAIL", statusCode: trendingRes.status };
    console.error(`      [TRENDING] Failed to query /api/v1/discovery/trending: ${trendingRes.status}`);
  }

  // 4. Most Saved Feed
  const mostSavedRes = await client.request(`/api/v1/discovery/most-saved?size=20`);
  if (mostSavedRes.ok) {
    const data = await mostSavedRes.json();
    const items = data.items || [];

    // Verify ordering by starsCount DESC strictly
    let strictlyOrdered = true;
    for (let i = 1; i < items.length; i++) {
      if (items[i].starsCount > items[i - 1].starsCount) {
        strictlyOrdered = false;
        break;
      }
    }

    report.rankingResults.mostSaved = {
      count: data.totalElements,
      itemsSample: items.slice(0, 5).map((it) => ({ id: it.id, stars: it.starsCount })),
      strictlyOrdered,
      status: strictlyOrdered ? "PASS" : "FAIL"
    };
    console.log(`      [MOST SAVED] Total starred: ${data.totalElements} | Strictly Ordered (starsCount DESC): ${strictlyOrdered ? "PASS" : "FAIL"}`);
  } else {
    report.rankingResults.mostSaved = { status: "FAIL", statusCode: mostSavedRes.status };
    console.error(`      [MOST SAVED] Failed to query /api/v1/discovery/most-saved: ${mostSavedRes.status}`);
  }
}

async function performCleanup(client, runId, actors, report) {
  console.log(`      Finding pastes tagged with 'loadtest-${runId}'...`);
  await client.ensureCsrf();

  // Query Explore by tag
  const tagRes = await client.request(`/api/v1/discovery?tag=loadtest-${runId}&size=50`);
  if (!tagRes.ok) {
    console.error(`      Failed to list pastes for tag 'loadtest-${runId}': ${tagRes.status}`);
    return;
  }

  const data = await tagRes.json();
  const pastes = data.items || [];
  console.log(`      Found ${pastes.length} pastes to clean up.`);

  // Log in actors to delete owned pastes
  const actorClients = new Map();
  for (const actor of actors) {
    const aClient = new HttpClient(BASE_URL);
    await aClient.ensureCsrf();
    const loginRes = await aClient.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: actor.username,
        password: actor.password
      })
    });
    if (loginRes.ok) {
      actorClients.set(actor.username, aClient);
    } else {
      console.warn(`      [CLEANUP] Could not log in actor '${actor.username}': HTTP ${loginRes.status}`);
    }
  }

  let deletedCount = 0;
  for (const paste of pastes) {
    // Attempt deletion with author client
    let deleted = false;
    for (const [_, aClient] of actorClients) {
      const delRes = await aClient.request(`/api/v1/account/pastes/${paste.id}`, {
        method: "DELETE"
      });
      if (delRes.status === 204) {
        deleted = true;
        deletedCount++;
        break;
      } else {
        console.warn(`      [CLEANUP] Paste ${paste.id} deletion returned HTTP ${delRes.status}`);
      }
    }
    if (!deleted) {
      report.failures.push({ phase: "cleanup", pasteId: paste.id, error: "Could not delete paste with available actor sessions" });
    }
  }

  console.log(`      Cleaned up ${deletedCount}/${pastes.length} test pastes.`);
  report.summary.deletedPastes = deletedCount;
}

function finalizeReport(report) {
  report.summary.totalCreatedPastes = report.createdPastes.length;
  report.summary.totalCreatedActors = report.createdActors.length;
  report.summary.totalFailures = report.failures.length;

  try {
    mkdirSync(dirname(REPORT_FILE), { recursive: true });
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n[REPORT] Saved machine-readable report to: ${REPORT_FILE}`);
  } catch (err) {
    console.warn(`[REPORT] Failed to save report file: ${err.message}`);
  }

  console.log("\n==================================================================");
  console.log("                        EXECUTION SUMMARY                         ");
  console.log("==================================================================");
  console.log(`Test Run ID       : ${report.runId}`);
  console.log(`Actors Created    : ${report.createdActors.length}`);
  console.log(`Pastes Published  : ${report.createdPastes.length}`);
  console.log(`Failures Recorded : ${report.failures.length}`);
  if (report.rankingResults.explore) {
    console.log(`Explore Feed Check: ${report.rankingResults.explore.status}`);
  }
  if (report.rankingResults.trending) {
    console.log(`Trending Velocity : ${report.rankingResults.trending.status}`);
  }
  if (report.rankingResults.mostSaved) {
    console.log(`Most-Saved Ranking: ${report.rankingResults.mostSaved.status}`);
  }
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error(`\n[FATAL ERROR] ${err.stack || err.message}`);
  process.exit(1);
});
