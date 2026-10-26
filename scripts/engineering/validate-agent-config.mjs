#!/usr/bin/env node
/**
 * Validates the Antigravity workspace configuration:
 *   .agents/rules/<name>.md
 *   .agents/agents/<name>.md
 *   .agents/skills/<name>/SKILL.md
 *   .agents/hooks.json
 *   backend Flyway migration naming
 *
 * No third-party dependencies. Exits non-zero on any schema/discovery error.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_AGENTS as OPENCODE_AGENTS,
  openCodeAgentPath,
  readCanonicalAgent,
  renderOpenCodeAgent
} from "./lib/opencode-agents.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ERRORS = [];
const WARNINGS = [];

const RULE_TRIGGERS = new Set(["always_on", "model_decision", "glob", "manual"]);
const AGENT_MODELS = new Set(["inherit", "flash", "pro"]);
const EXECUTION_POLICIES = new Set(["off", "auto", "eager", "sandbox"]);
const HOOK_EVENTS = new Set([
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PreInvocation",
  "PostInvocation",
  "Stop"
]);
const KNOWN_TOOLS = new Set([
  "view_file",
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
  "list_dir",
  "find_by_name",
  "grep_search",
  "search_web",
  "read_url_content",
  "run_command",
  "manage_task",
  "schedule",
  "list_permissions",
  "ask_permission",
  "invoke_subagent",
  "define_subagent",
  "send_message",
  "manage_subagents",
  "ask_question",
  "generate_image"
]);
const EXPECTED_AGENTS = OPENCODE_AGENTS;
const SECRET_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

function fail(message) {
  ERRORS.push(message);
}

function warn(message) {
  WARNINGS.push(message);
}

function rel(path) {
  return path.replace(ROOT, "").replace(/^[\\/]/, "").replace(/\\/g, "/");
}

function read(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseFrontmatter(text, file) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    fail(`${rel(file)}: missing YAML frontmatter (file must start with "---")`);
    return null;
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${rel(file)}: frontmatter is not closed with "---"`);
    return null;
  }
  const header = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, "");
  const data = {};
  let currentKey = null;

  for (const rawLine of header.split("\n")) {
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;
    const listMatch = rawLine.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(stripQuotes(listMatch[1]));
      continue;
    }
    const keyMatch = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      fail(`${rel(file)}: unsupported frontmatter line: ${rawLine.trim()}`);
      continue;
    }
    const [, key, rawValue] = keyMatch;
    currentKey = key;
    if (!rawValue.trim()) {
      // An empty scalar; a following "- item" line converts it to a list.
      data[key] = "";
    } else if (rawValue.trim() === "true" || rawValue.trim() === "false") {
      data[key] = rawValue.trim() === "true";
    } else {
      data[key] = stripQuotes(rawValue);
    }
  }

  return { data, body, size: normalized.length };
}

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

function scanSecrets(file, text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      fail(`${rel(file)}: possible hard-coded secret detected (${pattern}); remove it and rotate the credential`);
    }
  }
}

function validateRules() {
  const dir = join(ROOT, ".agents", "rules");
  if (!existsSync(dir)) {
    fail("missing .agents/rules directory");
    return 0;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      warn(`.agents/rules/${entry.name}/ is nested; Antigravity only scans immediate .md children unless registered in .agents/rules.json`);
    }
  }
  const files = listMarkdown(dir);
  if (files.length === 0) fail(".agents/rules contains no .md rules");

  for (const file of files) {
    const text = read(file);
    const parsed = parseFrontmatter(text, file);
    if (!parsed) continue;
    const { data, size } = parsed;
    if (!RULE_TRIGGERS.has(data.trigger)) {
      fail(`${rel(file)}: trigger must be one of ${[...RULE_TRIGGERS].join(", ")} (got ${JSON.stringify(data.trigger)})`);
    }
    if (data.trigger === "model_decision" && !data.description) {
      fail(`${rel(file)}: model_decision rules require a description`);
    }
    if (data.trigger === "glob" && !data.globs) {
      fail(`${rel(file)}: glob rules require globs`);
    }
    if (data.description && String(data.description).length < 15) {
      warn(`${rel(file)}: description is very short; the planner may not route to it`);
    }
    if (size > 12000) {
      fail(`${rel(file)}: ${size} characters exceeds the 12,000-character rule limit`);
    }
    scanSecrets(file, text);
  }
  return files.length;
}

function validateAgents() {
  const dir = join(ROOT, ".agents", "agents");
  if (!existsSync(dir)) {
    fail("missing .agents/agents directory");
    return 0;
  }
  const files = listMarkdown(dir);
  const names = new Map();

  for (const file of files) {
    const text = read(file);
    const parsed = parseFrontmatter(text, file);
    if (!parsed) continue;
    const { data, body } = parsed;

    if (!data.name) {
      fail(`${rel(file)}: missing required "name"`);
      continue;
    }
    if (!data.description) fail(`${rel(file)}: missing required "description"`);
    if (String(data.description || "").length < 40) {
      warn(`${rel(file)}: description is short; add trigger keywords so the planner delegates correctly`);
    }
    const base = file.split(/[\\/]/).pop().replace(/\.md$/, "");
    if (data.name !== base) {
      fail(`${rel(file)}: name "${data.name}" does not match filename "${base}"`);
    }
    if (names.has(data.name)) {
      fail(`duplicate agent name "${data.name}" in ${rel(file)} and ${names.get(data.name)}`);
    } else {
      names.set(data.name, rel(file));
    }

    if (!Array.isArray(data.tools) || data.tools.length === 0) {
      fail(`${rel(file)}: "tools" must be a non-empty list`);
    } else {
      for (const tool of data.tools) {
        if (!KNOWN_TOOLS.has(tool)) {
          fail(`${rel(file)}: unknown tool "${tool}" (known issue: unmapped tool names can hang the subagent)`);
        }
      }
    }

    if (data.mainAgent !== undefined && typeof data.mainAgent !== "boolean") {
      fail(`${rel(file)}: mainAgent must be true or false`);
    }
    if (data.subagent !== undefined && typeof data.subagent !== "boolean") {
      fail(`${rel(file)}: subagent must be true or false`);
    }
    if (data.model !== undefined && !AGENT_MODELS.has(data.model)) {
      fail(`${rel(file)}: model must be one of ${[...AGENT_MODELS].join(", ")}`);
    }
    if (data.commandExecutionPolicy !== undefined && !EXECUTION_POLICIES.has(data.commandExecutionPolicy)) {
      fail(`${rel(file)}: commandExecutionPolicy must be one of ${[...EXECUTION_POLICIES].join(", ")}`);
    }
    if (data.subagent === true) {
      // A reviewer subagent must not be able to mutate the tree or run commands
      // outside a sandbox policy.
      if (data.commandExecutionPolicy !== "sandbox") {
        fail(`${rel(file)}: subagent reviewers must set commandExecutionPolicy: sandbox`);
      }
      const writeTools = ["write_to_file", "replace_file_content", "multi_replace_file_content"];
      const granted = (Array.isArray(data.tools) ? data.tools : []).filter((tool) => writeTools.includes(tool));
      if (granted.length > 0) {
        fail(`${rel(file)}: subagent reviewers must not be granted write tools (${granted.join(", ")})`);
      }
    }
    if (body && !/^#\s+Mission/im.test(body)) {
      warn(`${rel(file)}: body has no "# Mission" heading`);
    }
    scanSecrets(file, text);
  }

  for (const expected of EXPECTED_AGENTS) {
    if (!names.has(expected)) fail(`missing required agent "${expected}"`);
  }
  if (files.length !== EXPECTED_AGENTS.length) {
    fail(`expected exactly ${EXPECTED_AGENTS.length} canonical agent files, found ${files.length}; add or remove the specialist in EXPECTED_AGENTS and the routing policy together`);
  }
  return files.length;
}

function validateSkills() {
  const dir = join(ROOT, ".agents", "skills");
  if (!existsSync(dir)) {
    fail("missing .agents/skills directory");
    return 0;
  }
  const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length === 0) fail(".agents/skills contains no skill directories");

  for (const entry of entries) {
    const file = join(dir, entry.name, "SKILL.md");
    if (!existsSync(file)) {
      fail(`${rel(file)}: missing required SKILL.md`);
      continue;
    }
    const text = read(file);
    const parsed = parseFrontmatter(text, file);
    if (!parsed) continue;
    const { data, body } = parsed;
    if (!data.description) fail(`${rel(file)}: missing required "description"`);
    if (data.name && data.name !== entry.name) {
      fail(`${rel(file)}: name "${data.name}" does not match folder "${entry.name}"`);
    }
    if (!body.trim()) fail(`${rel(file)}: empty skill body`);
    if (/\[TODO|placeholder/i.test(body)) {
      warn(`${rel(file)}: body contains a placeholder marker`);
    }
    scanSecrets(file, text);
  }
  return entries.length;
}

function validateHooks() {
  const file = join(ROOT, ".agents", "hooks.json");
  if (!existsSync(file)) {
    fail("missing .agents/hooks.json");
    return 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(read(file));
  } catch (error) {
    fail(`.agents/hooks.json: invalid JSON (${error.message})`);
    return 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(".agents/hooks.json: top level must be an object");
    return 0;
  }

  let handlers = 0;
  for (const [hookName, config] of Object.entries(parsed)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      fail(`.agents/hooks.json: "${hookName}" must be an object`);
      continue;
    }
    if (config.enabled !== undefined && typeof config.enabled !== "boolean") {
      fail(`.agents/hooks.json: "${hookName}.enabled" must be boolean`);
    }
    for (const event of Object.keys(config)) {
      if (event === "enabled") continue;
      if (!HOOK_EVENTS.has(event)) {
        fail(`.agents/hooks.json: "${hookName}" uses unknown event "${event}"`);
        continue;
      }
      const groups = config[event];
      if (!Array.isArray(groups)) {
        fail(`.agents/hooks.json: "${hookName}.${event}" must be an array`);
        continue;
      }
      for (const group of groups) {
        const list = event === "PreToolUse" || event === "PostToolUse" ? group?.hooks : [group];
        if (!Array.isArray(list) || list.length === 0) {
          fail(`.agents/hooks.json: "${hookName}.${event}" has no handlers`);
          continue;
        }
        for (const handler of list) {
          handlers += 1;
          if (!handler || typeof handler.command !== "string" || !handler.command.trim()) {
            fail(`.agents/hooks.json: "${hookName}.${event}" handler is missing "command"`);
            continue;
          }
          if (handler.timeout !== undefined && (typeof handler.timeout !== "number" || handler.timeout <= 0)) {
            fail(`.agents/hooks.json: "${hookName}.${event}" timeout must be a positive number`);
          }
          const match = handler.command.match(/^node\s+(\S+)/);
          if (match) {
            const script = match[1].replace(/^["']|["']$/g, "");
            if (!existsSync(join(ROOT, script))) {
              fail(`.agents/hooks.json: command references missing script "${script}"`);
            }
          }
        }
      }
    }
  }
  if (handlers === 0) fail(".agents/hooks.json: no hook handlers configured");
  return handlers;
}

function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  let inLine = false;
  let inBlock = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inLine) {
      if (char === "\n") {
        inLine = false;
        out += char;
      }
      continue;
    }
    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      // JSONC allows trailing commas; drop them before JSON.parse.
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1;
      if (text[lookahead] === "}" || text[lookahead] === "]") continue;
    }
    out += char;
  }

  return out;
}

function matchesPermissionPattern(pattern, value) {
  const escaped = String(pattern)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function effectiveEffect(config, action, value) {
  let effect = "allow";
  for (const rule of config.permissions || []) {
    if (rule?.action === action && matchesPermissionPattern(rule.resource, value)) {
      effect = rule.effect;
    }
  }
  return effect;
}

/**
 * The adapter permission matrix is asserted independently of the generator so
 * that changing ADAPTER_PERMISSIONS cannot silently make every reviewer
 * writable while the drift check still passes.
 */
