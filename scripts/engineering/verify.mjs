#!/usr/bin/env node
/**
 * Deterministic local verification for ExtraBin.
 *
 * Usage:
 *   node scripts/engineering/verify.mjs config
 *   node scripts/engineering/verify.mjs backend
 *   node scripts/engineering/verify.mjs frontend
 *   node scripts/engineering/verify.mjs changed
 *   node scripts/engineering/verify.mjs all
 *   node scripts/engineering/verify.mjs security
 *   node scripts/engineering/verify.mjs dependency
 *   node scripts/engineering/verify.mjs release
 *   node scripts/engineering/verify.mjs --record-limitation "reason"
 *
 * Writes .agents/state/verification.json when the executed checks pass or when
 * a limitation is explicitly recorded. Exits 0 on pass, 1 on failure, 2 on
 * incomplete verification (missing tool/service/configuration).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IS_WIN = process.platform === "win32";
const STATE_DIR = join(ROOT, ".agents", "state");
const STAMP_FILE = join(STATE_DIR, "verification.json");
const argv = process.argv.slice(2);

const limitationFlag = argv.indexOf("--record-limitation");
const recordedCommands = [];

function quote(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function cwdLabel(cwd) {
  const rel = relative(ROOT, cwd);
  return rel ? rel.replace(/\\/g, "/") : ".";
}

function run(label, command, cwd) {
  const display = Array.isArray(command) ? command.map(quote).join(" ") : command;
  console.log(`\n[verify] ${label}`);
  console.log(`$ ${display}  (cwd: ${cwdLabel(cwd)})`);

  const result = Array.isArray(command)
    ? spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit", shell: false, env: process.env })
    : spawnSync(command, { cwd, stdio: "inherit", shell: true, env: process.env });

  const exitCode = typeof result.status === "number" ? result.status : 1;
  if (result.error) console.error(`[verify] ${label}: ${result.error.message}`);
  recordedCommands.push({ label, command: display, cwd: cwdLabel(cwd), exitCode });
  if (exitCode !== 0) console.error(`[verify] FAIL: ${label} exited with ${exitCode}`);
  return exitCode;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", shell: false });
  if (result.status !== 0) return null;
  return String(result.stdout || "").trim();
}

function changedFiles() {
  const output = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (output === null) return null;
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      let path = line.slice(3).trim();
      if (path.includes(" -> ")) path = path.split(" -> ").pop().trim();
      return path.replace(/^"|"$/g, "").replace(/\\/g, "/");
    })
    .filter(Boolean);
}

function anyStartsWith(files, prefixes) {
  return files.some((file) => prefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
}

function writeStamp(status, extra = {}) {
  mkdirSync(STATE_DIR, { recursive: true });
  const commit = git(["rev-parse", "HEAD"]) || "unknown";
  const stamp = {
    status,
    completedAt: new Date().toISOString(),
    commit,
    commands: recordedCommands,
    ...extra
  };
  const temporary = `${STAMP_FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(stamp, null, 2), "utf8");
  renameSync(temporary, STAMP_FILE);
  console.log(`\n[verify] ${status.toUpperCase()}: evidence written to ${relative(ROOT, STAMP_FILE).replace(/\\/g, "/")}`);
}

function clearStamp() {
  rmSync(STAMP_FILE, { force: true });
}

function configCheck() {
  const validation = run(
    "Agent configuration",
    [process.execPath, "scripts/engineering/validate-agent-config.mjs"],
    ROOT
  );
  const selfTests = run(
    "Agent configuration gate self-tests",
    [process.execPath, "scripts/engineering/test-agent-config.mjs"],
    ROOT
  );
  const hookTests = run(
    "Antigravity hook behavior",
    [process.execPath, "scripts/engineering/test-hooks.mjs"],
    ROOT
  );
  if (validation !== 0) return validation;
  return selfTests !== 0 ? selfTests : hookTests;
}

function backendCheck() {
  const wrapper = IS_WIN ? ".\\mvnw.cmd" : "./mvnw";
  return run("Backend tests", `${wrapper} -B test`, join(ROOT, "backend"));
}

function frontendBuildCheck() {
  return run("Frontend typecheck + production build", "npm run build", join(ROOT, "frontend"));
}

function frontendTestCheck() {
  return run("Frontend Vitest suite", "npm run test:run", join(ROOT, "frontend"));
}

function toolExists(name) {
  const result = spawnSync(name, ["--version"], { cwd: ROOT, encoding: "utf8", shell: true });
  return result.status === 0;
}

function secretScanCheck() {
  if (!toolExists("gitleaks")) {
    console.error("[verify] INCOMPLETE: gitleaks is not installed. Install it or rely on the CI Gitleaks job.");
    return 2;
  }
  return run("Secret scan (gitleaks)", "gitleaks detect --source . --no-git --redact --verbose", ROOT);
}

function dependencyCheck() {
  const npmExit = run(
    "Frontend dependency audit (high/critical)",
    "npm audit --audit-level=high",
    join(ROOT, "frontend")
  );

  const pom = join(ROOT, "backend", "pom.xml");
  const pomText = existsSync(pom) ? readFileSync(pom, "utf8") : "";
  if (!/dependency-check/i.test(pomText)) {
    console.error(
      "[verify] INCOMPLETE: backend OWASP Dependency-Check is not configured in backend/pom.xml. " +
        "Add and baseline it before claiming a backend dependency scan."
    );
    return npmExit === 0 ? 2 : npmExit;
  }

  const mavenExit = run(
    "Backend dependency audit (OWASP Dependency-Check)",
    `${IS_WIN ? ".\\mvnw.cmd" : "./mvnw"} -B org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7`,
    join(ROOT, "backend")
  );
  return npmExit === 0 ? mavenExit : npmExit;
}

function summarize(mode, exitCodes) {
  const failed = exitCodes.filter((code) => code !== 0 && code !== 2).length;
  const incomplete = exitCodes.filter((code) => code === 2).length;
  console.log("\n[verify] Summary");
  console.log(`  mode: ${mode}`);
  console.log(`  failed checks: ${failed}`);
  console.log(`  incomplete checks: ${incomplete}`);
  console.log(`  executed: ${recordedCommands.length}`);

  if (failed > 0) {
    clearStamp();
    console.error("[verify] NOT VERIFIED: one or more checks failed.");
    process.exit(1);
  }
  if (incomplete > 0) {
    clearStamp();
    console.error("[verify] INCOMPLETE: a required check could not be run.");
    process.exit(2);
  }
  writeStamp("passed", { mode });
  console.log("[verify] PASS");
}

function recordLimitation(reason) {
  const text = String(reason || "").trim();
  if (!text) {
    console.error("[verify] --record-limitation requires a non-empty reason.");
    process.exit(1);
  }
  recordedCommands.push({ label: "Verification limitation", command: "recorded", exitCode: 2, limitation: text });
  writeStamp("limitation", { mode: "limitation", limitation: text });
  console.log("[verify] Limitation recorded. This is not a pass; exiting 2 (incomplete).");
  process.exit(2);
}

function main() {
  if (limitationFlag !== -1) {
    recordLimitation(argv.slice(limitationFlag + 1).join(" "));
    return;
  }

  const rawMode = argv.find((arg) => !arg.startsWith("-")) || argv[0] || "changed";
  const mode = rawMode.replace(/^--?/, "");
  const exitCodes = [];

  switch (mode) {
    case "config":
      exitCodes.push(configCheck());
      break;

    case "backend":
      exitCodes.push(backendCheck());
      break;

    case "frontend":
      exitCodes.push(frontendBuildCheck());
      if (exitCodes[exitCodes.length - 1] === 0) exitCodes.push(frontendTestCheck());
      break;

    case "changed": {
      const files = changedFiles();
      exitCodes.push(configCheck());
      if (files === null) {
        console.error("[verify] INCOMPLETE: could not determine changed files (git status failed).");
        exitCodes.push(2);
        break;
      }
      console.log(`[verify] Changed files (${files.length}):`);
      for (const file of files.slice(0, 40)) console.log(`  ${file}`);
      if (files.length > 40) console.log(`  ... and ${files.length - 40} more`);

      const backendChanged = anyStartsWith(files, ["backend/", "pom.xml"]);
      const frontendChanged = anyStartsWith(files, ["frontend/"]);

      if (backendChanged) exitCodes.push(backendCheck());
      if (frontendChanged) {
        const build = frontendBuildCheck();
        exitCodes.push(build);
        if (build === 0) exitCodes.push(frontendTestCheck());
      }
      if (!backendChanged && !frontendChanged) {
        console.log("[verify] No backend/frontend source changes detected; configuration only.");
      }
      break;
    }

    case "all":
      exitCodes.push(configCheck(), backendCheck(), frontendBuildCheck());
      if (exitCodes[exitCodes.length - 1] === 0) exitCodes.push(frontendTestCheck());
      break;

    case "security":
      exitCodes.push(secretScanCheck());
      break;

    case "dependency":
      exitCodes.push(dependencyCheck());
      break;

    case "release":
      exitCodes.push(configCheck(), backendCheck(), frontendBuildCheck());
      if (exitCodes[exitCodes.length - 1] === 0) exitCodes.push(frontendTestCheck());
      exitCodes.push(secretScanCheck(), dependencyCheck());
      break;

    default:
      console.error(`Unknown verification mode: ${mode}`);
      console.error("Use: config | backend | frontend | changed | all | security | dependency | release");
      process.exit(2);
  }

  summarize(mode, exitCodes);
}

main();
