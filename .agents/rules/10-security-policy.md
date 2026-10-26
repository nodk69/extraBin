---
trigger: always_on
description: "Security invariants, severity handling and risk-acceptance rules for the ExtraBin paste platform."
---

# Security Policy

This rule is binding for every change. It summarises the invariants in `docs/security.md`, `docs/threat-model.md` and `docs/security-audit/`; those documents remain authoritative for detail.

## 1. Security invariants

1. **Deny by default.** Every endpoint and object read/write must have an explicit authorization decision. Client-side hiding is never authorization.
2. **Object-level authorization parity.** `GET /p/{id}`, raw content, download, embed, preview, share, QR, revision, comment and typed-format (`.json`, `.yaml`, `.md`, `.txt`, `.csv`, `.xml`) paths must enforce the same ownership, visibility, password, expiration and burn-after-reading checks.
3. **Indistinguishable failures.** Expired, non-existent and already-consumed pastes return the same `404` Problem Details response. Do not leak existence through status codes, timing, headers or error text.
4. **CSRF.** Cookie-authenticated mutating requests require CSRF protection. Do not add a mutating endpoint that bypasses it. Tokens must not appear in URLs or logs.
5. **Output safety.** Paste content is untrusted. Render it as text or through a vetted highlighter; never inject it as HTML. Preserve `X-Content-Type-Options: nosniff`, a restrictive CSP and correct `Content-Type`.
6. **Secrets.** Never read, print or commit `.env` values, cookies, private keys or tokens. `VITE_*` variables are public build-time values; never place a secret in one.
7. **Private content.** Do not log, trace, cache, preview or report the body of private, password-protected, encrypted or burn-after-reading pastes. Log identifiers and outcomes, not content.
8. **Password-protected and E2EE pastes.** The server must never receive or store plaintext, encryption keys or passphrases. Do not add server-side decryption, recovery or key escrow.
9. **Rate limiting and abuse.** Enforce limits server-side for creation, authentication, password attempts, deletion attempts, search, comments, votes and expensive rendering. Trust forwarded client IPs only from configured proxies.
10. **File and path safety.** Validate filenames, sizes, counts and content types; prevent path traversal, decompression bombs and unbounded downloads.
11. **Error hygiene.** Problem Details must not contain stack traces, SQL, internal paths, secrets or paste content.
12. **Trusted headers.** Never trust a user-supplied `X-Forwarded-For`, `X-Real-IP`, `Host`, role or tenant header unless a trusted proxy strips and rewrites it.

## 2. Severity and blocking

| Severity | Examples | Gate effect |
| --- | --- | --- |
| Critical | Authentication bypass, cross-user private-content read, RCE, secret exposure, SQL injection with data access | **Block** release |
| High | IDOR on a protected object, stored XSS, CSRF on a state-changing action, rate-limit bypass enabling credential stuffing | **Block** release |
| Medium | Information disclosure without private content, weak default, missing defense-in-depth control | Fix before merge or record accepted risk |
| Low / Info | Hardening opportunity, theoretical issue with no practical path | Track; does not block |

A confirmed Critical or High finding blocks the applicable gate until it is fixed and independently re-tested, or formally risk-accepted.

## 3. Risk acceptance

An exception must record: finding ID, risk, justification, owner, compensating controls, expiration/review date and the approver. An agent cannot self-approve a Critical or High risk. Never mark an unresolved issue as fixed.

## 4. Verification rules

- Cite exact files and lines for every finding.
- Separate **Confirmed** (reproduced or directly evidenced) from **Potential** (needs runtime confirmation).
- Use safe, local tests. Never run destructive exploits against production or shared environments.
- After a fix, re-run the specific negative test and the related regression suite. A code change alone is not verification.
- Do not create test users, pastes or comments in production to prove a finding.

## 5. Secret handling

If a secret is discovered in the working tree or history:

1. Do not print the value in the report.
2. Stop and notify the user with the file, line and secret type only.
3. Recommend rotation and history cleanup.
4. Do not commit, push or "fix" it by deleting the file without confirmation.

## 6. Reference controls

- Spring Security configuration and matchers.
- `ProblemDetails` mapping and exception handlers.
- Rate limiter and proxy-trust configuration.
- Flyway migrations and database constraints.
- Nginx/CSP/security headers and Docker runtime configuration.
- `docs/security-audit/SECURITY_ENDPOINT_AUTHORIZATION_MATRIX.md` for the expected authorization matrix.
