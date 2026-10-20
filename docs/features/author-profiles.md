# Public Author Profiles & Developer Discovery

## 1. What this is

Every public paste in ExtraBin is attributed to the account that created it. Discovery cards show `by @username`, the author name opens a compact profile preview, and the full public profile lives at `/users/{username}`. The profile shows the public username, the month the account joined, real aggregates computed only from eligible public pastes, and a paginated list of that author's public work.

Attribution comes from the persisted `pastes.user_id` relationship. It is never inferred from the logged-in reader and never accepted from the create/edit request body. Pastes whose owner account was deleted keep working but become unattributed (`Author unavailable`); they are not guessed back to anyone.

The profile is deliberately small and honest. ExtraBin does not store a display name, bio, or avatar in the user model, so the profile does not invent them: it shows the username and a procedural initials avatar. There are no follow, message, or social features.

---

## 2. Live demo

1. Open **Explore** (`/discovery`).
2. Find a card and click **by @username** — the paste does **not** open; a profile preview appears anchored to the name.
3. Use **View full profile** to open `/users/{username}` and browse the author's public work.

The preview and the profile page are backed by the same public endpoints, so the numbers and recent work always agree with what the full profile shows.

---

## 3. When to use it

### Recommended use cases
- **Vetting a snippet**: See who published it and what else they share before copying code.
- **Finding related work**: Open an author you trust and browse their other eligible public pastes.
- **Sharing a portfolio**: Send someone `/users/{username}`; the URL is refresh-safe and paginates with `?page=N`.

### When not to use it
- **Private or restricted content**: Profiles never reveal private, unlisted, password-protected, encrypted, expired, burn-after-reading, or moderated-hidden pastes — not in the list, the preview, the counts, or the aggregates.
- **Deleted accounts**: A deleted author is indistinguishable from a username that never existed (identical `404`).
- **Anonymous pastes**: Pastes with no owner are not attributed to anyone and have no profile.
- **Contact or social actions**: There is no messaging, following, or profile editing surface for other users.

---

## 4. Step-by-step: how to open an author

### Open the preview
1. Click the author name on any discovery card (Explore or Most saved).
2. The preview shows the identity, three stat pills (public pastes, views, saves), up to three recent eligible public pastes, and **View full profile**.
3. Close it with **Escape**, the close button, or by clicking outside. Focus returns to the author trigger when you close from inside the dialog.

Keyboard users can focus the author button and press **Enter** or **Space**; focus moves into the dialog and returns to the trigger on close. On narrow screens the preview becomes a modal bottom sheet with a focus trap and a backdrop.

### Open the full profile
1. From the preview, select **View full profile**, or navigate directly to `/users/{username}`.
2. The header shows `@username`, the join month, and the same three aggregates.
3. **Public work** lists eligible public pastes newest first. Use **Previous** / **Next** to page; the current page is written to the URL (`?page=2`) so refresh, back/forward, and shared links stay on the same page.

### States you may see
- **No public work yet**: the account exists but has zero eligible public pastes.
- **Profile not found**: unknown username, malformed username handled as a bad request, or a deleted account (the latter two are intentionally indistinguishable where applicable).
- **Loading / retry**: a failed request shows a retry control instead of stale or fabricated data.

---

## 5. Learn more

### API endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/discovery/authors/{username}` | Public identity, joined date, aggregates, and up to three recent eligible public pastes |
| `GET` | `/api/v1/discovery/authors/{username}/pastes?page=0&size=18` | Server-side paginated eligible public work, newest first |

Both routes are anonymous (`permitAll`, under the existing public discovery namespace). `page` is clamped to `>= 0` and `size` to `1–50`.

### Public projection

```jsonc
{
  "username": "alice",
  "joinedAt": "2026-01-15T10:00:00Z",
  "publicPasteCount": 12,
  "totalViews": 345,
  "totalSaves": 7,
  "recentPastes": [ /* <= 3 PasteSummaryResponse items */ ]
}
```

The projection never includes an internal id, email, password hash, role, verification state, session version, or private setting. The only identity field is the public username.

### Eligibility and counts

Every author query applies `PasteQueries.ELIGIBLE_PUBLIC_PREDICATE`, the same single source of truth used by the feed, search, tag cloud, trending, and most-saved surfaces. A paste is eligible only when it is:

- `PUBLIC` visibility,
- not expired,
- not burn-after-reading,
- not password-protected,
- not encrypted,
- not moderated-hidden (`moderation_state = ACTIVE`).

The aggregate query and the listing query use the identical predicate, so `publicPasteCount` can never disagree with the rows a profile can show. `totalViews` and `totalSaves` are sums over those eligible rows only; a hidden paste's views and saves are excluded.

### Validation and failure modes

| Condition | Result |
|---|---|
| Username matches `^[A-Za-z0-9_-]{3,50}$` and exists | `200` |
| Malformed username | `400` Problem Details (`BAD_REQUEST`) |
| Unknown username | `404` Problem Details (`RESOURCE_NOT_FOUND`, detail `Author not found.`) |
| Deleted account | Same `404` and detail as unknown, so the two cannot be distinguished |
| More than 60 requests/minute from one IP | `429` with `Retry-After` |

Lookup is exact and case-sensitive, matching the database's case-sensitive unique constraint on `users.username`. `Alice` and `alice` are different keys if both exist.

### Privacy and threat model

- **Authoritative attribution**: `pastes.user_id` is set from the authenticated principal at creation. Request bodies cannot supply an author field (`fail-on-unknown-properties` rejects one), and editing only checks ownership — it never rewrites it.
- **No identity leakage**: the DTO is a closed record; raw response assertions in `AuthorProfileIntegrationTest` guard against accidentally adding email, ids, roles, or session fields.
- **No restricted-content oracle**: a profile reports only eligible public work. Counts, recent work, and listings all use the canonical predicate. A paste hidden from discovery cannot reappear through a profile.
- **No stale identity**: the public profile holds no client-side cache; both the preview and the page fetch on demand. The preview aborts in-flight requests and drops stale responses when the author changes.
- **Enumeration resistance**: both routes share a per-IP budget (`author-profile:ip:<ip>`), and deleted/unknown accounts return identical responses.
- **Ownerless history**: deleting an account sets `pastes.user_id = NULL` (`ON DELETE SET NULL`). Former pastes remain public but unattributed; they are never assigned to another profile.

### Data model

No schema migration is required. The feature uses the existing `users.username` (case-sensitive unique, 3–50 characters) and `pastes.user_id` ownership column, supported by the existing `idx_pastes_user_lookup (user_id, created_at DESC)` index.

### Related docs

- [Developer Discovery & Community](discovery.md) — the public feed, search, tags, and most-saved surfaces that carry the author attribution.
- [Tags & Personal Library Search](tags-and-library.md) — the private, owner-scoped organizational surface.
- [Security Model](../security.md) — authentication, authorization, and public-surface invariants.
