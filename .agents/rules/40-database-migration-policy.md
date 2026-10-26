---
trigger: glob
globs: "backend/src/main/resources/db/migration/*.sql, backend/src/main/resources/db/migration/**/*.sql"
description: "Database migration and schema-change rules for Flyway and PostgreSQL."
---

# Database Migration Policy

## 1. Migration basics

- Flyway files live in `backend/src/main/resources/db/migration`.
- Naming: `V<number>__<lower_snake_case_description>.sql`. Versions are unique and increasing.
- A migration that has reached a shared branch or production is **immutable**. Fix it with a new migration, not by editing history.
- Never renumber or reuse a version.
- Keep each migration single-purpose and reviewable.

## 2. Compatibility

Use expand-and-contract for changes that cannot be applied atomically with the application rollout:

1. Expand: add nullable columns, new tables, new indexes; deploy compatible code.
2. Migrate/backfill in bounded batches.
3. Switch reads/writes.
4. Contract: remove old columns/constraints in a later release.

Do not drop or rename a column in the same release that stops using it.

## 3. PostgreSQL specifics

- Create indexes on existing large tables with `CREATE INDEX CONCURRENTLY` in a migration that is not wrapped in a transaction. Confirm Flyway transaction behavior.
- Add `NOT NULL` only after a backfill; use a validated check/constraint strategy for large tables.
- Add foreign keys with awareness of lock duration; validate large constraints separately.
- Set a lock timeout for DDL on hot tables where appropriate.
- Avoid unbounded `UPDATE` backfills in one transaction.
- Use `EXPLAIN (ANALYZE, BUFFERS)` for new hot queries; verify the index is actually used.
- Watch for N+1 queries and unbounded result sets introduced by the change.

## 4. Data safety

- Destructive operations (`DROP`, `TRUNCATE`, type narrowing, data deletion) require a verified backup and explicit approval.
- A migration must not silently discard or corrupt existing data.
- Test the migration against a realistic PostgreSQL dataset, not only an empty schema.
- Document rollback or forward-recovery. A down-migration is not automatically safe.
- Never test destructive migrations against production.

## 5. Ordering and concurrency

- Check for version collisions before adding a migration.
- Assume another deployment may run concurrently; avoid long locks and non-idempotent data changes.
- Application code must tolerate the schema being one version behind during a rolling deploy.

## 6. Verification

- Run the migration on a clean database and on a copy with existing data.
- Run the PostgreSQL-backed integration tests.
- Inspect the resulting schema, constraints and indexes.
- For a new query path, capture the plan and latency.
- Record the exact commands and results in the completion report.

## 7. Review output

The database reviewer reports: migration files, risk class, lock/backfill analysis, rollback/recovery plan, test evidence, and a `PASS` / `CONDITIONAL` / `BLOCK` verdict.
