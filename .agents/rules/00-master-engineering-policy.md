---
trigger: always_on
description: "Master engineering policy for ExtraBin: autonomy, evidence, specialist routing, change control and completion reporting."
---

# Master Engineering Policy

This policy is the operating contract for every agent working in this repository. It complements `AGENTS.md`, `docs/architecture.md`, `docs/security.md` and the user's direct instructions.

**Precedence:** user/system instructions > this policy > `AGENTS.md` > other `.agents/rules/*` > individual agent prompts. When two rules conflict, the more specific rule wins; when the conflict is about autonomy versus approval, the section below applies.

## 1. Autonomy and approval

For routine, reversible engineering work, **act autonomously**: inspect the repository, infer reasonable defaults, implement the complete change, run verification, fix defects, and report evidence. Do not stop to ask for approval of individual files, components, tests or technically equivalent choices.

Ask for a decision only when proceeding would:

- risk irreversible data loss or a destructive production operation;
- change the authentication/authorization model in a way that cannot be safely inferred;
- publish, merge, deploy, tag a release or push to a remote;
- accept a confirmed Critical or High security risk;
- create a breaking public API change or a paid infrastructure commitment;
- require a credential, secret or permission that the agent does not have.

### Conflict resolution with `AGENTS.md`

`AGENTS.md` describes six phases with approval gates. For **routine** work this policy supersedes the pause-and-approve wording: proceed through the phases, report the plan and evidence, and only pause for the consequential decisions listed above. For **consequential** work both policies apply and explicit user approval is still required before the irreversible step.

## 2. Non-negotiable rules

1. Never commit, print, echo or transmit secrets, tokens, private keys, `.env` values, cookies or production credentials.
2. Never weaken authentication, authorization, validation, rate limiting, logging redaction or security tests to make a change pass.
3. Never trust client-side checks as a security boundary. Enforce authorization server-side on every object-level path, including raw, download, embed, preview, share and typed-format endpoints.
4. Never expose private, password-protected, encrypted or burn-after-reading paste content in logs, errors, analytics, previews, caches or generated artifacts.
5. Never disable, skip or weaken a test; never lower a security threshold; never change production configuration merely to manufacture a green result.
6. Never fabricate command output, test results, benchmark numbers, scan results, agent findings or deployment status.
7. Never claim an agent, hook, integration or CI check ran unless its actual result exists.
8. Never overwrite unrelated working-tree changes. Check `git status` before editing and preserve user work.
9. Never run destructive production commands, force-push, rewrite shared history, merge, deploy or publish without explicit authorization.
10. Never claim "zero bugs" or "zero vulnerabilities". State what was tested and what was not.

## 3. Required workflow

Use the matching skill for non-trivial work:

| Request | Skill |
| --- | --- |
| New feature or behavior change | `/implement-feature` |
| Defect, regression or failing test | `/fix-bug` |
| Security hardening or audit | `/security-review` |
| Release, merge or deployment readiness | `/release-readiness` |
| Deterministic local verification | `/verify-change` |

Every behavior change follows: **recon → implement → independent review → deterministic verification → adversarial checks → fix loop → report**. A passing build alone is not evidence that a feature is correct.

## 4. Specialist routing

Invoke independent reviewers through the runtime's subagent mechanism — Antigravity: `invoke_subagent` with the agent `TypeName`; OpenCode: the `subagent` tool with `agent` set to the specialist ID. Run independent reviewers in parallel; do not let the implementing agent replace their judgment.

| Change surface | Required reviewers |
| --- | --- |
| Authentication, sessions, authorization, sharing | security-auditor, code-quality-reviewer, test-validator, api-contract-reviewer, abuse-prevention-reviewer |
| New or changed public endpoint | security-auditor, api-contract-reviewer, test-validator, abuse-prevention-reviewer |
| Database migration or schema change | database-reviewer, test-validator, release-gatekeeper, disaster-recovery-reviewer |
| Frontend feature or redesign | frontend-ux-reviewer, code-quality-reviewer, test-validator; add security-auditor for security-sensitive flows |
| Dependency or build change | dependency-auditor, infrastructure-security-auditor, release-gatekeeper |
| Performance-sensitive path | performance-engineer, database-reviewer, reliability-engineer, test-validator |
| Large refactor or module boundary change | architecture-reviewer, code-quality-reviewer, database-reviewer, test-validator |
| Logging, metrics, health checks, retries | reliability-engineer, privacy-reviewer |
| Backup, restore, retention, deletion | disaster-recovery-reviewer, privacy-reviewer, database-reviewer |
| Docker, proxy, environment, cloud config | infrastructure-security-auditor, dependency-auditor, release-gatekeeper |

Use judgement: do not run a reviewer whose expertise adds no coverage, and do not skip a required reviewer because the change "looks small".

## 5. Change-control discipline

- Read the relevant instructions and code before editing. Do not infer behavior from filenames.
- Trace the affected flow across UI, API, service, persistence and infrastructure.
- Make the smallest complete change that satisfies the request. Do not rewrite unrelated code or reformat whole files.
- Preserve existing API contracts, database compatibility and design-system conventions unless the request intentionally changes them.
- Add dependencies only with a stated reason, a compatibility check and a regression run.
- Prefer existing project commands and scripts over new tooling.
- If an approved plan changes during implementation, the final report MUST include a **Plan deviation** section naming the deviation, the reason and the tests updated to match.

## 6. Evidence standard

Acceptable evidence is an actual command, exit code and result. A file existing or a reviewer's opinion is not proof that behavior works.

- Report tests that ran and passed, tests that failed, and tests that were not run.
- Report environment limitations honestly (missing database, browser, credential, tool or permission).
- Distinguish **confirmed** findings from **potential** risks.
- For UI claims, prefer a real browser or component test over source inspection.
- For performance claims, report the workload, environment and measured percentiles.

## 7. Definition of done

A change is complete only when all applicable conditions hold:

- behavior matches the request, including empty, loading, error and permission-denied states;
- authorization and validation are enforced server-side;
- backend and frontend builds pass;
- relevant unit, integration, security and regression tests pass;
- new behavior has tests, including at least one negative path;
- required specialist reviews are complete and blocking findings are resolved or formally risk-accepted;
- documentation and `CHANGELOG.md` are updated when behavior, contracts or operations change;
- the final report states remaining risks and an honest release status.

## 8. Completion report

Every non-trivial task ends with:

1. **Implemented** — behavior, files and modules changed.
2. **Verification evidence** — commands, exit codes, tests passed/failed, builds, scans, browser or load tests.
3. **Specialist reviews** — agents actually invoked, findings, fixes and unresolved severity.
4. **Remaining risks** — checks not run, limitations, known defects, manual approvals.
5. **Release status** — exactly one of `READY FOR RELEASE`, `NOT READY`, `VERIFICATION INCOMPLETE`.

A local implementation may be complete while production release remains unverified. State that distinction.
