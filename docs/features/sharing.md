# Sharing a Paste

## 1. What this is

Every paste has exactly one **canonical share URL** — the only URL that is safe to hand to somebody else. The paste view exposes it through a primary **Copy link** action in the action bar, and through a **Share** menu that also offers the raw file, the download, and a ready-to-paste Markdown link.

The canonical share URL is built from four parts and nothing else:

```
<base>/p/<pasteId>[/file/<fileId>][?token=<shareToken>][#key=<e2eKey>]
```

- **base** — `VITE_PUBLIC_BASE_URL` when the deployment configures one, otherwise the origin the browser is currently on. Trailing slashes are stripped, so a configured `https://bin.example/` never produces `https://bin.example//p/...`.
- **`/p/<pasteId>`** — the public id of the paste.
- **`/file/<fileId>`** — present only when a specific file of a multi-file paste is on screen.
- **`?token=<shareToken>`** — present **only for unlisted pastes**. A public or private paste never carries a token, even when a stale `?token=` is still in the address bar.
- **`#key=<e2eKey>`** — the end-to-end decryption key, kept in the fragment because fragments are never sent to a server.

Passwords, unlock tokens, deletion capabilities and internal database ids are never part of a share URL.

---

## 2. When to use it

### Recommended use cases
- **Handing a snippet to a colleague**: *Copy link* puts the canonical URL on the clipboard in one click, from any paste view.
- **Linking a single file of a workspace**: select the file tab first — the copied URL points at that file, and the recipient lands on the exact file.
- **Writing docs or a changelog**: *Share → Markdown link* copies a `[title](url)` snippet that is ready to paste into Markdown.
- **Sharing a raw payload**: *Share → Raw <filename>* opens the unrendered bytes, and *Share → Download <filename>* saves them.
- **Sharing a zero-knowledge paste**: the `#key=` fragment travels with the URL, so the recipient can decrypt it in the browser. The key never reaches the server.

### When not to use it
- **Private pastes**: a private paste has no public link at all. The Share menu says so instead of offering a link that would 404 for anybody else.
- **Burn-after-reading pastes**: the URL is single-use. Copy it before the first read; afterwards the server copy is gone.
- **Sharing a password**: the passcode is never part of a URL. Send it through a different channel.

---

## 3. How to share

### Copy the link
1. Open the paste.
2. Press **Copy link** in the action bar (or **Share → Copy share link**).
3. The page status area confirms **“Link copied!”** — the confirmation appears only after the browser accepted the write.

### When the browser blocks the clipboard
If the clipboard write is refused, the page never claims success. It announces the failure and opens the **Manual Copy** dialog with the URL already selected, so it can be copied with `Ctrl+C` / `Cmd+C`.

### Share a single file of a multi-file paste
1. Select the file tab you want to share.
2. Press **Copy link**.
3. The copied URL ends in `/file/<fileId>`, and the recipient lands on that file.

### Copy a Markdown link
1. Open the **Share** menu.
2. Choose **Markdown link**.
3. Paste the `[Paste title](https://…)` snippet wherever you write documentation.

### Keyboard operation
- **Enter** / **Space** on *Share* opens the menu and moves focus into it.
- **Arrow Up / Arrow Down** move between menu items, **Home** and **End** jump to the first and last item.
- **Escape** closes the menu and returns focus to its trigger.
- Clicking outside the menu closes it.

---

## 4. Threat model

| Risk | Mitigation |
| --- | --- |
| Leaking the access token of a public paste | The share token is attached **only** for unlisted pastes. A stale `?token=` in the address bar is never copied into a public paste's link. |
| Leaking the decryption key through server logs | The end-to-end key lives in the URL **fragment**, which browsers never send to the server. |
| Leaking a password or an unlock token through a URL | Neither is ever part of a share URL. Password-protected pastes are downloaded with the passcode in a request **header** (`X-Paste-Password`), never in the query string. |
| Serving content that the server no longer has | A consumed view-once paste is downloaded from the in-memory copy, and the UI states that the server copy was already consumed instead of offering a dead link. |
| Downloading bytes the browser only *thinks* it has | Password-protected pastes are fetched from the server's by-id endpoints, so the saved file is the persisted content, not the decrypted render state. |
| A false "copied" confirmation | Success is announced only after the clipboard promise resolves; a refusal opens the manual-copy fallback. |
| Ambiguous status for assistive technology | The page owns exactly **one** `role="status"` live region. The nested comments loader no longer occupies the status role. |
| An existence oracle for private pastes | A private paste exposes no share link; opening a nonexistent, private, or consumed paste yields the same uniform 404 Problem Details response. |

---

## 5. Learn more

- [API contract](../api-contract.md) — the canonical URL shape, the share-token rules, and the uniform 404 contract.
- [Security model](../security.md) — share tokens, unlock tokens, and the passcode header.
- [Password Protection](password-protected.md) — how a passcode-protected paste is unlocked and downloaded.
- [Burn After Reading](burn-after-read.md) — the single-view lifecycle and why the server copy disappears.
- [Multi-File Workspaces](multi-file.md) — per-file tabs and per-file links.
- [Encrypted Pastes](encrypted-pastes.md) — client-side encryption and the `#key=` fragment.
- `frontend/src/features/pastes/lib/shareUrl.ts` — the single module that builds every share URL.
