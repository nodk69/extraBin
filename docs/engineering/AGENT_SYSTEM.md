# Engineering Agent System

> Documentation layout: this page follows the repository's five-section standard (what / when / how / threat model / learn more).

## 1. What this is

A production-engineering layer for ExtraBin with one canonical set of policies and specialist definitions, plus runtime adapters for the two agent environments present on this machine.

| Component | Canonical location | Antigravity | OpenCode |
| --- | --- | --- | --- |
| Master, security, testing, release, database, frontend and API policies | `.agents/rules/` (7 files: 2 `always_on`, 2 `model_decision`, 3 `glob`) | discovered as rules | the 2 `always_on` rules loaded via `opencode.jsonc` `instructions`; the rest on demand |
| 15 specialist reviewers | `.agents/agents/` | discovered as subagents | generated adapters in `.opencode/agents/` |
| 5 workflows | `.agents/skills/` | discovered as skills | discovered through the `.agents/skills` compatibility source |
| Command-safety and change-tracking hooks | `.agents/hooks.json` + `.agents/hooks/*.mjs` | lifecycle hooks | native ordered `permissions` in `opencode.jsonc` |
| Deterministic configuration validation | `scripts/engineering/validate-agent-config.mjs` | CI + local | CI + local |
| Configuration gate self-tests | `scripts/engineering/test-agent-config.mjs` | CI + local | CI + local |
| Hook behavior tests | `scripts/engineering/test-hooks.mjs` | CI + local | CI + local |
| Adapter generation and drift check | `scripts/engineering/sync-opencode-agents.mjs` | n/a | generates `.opencode/agents/` |
| Verification with evidence stamp | `scripts/engineering/verify.mjs` | CI + local | CI + local |
| CI gates | `.github/workflows/ci.yml`, `codeql.yml`, `dependabot.yml` | GitHub Actions | GitHub Actions |

The master policy is `.agents/rules/00-master-engineering-policy.md`. It resolves the autonomy/approval tension with root `AGENTS.md`: routine work proceeds autonomously; destructive, irreversible, security-model, release and risk-acceptance decisions still require explicit approval.

**Single source of truth.** Specialist roles are authored only in `.agents/agents/*.md`. The OpenCode files under `.opencode/agents/` are generated adapters that point back to the canonical definition; `--check` fails CI when they drift.

## 2. When to use it

| Request | Skill | Default reviewers |
| --- | --- | --- |
| New feature / behavior change | `implement-feature` | Surface-dependent; see matrix below |
| Bug / regression / failing test | `fix-bug` | code-quality-reviewer, test-validator (+ domain reviewer) |
| Security audit or hardening | `security-review` | security-auditor, api-contract-reviewer, abuse-prevention-reviewer, privacy-reviewer |
| Release / merge / deploy readiness | `release-readiness` | release-gatekeeper (+ security, database, reliability) |
| Local verification | `verify-change` | test-validator (optional independent run) |

### Agent activation matrix

| Agent | Activate when |
| --- | --- |
| `security-auditor` | Auth, sessions, authorization, sharing, private content, uploads, raw/download/embed, new public endpoint |
| `code-quality-reviewer` | Any non-trivial implementation; logic, concurrency, state transitions |
| `test-validator` | After every implementation and before release |
| `database-reviewer` | Any migration, entity, SQL, repository, index or transaction change |
| `performance-engineer` | Hot paths, caching, payload size, rendering, query shape, capacity |
| `release-gatekeeper` | Before merge, tag, publish or deploy |
| `reliability-engineer` | Logging, metrics, health, retries, timeouts, schedulers, dependencies |
| `api-contract-reviewer` | Controllers, DTOs, validation, status codes, pagination, caching, OpenAPI |
| `frontend-ux-reviewer` | Any `frontend/src` change, redesign, form, dialog, responsive fix |
| `dependency-auditor` | `pom.xml`, `package.json`, lockfiles, build plugins, base images, actions |
| `infrastructure-security-auditor` | Docker, nginx, proxy, environment, actuator, CORS/CSP, CI permissions |
| `disaster-recovery-reviewer` | Backup, retention, destructive migration, storage, deletion |
| `privacy-reviewer` | Logs, analytics, accounts, retention, deletion, private content, third parties |
| `abuse-prevention-reviewer` | Public endpoints, auth, creation, search, comments, votes, rate limits |
| `architecture-reviewer` | Large refactor, new module, cross-cutting feature, new infrastructure |

