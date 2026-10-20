# ExtraBin Feature Guides

ExtraBin provides developer-first text and code sharing with cryptographic privacy guarantees and machine-readable automation surfaces.

---

## Feature Documentation

- **[Zero-Knowledge Encrypted Pastes](encrypted-pastes.md)**
  Client-side AES-256-GCM encryption where the server never sees plaintext content or decryption keys.
- **[Paste as API: Typed Endpoints & Caching](paste-as-api.md)**
  Typed suffix routes (`.json`, `.yaml`, `.md`, `.txt`, `.csv`, `.xml`), deterministic SHA-256 ETags, and visibility-aware HTTP caching.
- **[Burn After Reading](burn-after-read.md)**
  Atomic single-view self-destruction that automatically purges content from database storage after retrieval.
- **[Password Protection](password-protected.md)**
  Server-side passcode verification using BCrypt hashing for restricted team access.
- **[Multi-File Workspaces](multi-file.md)**
  Multi-tab project snippets allowing related code files, manifests, and documentation to be shared within a single workspace.
- **[Folders & Organization](folders.md)**
  Organize pastes into custom folders with create, rename, delete, and move operations. Deletion orphans pastes to Unfiled.
- **[Revision History & Diffs](revision-history.md)**
  Inspect version histories with line-by-line unified and side-by-side diffs. Optimistic concurrency control via version field.
- **[Responsive Embeds](responsive-embeds.md)**
  Generate sandboxed iframe widgets for embedding public pastes in external documentation, blogs, or wikis.
- **[Interactive Comments & Replies](comments-and-replies.md)**
  Threaded discussions with upvote/downvote reactions, anonymous deletion capabilities, and nested reply threads up to depth 2.
- **[Mobile QR Codes](qr-codes.md)**
  Client-side QR code generation for paste URLs with PNG download and URL copy functionality.
- **[Tags & Personal Library Search](tags-and-library.md)**
  Tag pastes with normalized keywords, search by title or content, sort the library, and revisit recently viewed or edited pastes.
- **[Developer Discovery & Community](discovery.md)**
  Browse and search the public snippet registry with tag/language filters, time windows, sorting, and a real most-saved ranking.
- **[Public Author Profiles](author-profiles.md)**
  Follow public paste attribution to a privacy-minimal profile with real aggregates and paginated eligible public work.

---

## Feature Decision Guide

1. **Standard Unencrypted Pastes**: Choose this when sharing snippets for interactive reading in a web browser, team code reviews, or when you intend to fetch raw configurations via the typed API.
2. **Zero-Knowledge Encrypted Pastes**: Choose this whenever the payload contains credentials, tokens, or confidential data that must never be visible to server administrators or database backups.
3. **Typed API Suffixes**: Use typed endpoints (`.json`, `.yaml`, etc.) whenever consuming public, unlisted, or passcode-protected pastes from automation tools, curl scripts, or build pipelines.
