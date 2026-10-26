# Installation Report — Engineering Agent System

> Report format: this is installation evidence, not a five-section documentation page, so the what/when/how/threat-model layout does not apply. The guide is `docs/engineering/AGENT_SYSTEM.md`.

Date: 2026-10-22
Scope: agent/CI configuration only. No backend or frontend application code was changed.

## 1. Environment inspected

| Item | Finding |
| --- | --- |
| Active agent runtime | OpenCode `2.1.1` (desktop + `opencode-cli.exe`), project location `D:\PasteBin` |
| Secondary runtime | Antigravity is installed on the machine; its runtime was **not** launched in this session |
| OpenCode config discovery | `opencode debug config` lists `D:\PasteBin\opencode.jsonc` as an active document |
| Skills discovery | OpenCode advertises the five skills from `.agents/skills/` through its documented compatibility source |
| Existing repository protocol | `AGENTS.md`, `DECISIONS.md` (ADR-031) and `.pre-commit-config.yaml` |
| Git state at start | Existing uncommitted work under `.agents/`, `docs/engineering/`, `scripts/`, `.github/`; preserved |

## 2. Components delivered

| Component | Path | Count |
| --- | --- | --- |
| Master + domain policies | `.agents/rules/` | 7 |
| Canonical specialist definitions (Antigravity) | `.agents/agents/` | 15 |
| Generated OpenCode adapters (read-only subagents) | `.opencode/agents/` | 15 |
| Workflows as skills | `.agents/skills/` | 5 |
| Antigravity lifecycle hooks | `.agents/hooks.json` + `.agents/hooks/` | 3 handlers |
| OpenCode command-safety and secret-read gate | `opencode.jsonc` | 89 ordered rules |
| Adapter generator + drift check | `scripts/engineering/sync-opencode-agents.mjs` | 1 |
| Configuration validator | `scripts/engineering/validate-agent-config.mjs` | 1 |
| Configuration gate self-tests | `scripts/engineering/test-agent-config.mjs` | 12 cases |
| Hook behavior tests | `scripts/engineering/test-hooks.mjs` | 22 commands + 1 empty payload + 7 Stop scenarios |
| Deterministic verification runner | `scripts/engineering/verify.mjs` | 1 |
| CI gates | `.github/workflows/ci.yml`, `codeql.yml`, `dependabot.yml` | 3 files |
| Documentation | `docs/engineering/AGENT_SYSTEM.md`, this report | 2 |

The 15 specialists are: security-auditor, code-quality-reviewer, test-validator, database-reviewer, performance-engineer, release-gatekeeper, reliability-engineer, api-contract-reviewer, frontend-ux-reviewer, dependency-auditor, infrastructure-security-auditor, disaster-recovery-reviewer, privacy-reviewer, abuse-prevention-reviewer and architecture-reviewer.

## 3. Verification evidence

| # | Command | Result | Exit |
| --- | --- | --- | --- |
| 1 | `node scripts/engineering/sync-opencode-agents.mjs --check` | `OpenCode agent adapters in sync: 15 subagents.` | 0 |
| 2 | `node scripts/engineering/validate-agent-config.mjs` | `7 rules, 15 Antigravity agents, 15 OpenCode subagents, 5 skills, 3 hook handler(s), 16 migration(s), 0 warning(s)` | 0 |
| 3 | `node scripts/engineering/test-agent-config.mjs` | 12/12 cases passed (baseline, adapter escalation, rogue adapter, shadow config, three CI-wiring mutations, force-push downgrade, empty description, reviewer write tool, CRLF, JSONC) | 0 |
| 4 | `node scripts/engineering/test-hooks.mjs` | 22 command cases, 1 empty-payload case and 7 Stop scenarios, 0 failures | 0 |
| 5 | `opencode debug config` | `D:\PasteBin\opencode.jsonc` listed as an active document | 0 |
| 6 | `opencode debug agents` | 15 specialist IDs, all `mode=subagent`, all resolved `edit=deny` | 0 |
| 7 | Resolved permission inspection | `security-auditor` and `build` resolve the deny/ask command rules and secret-read denies | 0 |
| 8 | Session instruction load | `.agents/rules/00-master-engineering-policy.md` and `10-security-policy.md` were injected into the running session from `opencode.jsonc` | observed |
| 9 | Hook decision matrix (22 commands) | allow `git status`, `npm test`, `cat .env.example`; deny `.env` variants, `cookies.txt`, `base64 .env`, `bash -c cat .env`, `rm -rf /`, `git push --force`, `git push origin +main`, `DROP DATABASE`; ask `rm -rf build`, `rd /s`, `del /s`, `git push origin main`, `flyway clean`, `docker system prune`, `truncate table users`; an empty payload asks rather than allowing | 0 |
| 10 | Stop-hook state matrix (7 scenarios) | allows with no tracker, reminds on a new change, allows on repeat, reminds again on later changes, allows on a fresh stamp, fails closed on a corrupt tracker | 0 |
| 11 | Unknown verification flag | `node scripts/engineering/verify.mjs --bogus` → unknown mode | 2 |
| 12 | `node scripts/engineering/verify.mjs config` | 3 checks executed, 0 failed, 0 incomplete; `verification.json` written | 0 |
| 13 | `npm audit --omit=dev --audit-level=high` | 5 advisories (3 low, 2 moderate), 0 high/critical in production dependencies | 0 |
| 14 | `npm audit --audit-level=high` | 18 advisories (2 critical, 6 high, 7 moderate, 3 low) in the development/build tree | 1 |
| 15 | Live OpenCode shell gate | A `git check-ignore` probe containing `.env` was denied by the permission gate; harmless-command false positive noted in the threat model | denied |
| 16 | Action pin resolution | `git ls-remote` resolved all six action tags to the commit SHAs used in `ci.yml` and `codeql.yml` | 0 |
| 17 | Workflow YAML parse | PyYAML parsed `ci.yml`, `codeql.yml` and `dependabot.yml` without error (syntax only; `actionlint` is not installed) | 0 |

