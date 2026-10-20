# Tags & Personal Library Search

## 1. What this is

Tags let authenticated ExtraBin users label their own pastes with short, lowercase keywords (up to 10 per paste). Combined with server-side search, user-selectable sorting, and a recent-activity ledger, the Account dashboard becomes a personal snippet library: you can filter by tag, search by title or content, sort by recency or name, and jump back to recently viewed or recently edited pastes.

---

## 2. Live demo

Open the **Account** page and use the toolbar: pick a sort order from the dropdown, type in the search box (debounced server-side query), and select a tag to filter. On any paste you own, use the tag strip under the header to add or remove tags inline.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Snippet retrieval**: Find that one config file among hundreds by a `nginx` or `k8s` tag instead of remembering the title.
- **Content search**: Locate a paste by a code fragment inside its content, not just its title.
- **Session resumption**: Reopen what you were reading (Recently Viewed) or continue editing where you left off (Recently Edited).

### When not to use it
- **Anonymous pastes**: Tags and the library ledger require authentication; anonymous pastes cannot be tagged.
- **Other people's pastes**: Tags are private organizational tools scoped to the paste owner. You cannot tag a paste you do not own, and other users' tags are never exposed to you.
- **Multi-file content**: Search covers paste title and primary paste content. Text inside additional workspace files is not searched (documented Phase A limitation).

---

## 4. Step-by-step: how to create, how to open

### How to Tag a Paste
1. Open one of your own pastes (`/p/{id}`) while signed in.
2. In the tag strip below the header, type a tag name (1–50 characters) and click **Add**.
3. The name is normalized: trimmed and lowercased. Adding an already-attached tag returns a conflict; adding an 11th tag to a paste is rejected.
4. Click the **×** on a chip to remove that tag from the paste.

### How to Filter Your Library
1. Go to the **Account** page (`/account`).
2. Use the **tag dropdown** (fed by `GET /api/v1/account/tags`) to show only pastes carrying that tag.
3. Type in the search box — the query is debounced (~350 ms) and sent server-side against title and content (case-insensitive).
4. Pick a sort order: **Recently Updated**, **Recently Created**, or **Alphabetical**. Defaults are most-recent-first, alphabetical sorts ascending.

### How to Use Recent Activity
1. On the **Account** page, switch to the **Recently Viewed** tab to see the last 50 pastes you opened (most recent first).
2. Switch to **Recently Edited** to see the last 50 pastes you changed.
3. Viewing a paste while signed in records the view (upsert per paste — revisiting bumps it to the top); editing updates the edited ledger.

---

## 5. Learn more

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/v1/pastes/{pasteId}/tags` | Add a tag to your paste (201, owner only) |
| `GET` | `/api/v1/pastes/{pasteId}/tags` | List tags on your paste (owner only) |
| `DELETE` | `/api/v1/pastes/{pasteId}/tags/{tagId}` | Remove a tag from your paste (204, owner only) |
| `GET` | `/api/v1/account/tags` | List all your distinct tags |
| `GET` | `/api/v1/account/pastes?search=&tag=&sort=&direction=` | Library query with search, tag filter, and sorting |
| `GET` | `/api/v1/account/recently-viewed` | Last 50 viewed pastes, most recent first |
| `GET` | `/api/v1/account/recently-edited` | Last 50 edited pastes, most recent change first |

All endpoints require authentication. Tag mutations enforce paste ownership with 403 for non-owners. Invalid sort fields or directions are rejected with 400 (whitelist: `createdAt`, `updatedAt`, `title`).

### Validation Rules
- Tag names: trimmed, lowercased (`Locale.ROOT`), 1–50 characters, max 10 distinct tags per paste, duplicate attachment per paste rejected with 409.
- Library queries are parameterized JPQL; search matches `LOWER(title) LIKE %q%` OR `LOWER(content) LIKE %q%`.
- Pagination size is clamped server-side to 1–50.

### Privacy & Threat Model
- **Owner scoping**: Every library query filters on the authenticated user's id; another user's pastes, tags, view history, or edits can never appear in your results.
- **No cross-user leakage**: Tags on private pastes are visible only to the owner through the owner-only endpoints; the public paste view response never includes tags. All three tag routes require authentication (`@PreAuthorize`), so anonymous callers get a uniform 403 regardless of paste existence.
- **Cascade cleanup**: `paste_tags` and `paste_view_history` rows are removed by database-level `ON DELETE CASCADE` when a paste or user is deleted, so orphans cannot resurrect past views in someone's ledger.
- **No search oracle**: Searching your own library only returns pastes you own; expiry filtering hides consumed pastes exactly like the rest of the account surfaces.

### Data Model (V15 migration)
- `tags(id, user_id, name, created_at)` with unique `(user_id, name)`.
- `paste_tags(paste_id, tag_id)` join table, composite PK, both FKs `ON DELETE CASCADE`.
- `paste_view_history(id, user_id, paste_id, viewed_at)` with unique `(user_id, paste_id)` and `(user_id, viewed_at DESC)` index.
