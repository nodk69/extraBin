# Developer Discovery & Community

## 1. What this is

The Discovery page is ExtraBin's public browsing surface for snippets that their authors chose to share with the world (`PUBLIC` visibility). It offers an Explore feed with server-side full-text search, tag and language filters, time windows, and three sort orders; a public tag cloud computed from real paste counts; and a Most saved list ranked by the number of authenticated users who starred a snippet. Every number shown — view counts, "N saved" badges, tag counts — is read from the database at request time. The feed may be empty; when it is, the page says so rather than inventing activity.

---

## 2. Live demo

Open the **Explore** page in the ExtraBin web UI (nav → Explore, or `/discovery`). Choose a language from the **Language** selector, type a query and press **Search**, click a `#tag` chip, or switch to the **Most saved** tab. Signed-in users can star snippets with the **Save** button and see their already-saved snippets pre-marked; anonymous visitors see a single login prompt and no save controls.

*(The feature is fully server-backed; the live UI is the demo.)*

---

## 3. When to use it

### Recommended Use Cases
- **Browsing the public registry**: See what other developers have shared, newest first or by your preferred order.
- **Finding reusable code**: Search by a keyword in the title, the content, or a tag (`?q=spring` matches a paste titled "Spring Boot Config", its body, or a `spring` tag).
- **Curating**: Star snippets you want to find again; your Most saved ranking is the community's real save counts.
- **Tag navigation**: Use the tag cloud to jump into a topic with one click.

### When not to use it
- **Private, unlisted, or gated pastes never appear.** Unlisted, password-protected, encrypted, burn-after-reading, and expired pastes are excluded by the shared eligibility predicate, as are pastes hidden by moderation.
- **No trending claims.** Discovery ranks only by explicit, real signals (creation date, update date, genuine star counts). It does not present any popularity metric that is not directly computed from stored rows.

---

## 4. Step-by-step: how to browse, search, and save

### Browsing the feed
1. Go to **Explore** (`/discovery`).
2. Filter by language with the **Language** selector (All languages, JavaScript, Python, Java, …).
3. Choose a **time window** (last 24 hours / 7 days / 30 days / all time) and a **sort order** (Newest, Oldest, Recently updated). Sorting is stable — pastes created in the same instant keep a deterministic order across pages.
4. Use **Previous / Next** to page through results (up to 50 per page).

### Searching and filtering
1. Type a query in the search box and press **Search** (or Enter). The query is sent to the server — the page never fakes search by filtering the current page locally.
2. Click a tag in the cloud or on a card to filter by that tag; the active filters are shown in a bar above the results with a **Clear filters** button.
3. Search and tag filters compose: `?q=spring&tag=spring` returns pastes matching both.

### Saving snippets
1. Sign in, then press **Save** on any public snippet. One save per user per paste — pressing it again does not inflate the count (the backend is idempotent under a row lock).
2. The count on the card is refreshed from the server after every save/unsave; the UI never adjusts counts locally.
3. Browse the **Most saved** tab to see the community's saved snippets ranked by real star counts. A snippet with zero saves cannot appear.
4. When you open Discovery while signed in, each snippet's Save state is seeded from your real starred list, so an already-saved snippet shows **Saved** immediately. A failed lookup leaves snippets unsaved rather than guessing.

---

## 5. Learn more

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/discovery` | Public feed; accepts `q`, `tag`, `language`, `window` (`24h\|7d\|30d\|all`), `sort` (`newest\|oldest\|updated`), `page`, `size` |
| `GET` | `/api/v1/discovery/tags` | Public tag cloud: top 50 tags with distinct public-paste counts, ties broken by name |
| `GET` | `/api/v1/discovery/most-saved` | Public pastes with at least one save, ordered by save count, optional `language` filter |

All three endpoints are anonymous-accessible. Validation failures (query longer than 200 chars, tag longer than 50 chars, unknown window or sort) return 400 Problem Details; page size is clamped server-side to 1–50.

### Eligibility predicate (single source of truth)
Every discovery surface — feed, search, tag cloud, most-saved — shares one eligibility predicate: `visibility = 'PUBLIC'` AND not expired AND `moderation_state = 'ACTIVE'` AND not encrypted AND not burn-after-reading AND no password. Because all surfaces reuse the same JPQL fragment, no surface can accidentally expose a paste another surface correctly hides.

### Moderation policy (V16 migration)
- `pastes.moderation_state` (`ACTIVE` / `HIDDEN`) is applied at query time; hidden pastes drop out of every public listing immediately.
- A non-owner who opens a hidden paste by direct link (or via its embed) receives the same 404 Problem Details as for a non-existent or expired paste — no oracle distinguishes "hidden" from "gone".
- The owner still receives their paste with a `moderationHidden` flag so they can react, without the fact being exposed to anyone else.

### Privacy & Threat Model
- **No engagement fabrication**: Views, save counts, tag counts, and list contents are only ever read from the database. An empty feed is rendered as an empty feed. There is no seed data, no suggested-content filler, and no client-side adjustment of any metric (counts refresh from the server after each save/unsave).
- **Data minimization**: Public summaries expose at most the author's username for pastes that have an owner; anonymous pastes show no author. No emails, user ids, folder structure, tags on non-eligible pastes, or moderation details are ever sent to anonymous callers.
- **Search abuse control**: Search and tag-filter requests are rate-limited per client IP (30 requests per 60-second sliding window). The limit response is 429 Problem Details with a `Retry-After` header. Feed browsing without query parameters is not limited.
- **Enumeration resistance**: Expired, missing, hidden, and consumed view-once pastes are indistinguishable (identical 404 Problem Details) on direct view; discovery itself only ever lists eligible pastes, so it leaks nothing about other rows.
- **Injection safety**: All filters are bound JPQL parameters. LIKE wildcards (`%`, `_`) in user queries are escaped, and the escape character itself is escaped first, so user input cannot alter query shape.

### Performance (verified with H2 `EXPLAIN ANALYZE`)
- Feed, search, and tag-filter queries are served by `idx_pastes_visibility_lang_created` (visibility, language, created_at DESC) plus the recent-discovery index; tag joins go through the `paste_tags` primary key; most-saved needs no join at all. Plan evidence was captured during Phase 5 verification; dev/test run in-memory H2, so latency on real PostgreSQL at scale remains the honest caveat noted in the ADR.

### Honest-metrics commitment
Increment 1 ships no trending algorithm. A future increment may add time-bucketed view-based trending, and will do so only with an explicit, documented policy — never by implying popularity from thin air.