Not run in this setup round, with reasons:

- **Backend (`mvnw test`)** was not re-run because this change touches no application code; the last recorded backend baseline in `CHANGELOG.md` remains 557/557. The full frontend suite was re-run after the final configuration edits: `npm run test:run` exited 1 with 36 files / 441 passed / 2 failed (`T5.2 docsLink_resolves` and a `SharingEverywhereUi` 5 s timeout). An earlier run reported 443/0, so these failures are timing/order-sensitive, but the suite cannot be reported green.
- **GitHub Actions / CodeQL / Dependabot** have not executed; no push or pull request was created. Every `uses:` entry is pinned to a full commit SHA with a version comment (`checkout` v7, `setup-node` v7, `setup-java` v6, `dependency-review` v5.0.0, `gitleaks` v3, `codeql-action` v4); each tag was resolved with `git ls-remote`, but that is static validation, not a workflow run.
- **Gitleaks** is not installed locally, so `verify.mjs security` reports incomplete. CI runs the Gitleaks job.
- **OWASP Dependency-Check** is not configured in `backend/pom.xml`, and the full npm audit reports high/critical development advisories. `verify.mjs --release` therefore exits 1 (failed) rather than 2 (incomplete); it never reports a pass.
- **Antigravity discovery** of rules, agents, skills and hooks was not observed at runtime. The files are schema-validated, and hook handler behavior is tested directly by `test-hooks.mjs`; neither proves that the runtime loads and invokes them.

### Independent review findings resolved

Five read-only reviewers ran against this configuration. Their blocking findings were fixed and re-tested:

- **Release gatekeeper**: `AGENTS.md` was git-ignored, so the new required check would fail on a clean checkout; GitHub action pins were still on the retired Node 20 runtime; required-check names and the missing runtime-audit job were misdocumented. Fixed by un-ignoring `AGENTS.md`, pinning node24-compatible actions to commit SHAs, and correcting the check list.
- **Code quality**: `--release` silently degraded to `changed`; non-`1` exit codes (for example `127`) counted as a pass; corrupt change state disabled the Stop reminder; `.env` and recursive-delete matchers missed path prefixes and flag permutations; the OpenCode deny rules were overridden by later `ask` rules; adapter drift compared raw bytes across CRLF checkouts. All fixed and locked by the 22-command / 7-scenario hook suite and the 12-case configuration gate.
- **Security**: the OpenCode permission file had no shell secret-read rule (`cat backend/.env` was allowed), and the Antigravity matcher had the same gap. Fixed with shell deny rules and token-based matching; the validator now probes effective rule outcomes instead of only checking that a deny rule exists.
- **Dependency / supply chain**: actions were tag-pinned, the Gitleaks job lacked `pull-requests: read`, the Gitleaks binary version was implicit, and backend dependency scanning is absent. Fixed by pinning all actions to full commit SHAs with version comments, adding the job permission, setting `GITLEAKS_VERSION`, and extending the `.gitignore` secret block. Backend OWASP Dependency-Check and the Gitleaks action's runtime binary download remain documented gaps, not claimed as solved.
- **Infrastructure**: the read-tool deny list was narrower than the shell list (keys, `.aws/credentials`, `.npmrc`, `.git-credentials`); the trailing `*env.example*` allow shadowed the `.env` deny; the hook reader allowlist missed `base64`, `sort`, `tee` and `bash`; Windows `rd/del /s` had no confirmation; DDL denies were start-anchored; an empty command payload allowed by default. Fixed in both the config and hook, with new validator probes, 22 command cases, 1 empty-payload case and the existing 7 Stop scenarios. Shell-write tracking and mutable-tag residual risk remain documented limitations.

