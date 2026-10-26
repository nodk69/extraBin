#!/usr/bin/env node
/**
 * Generates the OpenCode subagent adapters under `.opencode/agents/` from the
 * canonical Antigravity definitions in `.agents/agents/`.
 *
 * Usage:
 *   node scripts/engineering/sync-opencode-agents.mjs           # write/refresh
 *   node scripts/engineering/sync-opencode-agents.mjs --check   # fail on drift
 *
 * Exit codes: 0 = in sync (or written), 1 = drift/error, 2 = usage error.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_AGENTS,
  listCanonicalAgentNames,
  openCodeAgentPath,
  readCanonicalAgent,
  renderOpenCodeAgent
} from "./lib/opencode-agents.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--check");
if (unknown.length > 0) {
  console.error(`Unexpected argument(s): ${unknown.join(" ")}`);
  console.error("Usage: node scripts/engineering/sync-opencode-agents.mjs [--check]");
  process.exit(2);
}
const CHECK = args.includes("--check");

const canonical = listCanonicalAgentNames(ROOT);
const missing = EXPECTED_AGENTS.filter((name) => !canonical.includes(name));
if (missing.length > 0) {
  console.error(`Missing canonical agent definition(s): ${missing.join(", ")}`);
  process.exit(1);
}
const unlisted = canonical.filter((name) => !EXPECTED_AGENTS.includes(name));
if (unlisted.length > 0) {
  console.error(
    `Unlisted canonical agent(s): ${unlisted.join(", ")}. Add them to EXPECTED_AGENTS, the routing policy and the permissions test together.`
  );
  process.exit(1);
}

const drift = [];
let written = 0;
const targetDir = join(ROOT, ".opencode", "agents");
if (!CHECK) mkdirSync(targetDir, { recursive: true });

for (const name of EXPECTED_AGENTS) {
  const canonicalAgent = readCanonicalAgent(ROOT, name);
  if (!canonicalAgent || !canonicalAgent.description) {
    console.error(`.agents/agents/${name}.md: missing name/description`);
    process.exit(1);
  }

  const expected = renderOpenCodeAgent({ name, description: canonicalAgent.description });
  const target = openCodeAgentPath(ROOT, name);

  if (CHECK) {
    let actual = null;
    try {
      actual = readFileSync(target, "utf8");
    } catch {
      actual = null;
    }
    // Windows checkouts may rewrite LF to CRLF; compare normalized content.
    if (actual === null || actual.replace(/\r\n/g, "\n") !== expected) {
      drift.push(relative(ROOT, target).replace(/\\/g, "/"));
    }
    continue;
  }

  writeFileSync(target, expected, "utf8");
  written += 1;
}

// Remove adapters for agents that no longer exist in the canonical list.
if (existsSync(targetDir)) {
  for (const entry of readdirSync(targetDir)) {
    if (!entry.endsWith(".md")) continue;
    const name = entry.slice(0, -3);
    if (!EXPECTED_AGENTS.includes(name)) {
      const orphan = join(targetDir, entry);
      if (CHECK) {
        drift.push(relative(ROOT, orphan).replace(/\\/g, "/") + " (orphan)");
      } else {
        unlinkSync(orphan);
        console.log(`Removed orphan adapter .opencode/agents/${entry}`);
      }
    }
  }
}

if (CHECK) {
  if (drift.length > 0) {
    console.error("OpenCode agent adapters are out of sync with .agents/agents:");
    for (const file of drift) console.error(`  ${file}`);
    console.error("Run: node scripts/engineering/sync-opencode-agents.mjs");
    process.exit(1);
  }
  console.log(`OpenCode agent adapters in sync: ${EXPECTED_AGENTS.length} subagents.`);
  process.exit(0);
}

console.log(`Wrote ${written} OpenCode subagent adapter(s) to .opencode/agents/.`);