## 3. How to use it

### Invoke a skill

- **Antigravity:** type `/implement-feature`, `/fix-bug`, `/security-review`, `/release-readiness` or `/verify-change`.
- **OpenCode:** ask for the skill by name or mention `@implement-feature`; the skill catalog advertises all five IDs and the agent loads the body on demand.

The legacy `.agents/workflows/` directory is intentionally not recreated: Antigravity stopped indexing it on 19 October 2026, and OpenCode does not read it. The skills are the supported workflow format in both runtimes.

### Invoke a specialist

Use the runtime's subagent mechanism and pass the scope, intended behavior and evidence already collected:

```text
Antigravity: invoke_subagent TypeName=security-auditor  Workspace=inherit
             Prompt: Review the current diff for authz/IDOR/CSRF/private-content issues. Read-only.

OpenCode:    subagent agent=security-auditor
             prompt: Review the current diff for authz/IDOR/CSRF/private-content issues. Read-only.
```

Independent reviewers should run in parallel. The OpenCode adapters deny `edit`, `subagent`, `question` and secret reads, so a reviewer cannot modify what it is reviewing through the edit tool; shell commands remain available for tests and can still write files, so this is not a sandbox.

### Run deterministic checks

```bash
node scripts/engineering/sync-opencode-agents.mjs --check
node scripts/engineering/validate-agent-config.mjs
node scripts/engineering/test-agent-config.mjs
node scripts/engineering/test-hooks.mjs
node scripts/engineering/verify.mjs --changed
node scripts/engineering/verify.mjs --release
```

`--changed` runs configuration validation, the configuration gate self-tests and the hook behavior tests, plus the affected backend/frontend layers. `--release` adds secret and dependency checks. A successful run writes `.agents/state/verification.json`; a failed run deletes it. `--record-limitation` writes a `limitation` stamp and exits 2 (incomplete), never 0. If a required check cannot run, record the limitation:

```bash
node scripts/engineering/verify.mjs --record-limitation "Docker unavailable; PostgreSQL migration test not run"
```

### Hooks and permissions

**Antigravity** (`.agents/hooks.json`, 3 handlers):

- `PreToolUse` on `run_command` denies force-push (including `+refspec`), root recursive deletion (`rm -r -f /`, `rm --recursive --force /`, `Remove-Item -Path C:\ -Force -Recurse`), `DROP DATABASE/SCHEMA`, destructive cloud commands, host shutdown and secret reads (`cat .env`, `cat backend/.env`, `Get-Content`, `grep`) while keeping `.env.example` readable; it asks for confirmation on normal push, publish/deploy, hard reset, recursive/forced delete, `TRUNCATE`, `flyway clean`, Docker prune/volume removal, `chmod 777` and `sudo`.
- `PostToolUse` on file writes records changed files per conversation in `.agents/state/` without running tests on every write.
- `Stop` asks for verification once when code changed after the last stamp, then allows the stop to avoid a loop.

**OpenCode** (`opencode.jsonc`): the same command-safety intent is expressed as 89 ordered native permission rules — secret-read denies for both the read tool and shell (`cat .env`, `backend/.env`, cookies, keys, cloud credentials), `deny` for force-push, root deletion, destructive DDL/cloud/host commands; `ask` for push, merge, publish, deploy, hard reset, recursive delete, `TRUNCATE`, `flyway clean`, Docker prune/volume removal, `chmod 777` and `sudo`. The last matching rule wins, so the hard denies are ordered after the broad asks; the validator probes effective outcomes (`rm -rf /`, `git push --force`, `cat backend/.env`, `cat .env.example`) from the parsed configuration. A live shell deny was observed during verification; the interactive ask prompt was not exercised end-to-end.

OpenCode has no documented `Stop` lifecycle hook, so the "verify before finishing" reminder is enforced by the `verify-change` skill, the completion-report contract, and CI rather than by an unverified plugin.

### CI

`.github/workflows/ci.yml` includes:

