---
trigger: model_decision
description: "Use when preparing a merge, tag, production deployment, or when deciding whether release gates and rollback requirements are satisfied."
---

# Release Policy

## 1. Release is a privileged action

Merging, tagging, pushing a release branch and deploying to production require explicit user authorization. An agent may prepare and verify a release, but must not perform the irreversible step on its own.

A verbal "the tests passed" is not a gate. The gate is the actual CI run for the exact commit or artifact being released.

## 2. Mandatory gates

| Gate | Requirement | Evidence |
| --- | --- | --- |
| G1 Configuration | Agent, rule, skill and hook configuration validates | `node scripts/engineering/validate-agent-config.mjs` |
| G2 Build | Backend compiles; frontend typechecks and production build succeeds | Maven and `npm run build` output |
| G3 Tests | Backend and frontend suites pass; security and migration tests pass | Test output with exit code 0 |
| G4 Security | No unresolved Critical/High findings; secret scan clean | Auditor verdict + scan result |
| G5 Database | Migrations validated on PostgreSQL; rollback/forward-recovery documented | Database reviewer evidence |
| G6 Dependencies | No newly introduced High/Critical vulnerability; known debt recorded | Dependency review / audit evidence |
| G7 Operations | Health checks, logs, metrics, timeouts and alerts cover the change | Reliability review |
| G8 Recovery | Backup/restore and rollback path exist for risky changes | DR review |
| G9 Artifact identity | The released commit/tag/image digest is the one that passed CI | CI run URL + commit SHA |

Performance evidence (G10) is required when the change affects a hot path, payload size, query shape, caching or rendering cost.

## 3. Release status

Use exactly one:

- **READY FOR RELEASE** — all applicable gates passed; no unresolved blocking finding; authorization to deploy is the only remaining step.
- **NOT READY** — one or more mandatory gates failed or a blocking finding remains.
- **VERIFICATION INCOMPLETE** — a required check could not be run or its result is indeterminate.

Do not use "ready" to mean "the code compiles".

## 4. Deployment checks

Before deployment, confirm:

- the exact commit/tag/image digest;
- required environment variables and secrets are configured outside the repository;
- production profile is active (no debug, no permissive CORS, no exposed actuator beyond the intended surface);
- database migrations run in the correct order and are backward-compatible during rollout;
- health/readiness endpoints and a post-deploy smoke check exist;
- rollback is possible and has been rehearsed for destructive changes;
- the person authorizing the deployment understands the remaining risks.

## 5. Rollback and forward recovery

Every risky change needs one of:

- a tested application rollback (previous image/tag);
- a forward-fix migration plan with compatibility guarantees;
- a restore procedure with a measured RPO/RTO.

Never drop or rewrite production data without a verified backup and explicit approval.

## 6. Post-release

After deployment:

- verify health, error rate, latency and key user journeys;
- watch logs and alerts for a defined window;
- record the deployed digest and outcome;
- if a regression appears, stop, roll back or forward-fix, and report honestly.

## 7. Prohibited

- Bypassing a failed required check.
- Deploying an artifact that did not pass CI for that exact revision.
- Marking a critical issue as fixed without independent verification.
- Running destructive production commands without authorization.
- Claiming a deployment succeeded without a health check and smoke result.
