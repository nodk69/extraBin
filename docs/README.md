# ExtraBin Platform Documentation

ExtraBin provides developer-first text, code, and configuration sharing with zero-knowledge cryptographic privacy guarantees and programmatic automation surfaces. This documentation hub serves as the central directory for all platform architectural guides, live interactive simulations, and technical specifications. Choose a dedicated feature guide below to inspect mechanics or test interactive workflows.

---

## Dedicated Feature Guides

- **[Zero-Knowledge Encrypted Pastes](features/encrypted-pastes.md)**: Client-side AES-256-GCM browser encryption where the server acts purely as a blind storage medium and never sees plaintext content or decryption keys.
- **[Paste as API](features/paste-as-api.md)**: Direct programmatic ingestion of unencrypted pastes via typed format suffixes (`.json`, `.yaml`, `.md`, `.txt`, `.csv`, `.xml`) with deterministic SHA-256 ETags and HTTP caching.
- **[Burn After Reading](features/burn-after-read.md)**: Atomic single-view self-destruction that automatically purges content from backend database storage immediately after initial retrieval.
- **[Password Protection](features/password-protected.md)**: Server-side passcode verification using standard BCrypt hash boundaries for restricted team access.
- **[Multi-File Workspaces](features/multi-file.md)**: Multi-tab project snippets allowing related code files, manifests, and documentation to be shared within a single unified workspace.
- **[Folders & Organization](features/folders.md)**: Organize personal and team pastes into custom folders with rename, delete, and move operations.
- **[Revision History & Diffs](features/revision-history.md)**: Inspect version histories with line-by-line unified and side-by-side diffs highlighting additions and removals.
- **[Responsive Embeds](features/responsive-embeds.md)**: Generate sandboxed iframe widgets to embed live, syntax-highlighted snippets in external documentation or blogs.
- **[Interactive Comments & Replies](features/comments-and-replies.md)**: Threaded discussions with upvote/downvote reactions, anonymous deletion capabilities, and nested reply threads.
- **[Mobile QR Codes](features/qr-codes.md)**: Generate scannable QR codes for paste URLs enabling quick multi-device handoff.
- **[Tags & Personal Library Search](features/tags-and-library.md)**: Tag your own pastes with normalized keywords, search title or content server-side, sort the library, and revisit recently viewed or edited pastes.
- **[Developer Discovery & Community](features/discovery.md)**: Browse, search, and filter the public snippet registry with real tag and save counts and an honest most-saved ranking.
- **[Public Author Profiles](features/author-profiles.md)**: Follow public paste attribution to a privacy-minimal author profile with real aggregates and paginated eligible public work.

---

## Demo Manifest

All interactive demos are cataloged in [DEMO_MANIFEST.md](DEMO_MANIFEST.md) with feature identifiers, component paths, and verification status.