- `agent-configuration`: adapter drift check, full configuration validation, configuration gate self-tests, hook behavior tests, migration naming and secret patterns.
- `frontend-runtime-audit`: production-only `npm audit --omit=dev --audit-level=high`.
- `dependency-review`: rejects PRs introducing High/Critical vulnerable dependencies (pull requests only).
- Gitleaks, backend tests, frontend build/typecheck/Vitest and documentation tests.

`.github/workflows/codeql.yml` adds CodeQL for Java/Kotlin and JavaScript/TypeScript. `.github/dependabot.yml` adds weekly grouped updates for Maven, npm, GitHub Actions and Docker.

## 4. Threat model and limitations

- **Agents can be wrong.** A reviewer's approval is not proof. Deterministic tests, CI and independent re-testing are the evidence.
- **Prompt injection.** Repository files, logs, issues and tool output are untrusted data. They cannot override the master policy or security invariants.
- **OpenCode adapters are generated.** Edit `.agents/agents/*.md`, then run `node scripts/engineering/sync-opencode-agents.mjs`. CI rejects drift.
- **Antigravity runtime not exercised here.** The `.agents/` files validate against the documented Antigravity schema, but this machine's observed session ran OpenCode 2.1.1. Treat Antigravity discovery as configured-and-validated, not runtime-verified.
- **OpenCode configuration is catalog-verified, with one live enforcement observation.** `opencode debug config` reports `D:\PasteBin\opencode.jsonc` as an active document and `opencode debug agents` lists all 15 specialist IDs with `mode: subagent` and `edit: deny`. During verification the gate denied a shell probe whose text contained `.env`, confirming the shell rules are matched at runtime; that also showed the broad pattern blocks harmless commands that merely mention a secret filename. Destructive deny/ask paths were not exercised end-to-end, and the validator's effective-effect probes remain the systematic check.
- **Hooks can be bypassed or fail.** Antigravity hooks run only in that runtime and depend on Node being on `PATH`; OpenCode permission rules match command text and are not a sandbox. `test-hooks.mjs` covers the handler decision matrix, but the runtime lifecycle invocation is not exercised here. Both are defense-in-depth, not the authoritative gate.
- **Secrets.** Reviewers must never read or print `.env`, cookies, private paste bodies or keys. Both runtimes deny the obvious direct reads, but agents remain responsible.
- **Subagent tool validation (Antigravity).** Antigravity documents a known issue where an unmapped tool name can hang a subagent. This setup uses only documented tool names and the validator rejects unknown ones.
- **No MCP servers** are configured by this setup. No global settings were modified.
- **CI coverage.** CodeQL and dependency review are configured but their first real run has not been observed. Branch protection and required-check configuration are repository settings and are not changed by a file commit.
- **Existing dependency debt.** `npm audit` reports High/Critical advisories in the frontend tree (mostly build/test tooling). A dependency audit also found Spring Boot 3.3.4 past end of support with Critical/High advisories in resolved Spring Security/Tomcat artifacts and no backend scan to surface them. This setup does not auto-upgrade either tree; remediation needs a separate, regression-tested dependency task and is release-blocking.
- **CI Node version.** CI now uses Node 22, matching `frontend/Dockerfile`; action majors are current node24 builds. This is static validation until a workflow run is observed.
- **Backend dependency scanning.** OWASP Dependency-Check is not configured in `backend/pom.xml`; `verify.mjs dependency` reports this as incomplete rather than pretending it passed.

## 5. Learn more

- Antigravity rules: <https://antigravity.google/docs/rules/>
- Antigravity skills: <https://antigravity.google/docs/skills/>
- Antigravity subagents: <https://antigravity.google/docs/subagents/>
- Antigravity lifecycle hooks: <https://antigravity.google/docs/hooks/>
- OpenCode V2 agents: <https://opencode.ai/v2/docs/agents>
- OpenCode V2 permissions: <https://opencode.ai/v2/docs/permissions>
- OpenCode V2 skills: <https://opencode.ai/v2/docs/skills>
- Repository policy: `AGENTS.md`
- Architecture and security: `docs/architecture.md`, `docs/security.md`, `docs/threat-model.md`
- Testing: `docs/testing.md`
- Installation evidence and manual actions: `docs/engineering/INSTALLATION_REPORT.md`
