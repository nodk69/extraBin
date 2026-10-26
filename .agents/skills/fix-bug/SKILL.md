---
name: fix-bug
description: "Diagnoses and fixes an ExtraBin defect or regression with a reproducing test, root-cause analysis, minimal fix, regression coverage and full verification. Use when the user reports a bug, failing test, incorrect behavior or production regression."
---

# Fix Bug

## 1. Establish the failure

1. Collect the exact symptom, environment, request/response or stack trace.
2. Check `git status` and recent changes that could have introduced it.
3. Reproduce with the narrowest command or request.
4. Write a failing test that captures the defect **before** changing production code. Confirm it fails for the expected reason, not a fixture/compile error.

If the bug cannot be reproduced, say so and gather more evidence; do not guess-fix.

## 2. Find the root cause

Trace the full path (UI → API → service → repository → database → external service). Distinguish:

- the root cause;
- contributing conditions;
- symptoms that a superficial fix would hide.

Check concurrency, null/boundary handling, transaction boundaries, authorization, caching, stale state and error mapping. Read the existing tests around the area.

## 3. Fix minimally

- Change the smallest correct surface.
- Preserve existing behavior and contracts outside the defect.
- Do not silence an exception, catch-and-ignore, add a sleep, retry blindly, loosen validation or disable a test.
- If the correct fix requires a broader change, explain why and keep it scoped.

## 4. Add regression coverage

The regression test must fail on the old code and pass on the fix. Cover the boundary/negative case that exposed the bug. For security defects, add the authorization/negative test explicitly.

## 5. Independent review

Invoke the reviewers that match the defect:

- logic/concurrency: code-quality-reviewer;
- auth/data exposure: security-auditor;
- persistence: database-reviewer;
- API shape: api-contract-reviewer;
- UI: frontend-ux-reviewer;
- always: test-validator.

Use the runtime's subagent mechanism — Antigravity `invoke_subagent` with `TypeName`; OpenCode `subagent` with `agent` — in parallel where independent.

## 6. Verify

```bash
node scripts/engineering/verify.mjs --changed
```

Then run the full affected layer and any security/regression suite the fix touches. Compare against the baseline. Record exact commands and exit codes.

## 7. Report

Include: symptom, reproduction, root cause, fix, regression test, verification evidence, remaining risks, release status. If the fix changes an approved plan, add a **Plan deviation** section. Never claim the bug is fixed without the reproducing test passing.