const REQUIRED_ADAPTER_PERMISSIONS = [
  ["edit", "*", "deny"],
  ["subagent", "*", "deny"],
  ["question", "*", "deny"],
  ["read", "*.env", "deny"],
  ["read", "*.env.*", "deny"],
  ["read", "*.env.example", "allow"],
  ["read", "cookie*.txt", "deny"],
  ["read", "*.pem", "deny"],
  ["read", "*.key", "deny"],
  ["read", "*.p12", "deny"],
  ["read", "*.pfx", "deny"],
  ["read", "*.git-credentials*", "deny"],
  ["read", "*.npmrc*", "deny"],
  ["read", "*/.aws/credentials*", "deny"],
  ["read", "*/.ssh/id_*", "deny"],
  ["read", "*id_rsa*", "deny"],
  ["read", "*id_ed25519*", "deny"],
  ["read", "*id_ecdsa*", "deny"]
];

function parseAdapterPermissions(text) {
  const frontmatter = text.replace(/\r\n/g, "\n").split("\n---")[0];
  const rules = [];
  const pattern = /^ {2}- action: ([a-z_]+)\n {4}resource: ("(?:[^"\\]|\\.)*")\n {4}effect: (allow|deny|ask)$/gm;
  let match;
  while ((match = pattern.exec(frontmatter)) !== null) {
    rules.push([match[1], JSON.parse(match[2]), match[3]]);
  }
  return rules;
}

