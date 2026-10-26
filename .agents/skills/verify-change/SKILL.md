---
name: verify-change
description: "Runs ExtraBin's deterministic local checks for the current working tree and records verifiable evidence: agent-config validation, targeted/full backend tests, frontend build and Vitest, and optional secret/dependency checks. Use before claiming a change is complete or when the Stop hook asks for verification."
---

# Verify Change

## 1. Choose the scope

```bash
node scripts/engineering/verify.mjs config     # agent/rule/skill/hook configuration
node scripts/engineering/verify.mjs backend    # Maven test suite
node scripts/engineering/verify.mjs frontend   # tsc + vite build + Vitest
node scripts/engineering/verify.mjs changed    # config + affected layers
node scripts/engineering/verify.mjs release    # config + both layers + security/dependency checks
```

Use `changed` by default. Use `release` only when preparing a release, because it is slower and may surface known dependency debt.

## 2. Interpret results

- Exit code `0`: the executed checks passed and `.agents/state/verification.json` was written.
- Non-zero: at least one check failed. Read the first actionable failure; do not retry blindly.
- Missing tool / unavailable service: the script exits `2` and records that verification is incomplete. Do not call it a pass.

## 3. Manual checks

The script does not replace:

- browser interaction tests for UI changes;
- PostgreSQL/Testcontainers tests when Docker is required;
- targeted security/authorization tests;
- load tests for performance-sensitive changes;
- CodeQL/CI results for the exact commit.

Run the relevant test or record the limitation.

## 4. Record a limitation

If a required check genuinely cannot run:

```bash
node scripts/engineering/verify.mjs --record-limitation "Docker unavailable; PostgreSQL migration test not run"
```

This records the limitation, not a pass. It must appear in the completion report and release status.

## 5. Evidence to report

Include the command, working directory, exit code, test counts/failures, and the checks not run. For security-sensitive changes, include the negative tests and their results. For UI changes, state whether a real browser or only component tests were used.

## 6. Do not

- Disable/skip tests to get green.
- Lower thresholds or ignore failures.
- Run destructive commands against production.
- Claim full verification from a partial run.
