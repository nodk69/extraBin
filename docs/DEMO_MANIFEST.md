# Demo Manifest

Central inventory of all interactive documentation demos shipped with ExtraBin.

## Inventory

| # | Feature ID | Documentation Path | Demo Component | Format | Verification | Status |
|---|---|---|---|---|---|---|
| 1 | `encrypted` | `docs/features/encrypted-pastes.md` | `frontend/src/features/docs/demos/EncryptedPastesDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND3 legacy) | APPROVED |
| 2 | `api-suffixes` | `docs/features/paste-as-api.md` | `frontend/src/features/docs/demos/PasteAsApiDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND5 legacy) | APPROVED |
| 3 | `burn` | `docs/features/burn-after-read.md` | `frontend/src/features/docs/demos/BurnAfterReadDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND6 legacy) | APPROVED |
| 4 | `passcode` | `docs/features/password-protected.md` | `frontend/src/features/docs/demos/PasswordProtectedDemo.tsx` | Interactive simulator | Source-code inspection, Vitest | APPROVED |
| 5 | `multifile` | `docs/features/multi-file.md` | `frontend/src/features/docs/demos/MultiFileDemo.tsx` | Interactive simulator | Source-code inspection, Vitest | APPROVED |
| 6 | `folders` | `docs/features/folders.md` | `frontend/src/features/docs/demos/FoldersDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND1, ND6, ND11, ND12) | APPROVED |
| 7 | `diffs` | `docs/features/revision-history.md` | `frontend/src/features/docs/demos/RevisionHistoryDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND2, ND7, ND11, ND12) | APPROVED |
| 8 | `embed` | `docs/features/responsive-embeds.md` | `frontend/src/features/docs/demos/ResponsiveEmbedsDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND3, ND8, ND11, ND12) | APPROVED |
| 9 | `comments` | `docs/features/comments-and-replies.md` | `frontend/src/features/docs/demos/CommentsDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND4, ND9, ND11, ND12) | APPROVED |
| 10 | `qrcode` | `docs/features/qr-codes.md` | `frontend/src/features/docs/demos/QrCodeDemo.tsx` | Interactive simulator | Source-code inspection, Vitest (ND5, ND10, ND11, ND12) | APPROVED |

## Verification Legend

- **Source-code inspection**: Demo component, markdown guide, and DocsPage wiring verified by reading source files.
- **Vitest**: Automated test confirms component renders, disclaimer is present, and reset mechanism exists.
- **APPROVED**: All applicable automated checks pass. Manual visual review recommended before publication.

## Known Limitations

- All demos are **client-side simulators** that run entirely in the browser. They do not call the ExtraBin backend or persist data.
- No video recordings (MP4/WebM/GIF) are available. Screen recordings of the running application require manual production with appropriate tooling.
- Demos use synthetic data and do not reflect real paste content or user sessions.
- Runtime behavior verification (actual API responses, database state changes) was not performed — the application was not running during documentation creation.

## Maintenance

When any of the following change, the affected demos and guides must be reviewed:
- Navigation labels or route paths
- API request/response shapes
- Permission or visibility model changes
- UI component structure or styling