function validateOpenCode() {
  const dir = join(ROOT, ".opencode", "agents");
  if (!existsSync(dir)) {
    fail("missing .opencode/agents directory: OpenCode cannot load the specialist subagents");
    return 0;
  }

  const files = listMarkdown(dir);
  for (const name of OPENCODE_AGENTS) {
    const canonical = readCanonicalAgent(ROOT, name);
    if (!canonical || !canonical.description) {
      fail(`.agents/agents/${name}.md: missing a usable description for the OpenCode adapter`);
      continue;
    }
    const file = openCodeAgentPath(ROOT, name);
    if (!existsSync(file)) {
      fail(`missing OpenCode adapter .opencode/agents/${name}.md (run sync-opencode-agents.mjs)`);
      continue;
    }
    const actual = read(file).replace(/\r\n/g, "\n");
    const expected = renderOpenCodeAgent({ name, description: canonical.description });
    if (actual !== expected) {
      fail(`.opencode/agents/${name}.md is out of sync with .agents/agents/${name}.md; run node scripts/engineering/sync-opencode-agents.mjs`);
    }
    if (!/^---\n/.test(actual)) fail(`.opencode/agents/${name}.md: missing YAML frontmatter`);
    if (!/\nmode: subagent\n/.test(actual)) fail(`.opencode/agents/${name}.md: mode must be "subagent"`);
    if (!/\npermissions:\n/.test(actual)) fail(`.opencode/agents/${name}.md: missing permissions`);

    const granted = parseAdapterPermissions(actual);
    const matchesMatrix =
      granted.length === REQUIRED_ADAPTER_PERMISSIONS.length &&
      REQUIRED_ADAPTER_PERMISSIONS.every(
        ([action, resource, effect], index) =>
          granted[index][0] === action &&
          granted[index][1] === resource &&
          granted[index][2] === effect
      );
    if (!matchesMatrix) {
      fail(
        `.opencode/agents/${name}.md: permissions do not match the required read-only matrix ` +
          `(${JSON.stringify(granted)}); reviewers must deny edit/subagent/question and secret reads`
      );
    }
    if (!actual.includes(`.agents/agents/${name}.md`)) {
      fail(`.opencode/agents/${name}.md: does not reference its canonical definition`);
    }
    scanSecrets(file, actual);
  }

  for (const file of files) {
    const base = file.split(/[\\/]/).pop().replace(/\.md$/, "");
    if (!OPENCODE_AGENTS.includes(base)) {
      fail(`.opencode/agents/${base}.md is not an approved specialist; run node scripts/engineering/sync-opencode-agents.mjs to remove it`);
    }
  }

  // A second OpenCode config in `.opencode/` overrides the root document and
  // could silently disable the gate. Only the root file is authoritative.
  const conflictingConfigs = [
    join(ROOT, "opencode.json"),
    join(ROOT, ".opencode", "opencode.jsonc"),
    join(ROOT, ".opencode", "opencode.json")
  ].filter((candidate) => existsSync(candidate));
  for (const candidate of conflictingConfigs) {
    fail(`${rel(candidate)}: conflicting OpenCode config overrides the project gate; keep only opencode.jsonc`);
  }

  const configFile = join(ROOT, "opencode.jsonc");
  if (existsSync(configFile)) scanSecrets(configFile, read(configFile));

  if (!configFile) {
    fail("missing opencode.jsonc: project permissions and instructions are not configured");
  } else {
    let config;
    try {
      config = JSON.parse(stripJsonComments(read(configFile)));
    } catch (error) {
      fail(`${rel(configFile)}: invalid JSONC (${error.message})`);
      config = null;
    }
    if (config) {
      if (typeof config.$schema !== "string") warn(`${rel(configFile)}: missing $schema for editor validation`);
      if (config.instructions !== undefined) {
        if (!Array.isArray(config.instructions) || config.instructions.some((entry) => typeof entry !== "string")) {
          fail(`${rel(configFile)}: instructions must be an array of strings`);
        } else {
          for (const entry of config.instructions) {
            if (/^https?:\/\//.test(entry)) continue;
            if (!existsSync(join(ROOT, entry))) {
              fail(`${rel(configFile)}: instructions file "${entry}" does not exist`);
            }
          }
        }
      }
      if (!Array.isArray(config.permissions)) {
        fail(`${rel(configFile)}: permissions must be an array of rules`);
      } else {
        const effects = new Set(["allow", "deny", "ask"]);
        for (const [index, rule] of config.permissions.entries()) {
          if (!rule || typeof rule !== "object") {
            fail(`${rel(configFile)}: permissions[${index}] must be an object`);
            continue;
          }
          for (const key of ["action", "resource", "effect"]) {
            if (typeof rule[key] !== "string" || !rule[key].trim()) {
              fail(`${rel(configFile)}: permissions[${index}].${key} must be a non-empty string`);
            }
          }
          if (rule.effect && !effects.has(rule.effect)) {
            fail(`${rel(configFile)}: permissions[${index}].effect must be allow, deny or ask`);
          }
        }
        const has = (action, effect) =>
          config.permissions.some((rule) => rule?.action === action && rule?.effect === effect);
        if (!has("shell", "deny")) fail(`${rel(configFile)}: no shell deny rule; the command-safety gate is missing`);
        if (!has("shell", "ask")) fail(`${rel(configFile)}: no shell ask rule for consequential commands`);
        if (!has("read", "deny")) fail(`${rel(configFile)}: no read deny rule for secrets`);

        const probes = [
          ["shell", "rm -rf /", "deny"],
          ["shell", "rm -rf /usr", "deny"],
          ["shell", "rm -rf ~/projects", "deny"],
          ["shell", "git push --force origin main", "deny"],
          ["shell", "git -C backend push --force", "deny"],
          ["shell", "git push origin main -f", "deny"],
          ["shell", "git push origin main", "ask"],
          ["shell", "Remove-Item -Recurse -Force C:\\tmp", "ask"],
          ["shell", "cat backend/.env", "deny"],
          ["shell", "cat backend/.env.staging", "deny"],
          ["shell", "cat .env.ci", "deny"],
          ["shell", "cat .env.example", "allow"],
          ["shell", "cat .env.example .env", "deny"],
          ["shell", "printenv", "deny"],
          ["shell", "psql -c \"drop database pastebin\"", "deny"],
          ["shell", "cat certs/server.key", "deny"],
          ["read", "backend/.env", "deny"],
          ["read", "backend/.env.example", "allow"],
          ["read", "certs/server.key", "deny"],
          ["read", "C:/Users/dev/.ssh/id_rsa", "deny"],
          ["read", "C:/Users/dev/.aws/credentials", "deny"],
          ["read", "frontend/.npmrc", "deny"]
        ];
        for (const [action, value, expected] of probes) {
          const actual = effectiveEffect(config, action, value);
          if (actual !== expected) {
            fail(`${rel(configFile)}: ${action} "${value}" resolves to "${actual}" but must resolve to "${expected}" (last matching rule wins)`);
          }
        }
      }
    }
  }

  return files.length;
}

function validateMigrations() {
  const dir = join(ROOT, "backend", "src", "main", "resources", "db", "migration");
  if (!existsSync(dir)) {
    warn("no Flyway migration directory found");
    return 0;
  }
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));
  const versions = new Map();
  for (const name of files) {
    const match = name.match(/^V(\d+)__[a-z0-9_]+\.sql$/);
    if (!match) {
      fail(`migration "${name}" must match V<number>__<lower_snake_case>.sql`);
      continue;
    }
    const version = Number(match[1]);
    if (versions.has(version)) {
      fail(`duplicate migration version V${version}: "${name}" and "${versions.get(version)}"`);
    } else {
      versions.set(version, name);
    }
  }
  return files.length;
}