Residual reviewer limitation: a reviewer can still run shell commands that write files (the `edit` tool is denied), and the Antigravity runtime's invocation of the hooks was not observed. Hook logic itself is exercised by `test-hooks.mjs`; that is a handler-level test, not proof of lifecycle integration. Both are documented, not silently accepted as safe.

## 4. Manual actions required

1. **Review and commit the untracked system files.** Nothing was committed or pushed. `git status` still shows them as untracked; the intended set is `.agents/` (excluding `.agents/state/`), `.opencode/agents/`, `scripts/engineering/`, `docs/engineering/`, `opencode.jsonc`, `AGENTS.md`, `.gitattributes`, `.github/dependabot.yml`, `.github/workflows/codeql.yml`, and the edits to `.gitignore` and `ci.yml`. `AGENTS.md` is now explicitly un-ignored so the required CI checkout contains it, and `.gitattributes` keeps the generated adapters LF-only. The untracked `performance-tests/artillery/` tree predates this change and is preserved but not part of it.
2. **Repository settings.** Enable branch protection on `main` and require the check-run names: `Agent Configuration Validation`, `Frontend Runtime Dependency Audit`, `Dependency Review` (PRs only), `Secret Scanning (Gitleaks)`, `Backend Build, Migrations & Security Tests`, `Frontend Typecheck, Lint & Unit Tests`, and the CodeQL `Analyze (...)` checks. Also confirm that CodeQL default setup is disabled (advanced workflow in use) and that the dependency graph is enabled for Dependency Review. File changes cannot configure repository settings.
3. **Antigravity first run.** Open this workspace in Antigravity once and confirm the rules, 15 agents, 5 skills and hook approval prompt appear. This is the only way to verify that runtime.
4. **Secret scanning locally.** Install gitleaks (`pre-commit install` is already configured) if `verify.mjs security` should run on the developer machine.
5. **Dependency debt.** Remediate the pre-existing frontend audit advisories and configure backend OWASP Dependency-Check in a separate, regression-tested change. A dependency audit also reports that `backend/pom.xml` pins Spring Boot 3.3.4, which is past its support window, with Critical/High advisories in resolved Spring Security and Tomcat artifacts. No backend dependency gate exists today, so CI would report green while those advisories remain. This is a release blocker outside the agent-system scope and is not fixed here.
6. **Risk acceptance for remaining Medium findings.** Record an owner and review date for: no backend dependency scan (`DEP-03`), Gitleaks pre-commit `v8.21.2` versus CI `8.24.3` and the action's unverified runtime binary download (`DEP-02`/`DEP-04`), and shell mutations not seen by the change tracker (`INF-11`). These do not block the configuration change, but they must not be reported as fixed.

## 5. Limitations and rollback

- OpenCode has no documented `Stop` lifecycle hook. No plugin was installed because it could not be load-tested safely here; the verify-before-finishing rule is enforced by the `verify-change` skill, the report contract and CI.
- Permission rules match command text and are defense-in-depth, not a sandbox. A differently spelled destructive command, an interpreter one-liner, or a write performed through the shell can still evade them.
- Reviewers are read-only at the tool level (`edit` denied) but may run shell commands needed for testing, including shell writes; the change tracker cannot see those writes.
- `verify.mjs --record-limitation` writes a `limitation` stamp and exits 2. The Antigravity Stop hook accepts that stamp (with a warning) so an agent can finish, but the limitation is visible in the artifact and must be carried into the completion report.
- Rollback: delete `.opencode/agents/`, `opencode.jsonc`, `scripts/engineering/sync-opencode-agents.mjs` and `scripts/engineering/lib/`, then revert the `AGENTS.md` un-ignore, `.gitignore`, `.agents/rules/00-master-engineering-policy.md`, skills and `ci.yml` edits. No application behavior is affected.

## 6. Release status

**NOT READY**

The agent system itself is installed, validated and locally exercised: configuration validation passes with zero warnings, the 12-case configuration gate and the 30-case hook/Stop matrix pass, and `verify.mjs changed` exits 0 with three executed checks. A release is still blocked because:

1. the new CI, CodeQL and Dependabot workflows have never executed on GitHub;
2. the backend pins Spring Boot 3.3.4 (past support) with confirmed Critical/High advisories in resolved Spring Security and Tomcat artifacts, and no backend dependency gate exists;
3. the full frontend suite exits 1 with two failures;
4. the full npm audit still reports 2 critical and 6 high development/build advisories.

The configuration is ready for review and commit, not for a verified production release.
