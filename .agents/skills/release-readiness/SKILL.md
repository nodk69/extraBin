---
name: release-readiness
description: "Prepares and verifies an ExtraBin release: required CI gates, exact commit/artifact identity, test and security evidence, migration safety, configuration, observability, rollback and post-deploy checks. Use before merge, tag, publish or production deployment. Does not deploy without explicit authorization."
---

# Release Readiness

## 1. Preconditions

- Confirm the exact commit/tag and the release scope.
- Confirm the user has authorized preparation; deployment/merge/push still requires explicit authorization.
- Check `git status` for uncommitted or unrelated changes.
- Identify the CI run for the exact revision.

## 2. Collect gate evidence

Run or inspect:

```bash
node scripts/engineering/validate-agent-config.mjs
node scripts/engineering/verify.mjs --release
```

`--release` includes configuration, backend tests, frontend build/tests, secret scanning where available, and dependency audit where configured. Run the individual commands if a tool is missing, and record the gap.

## 3. Gate table

| Gate | Evidence | Status |
| --- | --- | --- |
| G1 Configuration | validation script output | |
| G2 Build | backend compile + frontend production build | |
| G3 Tests | full suites + security/migration tests | |
| G4 Security | auditor verdict + secret scan | |
| G5 Database | PostgreSQL migration evidence + recovery | |
| G6 Dependencies | review/audit result | |
| G7 Operations | health/logs/metrics/timeouts/alerts | |
| G8 Recovery | backup/restore or rollback evidence | |
| G9 Identity | commit SHA/tag/image digest matches CI | |
| G10 Performance | required only for hot-path changes | |

Use `PASS`, `FAIL` or `NOT RUN`. A missing mandatory check is `NOT RUN`, not `PASS`.

## 4. Specialist sign-off

Invoke `release-gatekeeper` for the gate audit. Add `security-auditor` for security-sensitive changes, `database-reviewer`/`disaster-recovery-reviewer` for migrations, and `reliability-engineer` for operational changes. Do not accept a verbal approval in place of CI output.

## 5. Deployment package

Document:

- image/tag/commit to deploy;
- required environment variables and secrets (names only, never values);
- migration order and compatibility during rollout;
- health/readiness endpoints and smoke checks;
- rollback command/procedure and who can execute it;
- monitoring window and alert thresholds.

## 6. Post-deploy (only if authorized)

Verify health, error rate, latency and the critical user journeys (create, view, raw/download, protected paste, expired content). Record the deployed digest and outcome. If a regression appears, roll back or forward-fix and report honestly.

## 7. Report

Use a gate table, the exact artifact identity, unresolved findings, manual approvals still needed, and exactly one status: `READY FOR RELEASE`, `NOT READY` or `VERIFICATION INCOMPLETE`.