function validateCiWiring() {
  const file = join(ROOT, ".github", "workflows", "ci.yml");
  if (!existsSync(file)) {
    fail("no .github/workflows/ci.yml; configuration validation is not wired into CI");
    return;
  }
  const text = read(file);
  if (!text.includes("validate-agent-config.mjs")) {
    fail("CI does not run scripts/engineering/validate-agent-config.mjs");
  }
  if (!text.includes("sync-opencode-agents.mjs --check")) {
    fail("CI does not run scripts/engineering/sync-opencode-agents.mjs --check; adapter drift would go unnoticed");
  }
  if (!text.includes("test-agent-config.mjs")) {
    fail("CI does not run scripts/engineering/test-agent-config.mjs; validator regressions would go unnoticed");
  }
  if (!text.includes("test-hooks.mjs")) {
    fail("CI does not run scripts/engineering/test-hooks.mjs; hook decision regressions would go unnoticed");
  }
}

function main() {
  if (!existsSync(join(ROOT, "AGENTS.md"))) fail("missing root AGENTS.md");
  const rules = validateRules();
  const agents = validateAgents();
  const skills = validateSkills();
  const hooks = validateHooks();
  const openCodeAgents = validateOpenCode();
  const migrations = validateMigrations();
  validateCiWiring();

  for (const warning of WARNINGS) console.warn(`WARN  ${warning}`);
  for (const error of ERRORS) console.error(`ERROR ${error}`);

  if (ERRORS.length) {
    console.error(`\nAgent configuration INVALID: ${ERRORS.length} error(s), ${WARNINGS.length} warning(s).`);
    process.exit(1);
  }

  console.log(
    `Agent configuration OK: ${rules} rules, ${agents} Antigravity agents, ${openCodeAgents} OpenCode subagents, ` +
      `${skills} skills, ${hooks} hook handler(s), ${migrations} migration(s), ${WARNINGS.length} warning(s).`
  );
}

main();
