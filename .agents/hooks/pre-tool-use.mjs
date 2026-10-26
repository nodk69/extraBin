#!/usr/bin/env node
/**
 * Antigravity PreToolUse hook for `run_command`.
 *
 * Defense-in-depth only: CI and the deterministic verification scripts are the
 * authoritative gates. This hook blocks obvious destructive or secret-reading
 * commands and asks for confirmation on irreversible actions.
 *
 * Input: JSON on stdin (Antigravity hook contract).
 * Output: JSON on stdout with `decision` and `reason`.
 */
import process from "node:process";

function emit(decision, reason) {
  const payload = { decision };
  if (reason) payload.reason = reason;
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function normalize(command) {
  return String(command || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(command) {
  return command
    .split(/[\s;|&<>()]+/)
    .map((token) => token.replace(/^["']|["']$/g, "").replace(/\\/g, "/"))
    .filter(Boolean);
}

function isSecretPath(token) {
  const normalized = token.toLowerCase();
  if (normalized.includes(".env.example")) return false;
  const base = normalized.split("/").pop();
  if (base === ".env" || /^\.env\.[a-z0-9._-]+$/.test(base)) return true;
  if (/^(?:cookies?|cookie_test|c_test)\.txt$/.test(base)) return true;
  if (/\.(?:pem|key|p12|pfx)$/.test(base)) return true;
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(base)) return true;
  if (/(?:^|\/)\.aws\/credentials$/.test(normalized)) return true;
  if (base === ".git-credentials") return true;
  if (/(?:^|\/)\.ssh\/(?:id_[a-z0-9_]+|config)$/.test(normalized)) return true;
  return false;
}

function isEnvironmentSecretRead(command) {
  // Direct reads of .env / cookie jars / private keys. .env.example stays readable.
  const lower = command.toLowerCase();
  const tokens = tokenize(command);
  if (!tokens.some(isSecretPath)) return false;
  const reader = /(?:^|[;&|]\s*|\bsudo\s+)(?:cat|type|get-content|gc|select-string|head|tail|less|more|grep|rg|findstr|strings|awk|sed|copy|cp|move|mv|base64|base32|sort|tee|nl|od|xxd|diff|comm|join|paste|xargs)\b/;
  const interpreter = /\b(?:node|python|python3|ruby|perl|php|powershell|pwsh|cmd|bash|sh|deno|bun)\b|readfilesync|readfile|open\s*\(/;
  return reader.test(lower) || interpreter.test(lower);
}

function isRootTarget(token) {
  const path = token.replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  return (
    path === "/" ||
    path === "/*" ||
    path === "~" ||
    path === "~/" ||
    path === "$home" ||
    path === "." ||
    path === "./*" ||
    path === "*" ||
    /^[a-z]:\/?$/.test(path) ||
    /^[a-z]:\/\*$/.test(path)
  );
}

function hasRecursiveAndForce(segment) {
  const recursive = /(?:^|\s)(?:-[a-z]*r[a-z]*|--recursive)(?=\s|$)/.test(segment);
  const force = /(?:^|\s)(?:-[a-z]*f[a-z]*|--force)(?=\s|$)/.test(segment);
  return recursive && force;
}

function isRootRecursiveDelete(command) {
  const lower = command.toLowerCase().replace(/\s+/g, " ");
  const rm = lower.match(/\brm\b([^;&|]*)/);
  if (rm && hasRecursiveAndForce(rm[0])) {
    const targets = rm[0].split(" ").slice(1).filter((token) => token && !token.startsWith("-"));
    if (targets.some(isRootTarget)) return true;
  }

  const removeItem = lower.match(/\bremove-item\b([^;&|]*)/);
  if (removeItem && hasRecursiveAndForce(removeItem[0])) {
    const targets = removeItem[0]
      .split(" ")
      .slice(1)
      .filter((token) => token && !token.startsWith("-") && !/^(?:path|literalpath)$/.test(token));
    if (targets.some(isRootTarget)) return true;
  }

  return false;
}

try {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // If we cannot understand the request, ask rather than silently allowing a
    // potentially dangerous command. This is fail-safe, not a hard block.
    emit("ask", "Command safety hook could not parse the request; confirm this command manually.");
  }

  const args = payload?.toolCall?.args ?? {};
  const command = normalize(args.CommandLine ?? args.commandLine ?? args.command ?? "");
  if (!command) {
    emit("ask", "Command safety hook parsed the request but found no command; confirm this command manually.");
  }

  const lower = command.toLowerCase();

  if (isEnvironmentSecretRead(command)) {
    emit("deny", "Reading .env, cookie jars or private keys can expose secrets in the transcript. Use .env.example or report the variable name instead.");
  }

  if (isRootRecursiveDelete(command)) {
    emit("deny", "Recursive forced deletion of a root, home, wildcard or drive path is not permitted.");
  }

  // Hard blocks: irreversible infrastructure / history destruction.
  const hardBlocks = [
    [/\b(?:drop\s+(?:database|schema))\b/i, "Destructive database DDL is blocked. Run it only through an explicitly authorized, reviewed migration/recovery procedure."],
    [/\b(?:kubectl\s+delete|terraform\s+destroy)\b/i, "Destructive infrastructure commands are blocked. Obtain explicit authorization and use the reviewed deployment procedure."],
    [/\b(?:shutdown|restart-computer|stop-computer)\b/i, "Host shutdown/restart is blocked."],
    [/\bformat\s+[a-z]:/i, "Disk formatting is blocked."],
    [/\bgit\s+push\b[^\n]*(?:--force\b|\s-f(?:\s|$)|\s\+\S+)/i, "Force-push rewrites shared history. Use a normal push or obtain explicit authorization."]
  ];
  for (const [pattern, reason] of hardBlocks) {
    if (pattern.test(command)) emit("deny", reason);
  }

  // Ask for confirmation on consequential but sometimes legitimate actions.
  const askPatterns = [
    [/\bgit\s+push\b/i, "Pushing to a remote is a consequential action and requires explicit authorization."],
    [/\bgh\s+(?:pr\s+merge|release\s+create)\b/i, "Merging or publishing a release requires explicit authorization."],
    [/\b(?:npm\s+publish|mvn\s+deploy|docker\s+push)\b/i, "Publishing or deploying an artifact requires explicit authorization."],
    [/\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|restore\s+\.)/i, "This command can discard uncommitted work. Confirm that no user changes will be lost."],
    [/\brm\s+(?:-[a-z]*[rf][a-z]*|--recursive|--force)\b|\bremove-item\b[^\n]*\s-(?:recurse|force)\b|\b(?:rd|rmdir|del)\s+\/s\b/i, "Recursive or forced deletion. Confirm the target and that it is not user work."],
    [/\b(?:truncate\s+table|flyway\s+clean|flyway:clean)\b/i, "This destroys database data. Confirm it targets an isolated local/test database."],
    [/\bdocker\s+(?:system\s+prune|volume\s+rm|rm\s+-f)\b/i, "This removes containers or volumes and can destroy local data. Confirm the target."],
    [/\bchmod\s+777\b/i, "World-writable permissions are a security risk. Confirm the need."],
    [/\bsudo\b/i, "Elevated privileges require manual confirmation."]
  ];
  for (const [pattern, reason] of askPatterns) {
    if (pattern.test(command)) emit("ask", reason);
  }

  emit("allow");
} catch (error) {
  process.stderr.write(`pre-tool-use hook error: ${error?.message || error}\n`);
  emit("ask", "Command safety hook failed; confirm this command manually.");
}
