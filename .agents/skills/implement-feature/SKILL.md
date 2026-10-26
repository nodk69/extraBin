---
name: implement-feature
description: "Implements a new ExtraBin feature or behavior change end-to-end across React, Spring Boot, PostgreSQL and infrastructure. Use when the user asks to add, extend or redesign product functionality. Includes repository recon, implementation, parallel specialist review, deterministic verification, adversarial testing and a completion report."
---

# Implement Feature

You own the engineering execution. Inspect first, make reasonable decisions, implement the whole change, verify it, fix defects, and report evidence. Do not stop for approval of routine implementation details.

## 0. Guardrails

- Read `AGENTS.md`, `.agents/rules/00-master-engineering-policy.md` and the relevant domain rules.
- Check `git status` and preserve unrelated working-tree changes.
- Do not weaken auth, validation, rate limits or tests.
- Ask only for the consequential decisions listed in the master policy.

## 1. Recon

1. Read the feature/architecture/security/testing docs that touch the request.
2. Locate the existing flow: route → controller → service/domain → repository → migration → UI → tests.
3. Search for existing patterns before creating a new abstraction.
4. Identify security boundaries, compatibility constraints and the smallest complete change.
5. List the affected files and the tests that already cover them.

Useful commands:

```bash
git status --short
git diff --stat
rg -n "relevant|symbol" backend/src frontend/src
```

Do not infer behavior from filenames alone.

## 2. Plan internally

Produce a short checklist (not a long approval document) covering behavior, backend, frontend, database, security, tests, UX states, compatibility and rollback. If the request is underspecified but a safe default exists, choose it and document the assumption.

## 3. Implement

Implement across every affected layer:

- UI: loading, empty, success, error, permission-denied, submitting states.
- API: DTO validation, status codes, Problem Details, authorization.
- Service/domain: invariants, transactions, concurrency, idempotency.
- Persistence: constraints, indexes, migration and rollback.
- Operations: logs/metrics without private content.
- Tests: happy path plus at least one negative/security path.
- Docs/changelog when behavior or contracts change.

Do not implement only the happy path. Preserve existing features and contracts unless the request intentionally changes them.

## 4. Independent specialist review

Delegate to independent reviewers using the runtime's subagent mechanism — Antigravity: `invoke_subagent` with `TypeName`; OpenCode: the `subagent` tool with `agent` set to the specialist ID. Run independent reviewers in parallel. Give each the diff/scope, the intended behavior and the evidence you already have.

Routing:

| Surface | Reviewers |
| --- | --- |
| Auth/session/authorization/sharing | security-auditor, code-quality-reviewer, test-validator, api-contract-reviewer, abuse-prevention-reviewer |
| New public endpoint | security-auditor, api-contract-reviewer, test-validator, abuse-prevention-reviewer |
| Migration/schema | database-reviewer, test-validator, release-gatekeeper, disaster-recovery-reviewer |
| Frontend | frontend-ux-reviewer, code-quality-reviewer, test-validator; add security-auditor for sensitive flows |
| Dependency/build | dependency-auditor, infrastructure-security-auditor, release-gatekeeper |
| Performance-sensitive | performance-engineer, database-reviewer, reliability-engineer, test-validator |
| Large refactor | architecture-reviewer, code-quality-reviewer, database-reviewer, test-validator |
| Logging/metrics/retries | reliability-engineer, privacy-reviewer |
| Docker/proxy/env/cloud | infrastructure-security-auditor, dependency-auditor, release-gatekeeper |

Do not let your own self-assessment replace the test-validator or the required security review.

## 5. Deterministic verification

```bash
node scripts/engineering/validate-agent-config.mjs
node scripts/engineering/verify.mjs --changed
```

Run narrow tests first, then the full affected layer:

```bash
cd backend && ./mvnw test        # Windows: mvnw.cmd test
cd frontend && npm run build && npm run test:run
```

Record commands, exit codes and failures. If a required environment is unavailable, record the limitation explicitly; never call it a pass.

## 6. Adversarial checks

Think like an attacker and an operator:

- Can an unauthenticated user reach protected data?
- Can User B read or mutate User A's object?
- Can malformed/oversized input bypass validation?
- Can concurrent/duplicate requests corrupt state or double-consume?
- Can retries create duplicates?
- Can the UI show success when the server failed?
- Can errors/logs expose secrets or private content?
- Can the migration lose data or lock a hot table?
- Can the change break sharing, download, expiry or auth?

Add targeted tests for the applicable cases. State which were not applicable.

## 7. Fix loop

For each actionable defect: reproduce, find root cause, fix minimally, add a regression test, rerun the targeted suite, rerun impacted security/quality checks. Do not repeat an identical failing command without changing the diagnosis.

## 8. Report

Use the completion report format: Implemented, Verification evidence, Specialist reviews, Remaining risks, Release status. Include a **Plan deviation** section if the implementation changed the approved approach. Never claim a gate passed without evidence.
