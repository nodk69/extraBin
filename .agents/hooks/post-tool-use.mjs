#!/usr/bin/env node
/**
 * Antigravity PostToolUse hook for file mutations.
 *
 * Records changed files per conversation so the Stop hook can tell whether
 * code changed after the last successful verification. Fast, non-blocking and
 * intentionally does not run tests on every write.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

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

try {
  const raw = await readStdin();
  const payload = JSON.parse(raw);
  const root = resolve(payload?.workspacePaths?.[0] || process.cwd());
  const conversationId = safeId(payload?.conversationId);
  const target = payload?.toolCall?.args?.TargetFile || payload?.toolCall?.args?.targetFile;

  if (target) {
    const absolute = isAbsolute(target) ? target : resolve(root, target);
    const file = relative(root, absolute).replace(/\\/g, "/");
    const stateDir = join(root, ".agents", "state");
    mkdirSync(stateDir, { recursive: true });
    const stateFile = join(stateDir, `changes-${conversationId}.json`);

    let changes = [];
    try {
      const parsed = JSON.parse(readFileSync(stateFile, "utf8"));
      if (Array.isArray(parsed)) changes = parsed;
    } catch {
      changes = [];
    }

    changes.push({ file, at: new Date().toISOString() });
    if (changes.length > 500) changes = changes.slice(-500);
    const temporary = `${stateFile}.tmp`;
    writeFileSync(temporary, JSON.stringify(changes, null, 2), "utf8");
    renameSync(temporary, stateFile);
  }
} catch (error) {
  // Never block a file edit because telemetry failed.
  process.stderr.write(`post-tool-use hook warning: ${error?.message || error}\n`);
}

process.stdout.write("{}");
