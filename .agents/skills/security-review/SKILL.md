---
name: security-review
description: "Runs a focused security review of ExtraBin changes or a named surface: authentication, authorization/IDOR, CSRF, XSS, SSRF, secrets, private-content leakage, rate limits and abuse. Use when the user asks for a security audit, hardening, threat review or verification of a security fix."
---

# Security Review

## 1. Define scope

Establish whether this is:

- a **diff review** of the current branch/working tree;
- a **surface review** (auth, sharing, raw/download, upload, comments, admin, infrastructure);
- a **fix verification** of a specific finding.

Record the commit/base, changed files and any excluded areas. Do not claim a full-repository audit if you reviewed only a diff.

## 2. Gather evidence

- Read `docs/security.md`, `docs/threat-model.md`, `docs/security-audit/` and the authorization matrix.
- Inspect the actual code paths, not just controllers: filters, services, repositories, serializers, error handlers, proxy/nginx config.
- Check tests for the negative cases; a missing test is a finding, not proof of safety.

## 3. Independent reviewers

Invoke in parallel using the runtime's subagent mechanism — Antigravity: `invoke_subagent` with `TypeName`; OpenCode: the `subagent` tool with `agent` set to the specialist ID:

- `security-auditor` — exploitable application flaws;
- `api-contract-reviewer` — auth requirements, status/error leakage, raw/download parity;
- `abuse-prevention-reviewer` — rate limits, enumeration, resource exhaustion;
- `privacy-reviewer` — logs, analytics, private content, retention;
- `infrastructure-security-auditor` — Docker, proxy, headers, actuator, secrets;
- `dependency-auditor` — vulnerable dependencies introduced or reachable.

Add `database-reviewer` for authorization queries/constraints and `reliability-engineer` for logging/metrics.

## 4. Triage

For each finding record: ID, severity, confidence (Confirmed/Potential), `file:line`, data flow, safe reproduction/reasoning, impact, minimal remediation, owner. Separate confirmed vulnerabilities from hardening ideas. Do not inflate severity or invent findings to look thorough.

## 5. Remediate and re-test

- Implement minimal fixes; do not weaken controls.
- Add a regression test for each confirmed vulnerability.
- Re-run the specific negative test and the related suite.
- Have `security-auditor` independently verify the fix. A code change is not verification.

## 6. Gate

- Any confirmed Critical/High finding blocks release until fixed or formally risk-accepted by the user with owner, compensating controls and expiry.
- Record accepted risk explicitly; an agent cannot self-approve.
- Report what was **not** tested (e.g. no browser, no production-like proxy, no load test).

## 7. Report

Return a security verdict, findings table, fixes and verification evidence, residual risks, and release status. Never claim "secure" or "zero vulnerabilities".
