#!/usr/bin/env node
/**
 * Regression tests for the configuration gate.
 *
 * Each case builds a throw-away copy of the configuration surface, applies one
 * mutation, runs the validator against it and asserts the exit code. This is
 * what keeps the validator from silently becoming a rubber stamp (for example
 * when the adapter permission matrix or the CI wiring check is weakened).
 *
 * Usage: node scripts/engineering/test-agent-config.mjs
 * Exit: 0 = every case behaved as required, 1 = a case regressed.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COPY = [
  "AGENTS.md",
  "opencode.jsonc",
  ".agents",
  ".opencode",
  ".github/workflows/ci.yml",
  "scripts/engineering",
  "backend/src/main/resources/db/migration"
];

function freshTree() {
  const dir = mkdtempSync(join(tmpdir(), "extrabin-agent-config-"));
  for (const entry of COPY) {
    const source = join(ROOT, entry);
    const target = join(dir, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  return dir;
}

function runValidator(dir) {
  const result = spawnSync(process.execPath, [join(dir, "scripts/engineering/validate-agent-config.mjs")], {
    cwd: dir,
    encoding: "utf8"
  });
  return { status: result.status, output: `${result.stdout || ""}${result.stderr || ""}` };
}

function edit(file, from, to) {
  const text = readFileSync(file, "utf8");
  if (!text.includes(from)) throw new Error(`fixture text not found in ${file}: ${from}`);
  writeFileSync(file, text.replace(from, to), "utf8");
}

const cases = [
  {
    name: "baseline configuration passes",
    expect: 0,
    mutate: () => {}
  },
  {
    name: "adapter granting edit is rejected",
    expect: 1,
    mutate: (dir) => {
      edit(
        join(dir, ".opencode/agents/security-auditor.md"),
        '  - action: edit\n    resource: "*"\n    effect: deny',
        '  - action: edit\n    resource: "*"\n    effect: allow'
      );
    }
  },
  {
    name: "unapproved adapter is rejected",
    expect: 1,
    mutate: (dir) => {
      writeFileSync(
        join(dir, ".opencode/agents/rogue-helper.md"),
        '---\ndescription: "rogue"\nmode: subagent\n---\n\nrogue\n',
        "utf8"
      );
    }
  },
  {
    name: "shadow OpenCode config is rejected",
    expect: 1,
    mutate: (dir) => {
      writeFileSync(join(dir, ".opencode/opencode.json"), "{\n  \"permissions\": []\n}\n", "utf8");
    }
  },
  {
    name: "missing sync step in CI is rejected",
    expect: 1,
    mutate: (dir) => {
      edit(join(dir, ".github/workflows/ci.yml"), "sync-opencode-agents.mjs --check", "echo skipped");
    }
  },
  {
    name: "missing configuration self-test step in CI is rejected",
    expect: 1,
    mutate: (dir) => {
      edit(join(dir, ".github/workflows/ci.yml"), "node scripts/engineering/test-agent-config.mjs", "echo skipped");
    }
  },
  {
    name: "missing hook behavior step in CI is rejected",
    expect: 1,
    mutate: (dir) => {
      edit(join(dir, ".github/workflows/ci.yml"), "node scripts/engineering/test-hooks.mjs", "echo skipped");
    }
  },
  {
    name: "downgrading force-push deny to ask is rejected",
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, "opencode.jsonc");
      edit(
        file,
        '{ "action": "shell", "resource": "git push --force*", "effect": "deny" }',
        '{ "action": "shell", "resource": "git push --force*", "effect": "ask" }'
      );
      edit(
        file,
        '{ "action": "shell", "resource": "git *push*--force*", "effect": "deny" }',
        '{ "action": "shell", "resource": "git *push*--force*", "effect": "ask" }'
      );
    }
  },
  {
    name: "empty canonical description is rejected",
    expect: 1,
    mutate: (dir) => {
      const file = join(dir, ".agents/agents/security-auditor.md");
      const text = readFileSync(file, "utf8");
      writeFileSync(file, text.replace(/^description: .*$/m, "description:"), "utf8");
    }
  },
  {
    name: "write tool on a reviewer is rejected",
    expect: 1,
    mutate: (dir) => {
      edit(join(dir, ".agents/agents/security-auditor.md"), "  - view_file\n", "  - view_file\n  - write_to_file\n");
    }
  },
  {
    name: "CRLF adapters are not a false failure",
    expect: 0,
    mutate: (dir) => {
      const file = join(dir, ".opencode/agents/security-auditor.md");
      const text = readFileSync(file, "utf8").replace(/\n/g, "\r\n");
      writeFileSync(file, text, "utf8");
    }
  },
  {
    name: "JSONC trailing commas are accepted",
    expect: 0,
    mutate: (dir) => {
      edit(join(dir, "opencode.jsonc"), '    { "action": "shell", "resource": "*.env.example", "effect": "allow" }\n  ]', '    { "action": "shell", "resource": "*.env.example", "effect": "allow" },\n  ]');
    }
  }
];

let failures = 0;
for (const testCase of cases) {
  const dir = freshTree();
  try {
    testCase.mutate(dir);
    const { status, output } = runValidator(dir);
    if (status !== testCase.expect) {
      failures += 1;
      console.error(`FAIL  ${testCase.name}: expected exit ${testCase.expect}, got ${status}`);
      console.error(output.trim().split("\n").slice(-8).join("\n"));
    } else {
      console.log(`ok    ${testCase.name}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`ERROR ${testCase.name}: ${error.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\nConfiguration gate regressed: ${failures}/${cases.length} case(s) failed.`);
  process.exit(1);
}
console.log(`\nConfiguration gate: ${cases.length}/${cases.length} cases passed.`);
