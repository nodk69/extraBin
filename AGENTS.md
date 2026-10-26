# AGENTS.md — Development & Change-Control Protocol

This document establishes the operational discipline and quality standards for all automated and paired engineering work across the ExtraBin codebase.

---

## Runtime integration and approval gates

- **Canonical policy.** `.agents/rules/00-master-engineering-policy.md` is loaded as project instructions in both runtimes and is the operating contract. This file remains the repository-level protocol.
- **Runtime adapters.** The specialist definitions are authored once in `.agents/agents/` (Antigravity) and generated into `.opencode/agents/` (OpenCode) by `node scripts/engineering/sync-opencode-agents.mjs`. Do not edit generated adapters by hand.
- **Autonomy.** The phases below are mandatory, but the approval pauses apply to **consequential** decisions: irreversible data loss, production/destructive operations, push/merge/tag/deploy/publish, the authentication or authorization model, breaking public API changes, paid infrastructure, confirmed Critical/High risk acceptance, and missing credentials. Routine, reversible work proceeds autonomously through all phases and reports its plan with the evidence.
- **Evidence over assertion.** No phase is complete because a file exists or an agent approved it. Cite the command, exit code and result.

---

## The Six-Phase Engineering Protocol

Every non-trivial feature or refactoring must strictly proceed through these phases in order, pausing at designated approval gates:

1. **Phase 1: Feature Plan & Architectural Contract**:
   - Define exact HTTP routes, parameters, data transfer objects, security model, and failure modes.
   - Outline the full test matrix with test method names and expected statuses before touching code.
   - For consequential changes, await explicit user review and approval before proceeding; for routine work, proceed and include the plan in the final report.

2. **Phase 2: Failing Tests First (Red Phase)**:
   - Write the complete test suite matching the approved Phase 1 plan.
   - Execute the tests against current code to confirm clean, expected failures (and zero compilation or fixture setup errors).
   - Report the red-phase execution summary in the final report; pause only when the plan requires a consequential decision.

3. **Phase 3: Implementation & Green Phase**:
   - Implement the minimum production code required to satisfy the contract.
   - Run the feature test suite until 100% of the new tests pass.

4. **Phase 4: Full Regression Sweep**:
   - Execute all existing backend and frontend test suites (`mvn test`, `npm test -- --run`).
   - Confirm zero regressions across the broader system.

5. **Phase 5: Production Readiness**:
   - Verify rate limiting, authentication/authorization invariants, zero secret leakage, and observability metrics.

6. **Phase 6: Documentation & ADRs**:
   - Document architectural decisions in `DECISIONS.md`.
   - Update `CHANGELOG.md` under `[Unreleased]`.
   - Update API contracts, Swagger annotations, or security documentation as applicable.

---

## Production-Safety Rules

1. **No Production Code Modifications to Pass**: Do not alter production code or business logic merely to satisfy a misaligned test assertion. If a test fails unexpectedly, stop, report the discrepancy, propose the fix, and await approval.
2. **No Test Disabling**: Never use `@Disabled`, `@Ignore`, or commented-out test assertions to achieve a passing suite.
3. **Plan Deviations**: When an implementation round changes the approach specified in an approved Phase 1 plan (a route, a schema, a contract, a test), the report MUST include a 'Plan deviation' section that names the deviation, states the reason, and lists the tests that were updated to match. A deviation without this section is an incomplete report, not a shipped feature.
4. **Data Minimization & Privacy**: Never leak user identifiers, password hashes, or internal database metadata through public or raw content APIs.
5. **Indistinguishable Security Failures**: Expired pastes, non-existent pastes, and consumed view-once pastes must return identical 404 Problem Details responses to prevent oracle leaks.
6. **Standardized Documentation Layout**: Documentation pages follow a five-section layout: what/when/how/threat-model/learn-more. A page that does not follow it is an exception that needs a one-line reason in the file header.
