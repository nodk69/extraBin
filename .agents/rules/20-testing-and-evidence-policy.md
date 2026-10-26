---
trigger: model_decision
description: "Use when writing, changing or validating tests, or when deciding what evidence is required before claiming a change works."
---

# Testing and Evidence Policy

## 1. Evidence hierarchy

Strongest to weakest:

1. Actual command output with exit code (tests, build, typecheck, scan, browser run, load test).
2. A targeted test that fails before the fix and passes after it.
3. A reviewer's code-level reasoning with exact locations.
4. Existence of a test file or a claim that it "should pass".

Never present level 4 as level 1.

## 2. Test-first for behavior changes

For a bug or a new behavior:

1. Write or identify a test that captures the expected behavior.
2. Run it against the current code and confirm it fails for the expected reason.
3. Implement the smallest fix/feature.
4. Re-run the targeted test until it passes.
5. Run the affected regression suite.

If a red phase is impractical (for example, a pure documentation change), say so in the report.

## 3. Mandatory suites

Run the narrowest relevant suite first, then the full affected layer:

```bash
# Backend
cd backend
./mvnw test
./mvnw test -Dtest=*IntegrationTest,*SecurityTest

# Frontend
cd frontend
npm run build
npm run test:run
```

Use `backend\mvnw.cmd` on Windows. A PostgreSQL-backed test must use a real PostgreSQL instance or Testcontainers when the behavior depends on PostgreSQL semantics; H2 is not sufficient evidence for migrations, locking, `ON CONFLICT`, JSONB or index behavior.

## 4. Required negative checks

For the affected surface, consider and test:

- unauthenticated access to protected content;
- User B accessing User A's private object (IDOR/BOLA);
- expired, deleted and consumed resources returning indistinguishable responses;
- malformed, oversized, empty and boundary inputs;
- duplicate submissions, retries and concurrent updates;
- missing/invalid CSRF tokens;
- rate-limit thresholds and bypass attempts;
- unauthorized raw, download, embed and typed-format views;
- frontend error states when the server fails, times out or returns Problem Details.

Not every item applies to every change. State which were tested and which were not applicable.

## 5. Prohibited practices

- `@Disabled`, `@Ignore`, `.skip`, `xit`, commented-out assertions, or deleting a failing test to get green.
- Lowering a coverage threshold, security rule or scan severity to pass.
- Replacing a real assertion with a snapshot that accepts any output.
- Mocking the database or security layer when the risk is in their integration.
- Retrying a flaky test until it passes without diagnosing the flake.
- Claiming a test passed without recording the command and result.

## 6. Environment limitations

If a required dependency is missing (Docker, PostgreSQL, browser, credential, tool), report:

- the exact command attempted;
- the exact failure;
- what remains unverified;
- the closest safe check that was completed.

Do not silently downgrade to a weaker test and call it equivalent.

## 7. Verification stamp

`node scripts/engineering/verify.mjs --changed` runs the checks relevant to the working tree and writes `.agents/state/verification.json` on success. If verification is genuinely impossible, record the limitation explicitly:

```bash
node scripts/engineering/verify.mjs --record-limitation "Docker unavailable; PostgreSQL migration test not run"
```

The limitation is included in the completion report and does not count as a pass.

## 8. Coverage and quality

Coverage is a diagnostic, not a target. Prioritise:

- security boundaries and authorization branches;
- state transitions (create, edit, expire, delete, burn, revoke);
- concurrency and idempotency;
- failure paths and rollback behavior;
- user-visible empty, loading and error states.

A high-coverage suite that asserts nothing meaningful is not evidence.
