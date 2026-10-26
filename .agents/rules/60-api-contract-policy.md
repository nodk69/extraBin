---
trigger: glob
globs: "backend/src/main/java/**/api/**/*.java, backend/src/main/java/**/dto/**/*.java, backend/src/main/java/**/shared/**/*.java"
description: "API contract, validation, status-code, caching and compatibility rules for Spring REST controllers and DTOs."
---

# API Contract Policy

## 1. Contract shape

- Preserve existing routes and response shapes unless the change intentionally breaks them.
- Use explicit request/response DTOs; do not expose JPA entities.
- Validate all input with Jakarta Bean Validation and explicit size/range limits.
- Reject unknown or malformed content types explicitly.
- Use RFC 9457 Problem Details consistently for errors.

## 2. Status codes

| Case | Status |
| --- | --- |
| Created resource | `201` + `Location` |
| Successful read | `200` |
| Successful delete with no body | `204` |
| Validation failure | `400` |
| Missing/invalid CSRF | `403` |
| Unauthenticated when auth is required | `401` |
| Authenticated but not allowed / object hidden | `404` for private objects; `403` only where existence is safe to reveal |
| Conflict / optimistic lock | `409` |
| Payload too large | `413` |
| Rate limited | `429` + `Retry-After` where supported |
| Unexpected server error | `500` without internals |

Expired, nonexistent and consumed private objects must return the same `404` response.

## 3. Authorization

- Every endpoint states its access rule explicitly (public, owner, shared, password, authenticated).
- Object-level checks belong in the service/domain layer, not only in the controller.
- Raw, download, embed, preview and typed-format variants must call the same authorization decision as the canonical view.
- Mutation endpoints must not rely on the UI to hide controls.

## 4. Payload and pagination

- Enforce maximum paste size, file count, filename length and total request size.
- Paginate all list/search endpoints; cap page size; define a stable sort order.
- Do not return unbounded collections or full histories by default.
- Use cursor pagination where offset pagination would scan deeply.

## 5. Caching and content types

- Preserve ETag/`If-None-Match` behaviour and `304` responses for immutable content.
- Set correct `Content-Type`, `Content-Disposition` and `X-Content-Type-Options: nosniff`.
- Do not cache private, password-protected, encrypted or burn-after-reading content in shared caches.
- Verify CORS and security headers for new browser-facing endpoints.

## 6. Compatibility

- Identify breaking changes explicitly: removed fields, changed types, new required inputs, changed status codes, stricter validation.
- Update API docs, OpenAPI annotations and tests together.
- Provide a migration or versioning plan for intentional breaking changes.
- Keep error codes and machine-readable fields stable.

## 7. Verification

Test valid and invalid inputs, boundary sizes, unauthorized access, missing CSRF, not-found parity, pagination limits and content negotiation. Report exact requests and responses for security-sensitive contracts.
