#!/usr/bin/env node
/**
 * Deterministic behavior tests for the Antigravity lifecycle hooks.
 *
 * The configuration validator proves the hook files are wired correctly; this
 * suite proves the handlers return the intended decision for the documented
 * allow / deny / ask matrix and for the Stop-verification state machine.
 *
 * Usage: node scripts/engineering/test-hooks.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRE_HOOK = join(ROOT, ".agents", "hooks", "pre-tool-use.mjs");
const STOP_HOOK = join(ROOT, ".agents", "hooks", "stop-verification.mjs");

function runHook(script, payload) {
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return { decision: `exit:${result.status}`, stderr: String(result.stderr || "") };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return { decision: parsed.decision ?? "allow", reason: parsed.reason };
  } catch {
    return { decision: `unparseable:${result.stdout}`, stderr: String(result.stderr || "") };
  }
}

function check(label, expected, actual, failures) {
  const ok = actual === expected;
  console.log(`${ok ? "ok  " : "FAIL"} ${expected.padEnd(8)} ${String(actual).padEnd(8)} ${label}`);
  return ok ? failures : failures + 1;
}

const commandCases = [
  ["git status", "allow"],
  ["npm test", "allow"],
  ["cat .env.example", "allow"],
  ["npm run test:run", "allow"],
  ["cat .env", "deny"],
  ["cat backend/.env", "deny"],
  ["Get-Content .env", "deny"],
  ["cat cookies.txt", "deny"],
  ["base64 .env", "deny"],
  ["sort .env", "deny"],
  ["bash -c cat .env", "deny"],
  ["rm -rf /", "deny"],
  ["git push --force", "deny"],
  ["git push origin +main", "deny"],
  ["DROP DATABASE pastebin", "deny"],
  ["rm -rf build", "ask"],
  ["rd /s /q C:\\data", "ask"],
  ["del /s /q C:\\data", "ask"],
  ["git push origin main", "ask"],
  ["flyway clean", "ask"],
  ["docker system prune", "ask"],
  ["truncate table users", "ask"]
];

let failures = 0;

for (const [command, expected] of commandCases) {
  const actual = runHook(PRE_HOOK, { toolCall: { args: { CommandLine: command } } }).decision;
  failures = check(command, expected, actual, failures);
}

failures = check(
  "empty payload -> ask",
  "ask",
  runHook(PRE_HOOK, { toolCall: { args: {} } }).decision,
  failures
);

const work = mkdtempSync(join(tmpdir(), "extrabin-stop-"));
const state = join(work, ".agents", "state");
mkdirSync(state, { recursive: true });
const stampFile = join(state, "verification.json");

let payload;

function useConversation(id) {
  payload = { workspacePaths: [work], conversationId: id, fullyIdle: true };
  return {
    changes: join(state, `changes-${id}.json`),
    reminders: join(state, `reminders-${id}.json`)
  };
}

function stopDecision(label, expected) {
  const actual = runHook(STOP_HOOK, payload).decision;
  failures = check(label, expected, actual, failures);
}

try {
  useConversation("no-tracker");
  stopDecision("no changes tracker -> allow", "allow");

  const tracked = useConversation("tracked");
  const firstChange = new Date(Date.now() - 60000).toISOString();
  writeFileSync(tracked.changes, JSON.stringify([{ file: "scripts/engineering/x.mjs", at: firstChange }]));
  stopDecision("relevant change, no stamp -> continue", "continue");
  stopDecision("same change after reminder -> allow", "allow");

  const laterChange = new Date(Date.now() + 1000).toISOString();
  writeFileSync(tracked.changes, JSON.stringify([{ file: "scripts/engineering/x.mjs", at: laterChange }]));
  stopDecision("newer change after reminder -> continue", "continue");

  const stamped = useConversation("stamped");
  writeFileSync(stamped.changes, JSON.stringify([{ file: "scripts/engineering/x.mjs", at: firstChange }]));
  writeFileSync(stampFile, JSON.stringify({ status: "passed", completedAt: new Date().toISOString() }));
  stopDecision("fresh passing stamp -> allow", "allow");

  const corrupt = useConversation("corrupt");
  rmSync(stampFile, { force: true });
  writeFileSync(corrupt.changes, "{not json");
  stopDecision("corrupt tracker, no fresh stamp -> continue", "continue");
  stopDecision("corrupt tracker after reminder -> allow", "allow");
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\nHook behavior: ${commandCases.length} command cases, 1 empty-payload case, 7 stop scenarios, ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
