#!/usr/bin/env node
/**
 * Antigravity Stop hook.
 *
 * If code/configuration changed in this conversation and no fresh verification
 * stamp exists, ask the agent to verify once before finishing. Allows the stop
 * on the next attempt to avoid an infinite loop. If background tasks are still
 * running, stays out of the way.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const CODE_PREFIXES = [
  "backend/src/",
  "backend/pom.xml",
  "frontend/src/",
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/tsconfig.json",
  "frontend/vite.config.ts",
  ".agents/",
  ".github/",
  "scripts/",
  "infra/",
  "docs/engineering/",
  "performance-tests/",
  "AGENTS.md",
  "opencode.jsonc",
  ".gitignore",
  ".dockerignore",
  ".env.example",
  "docker-compose.yml",
  "backend/Dockerfile",
  "frontend/Dockerfile",
  ".pre-commit-config.yaml"
];

function safeId(value) {
  const id = String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  return id || "unknown";
}

function readStdin() {
  return new Promise((resolvePromise) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolvePromise(""));
  });
}

function allow() {
  process.stdout.write("{}");
  process.exit(0);
}

function continueWith(reason) {
  process.stdout.write(JSON.stringify({ decision: "continue", reason }));
  process.exit(0);
}

try {
  const payload = JSON.parse(await readStdin());
  if (payload?.fullyIdle === false) allow();

  const root = resolve(payload?.workspacePaths?.[0] || process.cwd());
  const conversationId = safeId(payload?.conversationId);
  const stateDir = join(root, ".agents", "state");
  const changesFile = join(stateDir, `changes-${conversationId}.json`);
  if (!existsSync(changesFile)) allow();

  let changes = [];
  let corruptTracker = false;
  try {
    changes = JSON.parse(readFileSync(changesFile, "utf8"));
  } catch {
    // A corrupt tracker must not silently disable the verification reminder.
    corruptTracker = true;
    changes = [{ file: "scripts/engineering/unknown-change", at: new Date().toISOString() }];
  }
  if (!Array.isArray(changes) || changes.length === 0) allow();

  const relevant = changes.filter((entry) =>
    CODE_PREFIXES.some((prefix) => String(entry?.file || "").startsWith(prefix))
  );
  if (relevant.length === 0) allow();

  const latestChange = relevant.reduce((latest, entry) => {
    const at = Date.parse(entry?.at || "");
    return Number.isFinite(at) && at > latest ? at : latest;
  }, 0);

  const verificationFile = join(stateDir, "verification.json");
  if (existsSync(verificationFile)) {
    try {
      const stamp = JSON.parse(readFileSync(verificationFile, "utf8"));
      const completedAt = Date.parse(stamp?.completedAt || "");
      if (
        Number.isFinite(completedAt) &&
        completedAt >= latestChange &&
        (stamp?.status === "passed" || stamp?.status === "limitation")
      ) {
        if (stamp?.status === "limitation") {
          process.stderr.write(
            "stop-verification hook: finishing on a recorded limitation; report the limitation honestly.\n"
          );
        }
        allow();
      }
    } catch {
      // Fall through to the reminder.
    }
  }

  const reminderFile = join(stateDir, `reminders-${conversationId}.json`);
  let reminders = 0;
  let lastRemindedChange = 0;
  if (existsSync(reminderFile)) {
    try {
      const record = JSON.parse(readFileSync(reminderFile, "utf8"));
      reminders = Number(record?.count) || 0;
      lastRemindedChange = Date.parse(record?.lastChange || "") || 0;
    } catch {
      reminders = 0;
    }
  }

  // Remind once per batch of changes, not once per conversation: a fresh change
  // after a reminder must be able to trigger a new reminder. A corrupt tracker
  // cannot be compared, so it gets one reminder per conversation.
  if (corruptTracker && reminders >= 1) allow();
  if (!corruptTracker && reminders >= 1 && latestChange <= lastRemindedChange) allow();

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    reminderFile,
    JSON.stringify({ count: reminders + 1, lastChange: new Date(latestChange || Date.now()).toISOString() }),
    "utf8"
  );

  continueWith(
    "Files changed since the last recorded verification. Run `node scripts/engineering/verify.mjs --changed` " +
      "(or the relevant targeted tests) and fix failures before finishing. If a required check cannot run, " +
      "record it with `node scripts/engineering/verify.mjs --record-limitation \"<reason>\"`. " +
      "Do not claim the change is verified without evidence."
  );
} catch (error) {
  process.stderr.write(`stop-verification hook warning: ${error?.message || error}\n`);
  allow();
}
