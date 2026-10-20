# Responsive Embeds

## 1. What this is

Responsive Embeds let you publish any public paste as a lightweight, sandboxed iframe widget that you can embed in external documentation, blog posts, or internal wikis. The embed renders syntax-highlighted code with a branded header, line count, and an "Open in ExtraBin" link — all without requiring the viewer to have an ExtraBin account.

---

## 2. Live demo

Generate an embed snippet below. Switch between height presets, preview the rendered iframe, and copy the HTML code for use in your own pages.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Documentation Sites**: Embedding live, syntax-highlighted code examples directly in technical documentation or README files.
- **Blog Posts**: Sharing configurable snippets or scripts inline with written tutorials.
- **Internal Wikis**: Displaying reference configurations or runbook snippets in Confluence, Notion, or similar tools.

### When not to use it
- **Private or Password-Protected Pastes**: Embeds only work for public, non-password-protected pastes. Private pastes return an "Unavailable" error in the embed frame.
- **Burn-After-Reading Pastes**: View-once pastes cannot be embedded because the embed fetch would consume the single view.
- **Interactive Demos**: Embeds are read-only. They do not support editing, commenting, or any interactive modification of the paste.

---

## 4. Step-by-step: how to create, how to open

### How to Generate an Embed Code
1. Open a public paste on the **View Paste** page.
2. Click the **Embed** button (or the embed icon) in the paste actions toolbar.
3. The embed modal opens with a live preview of the iframe.
4. Select a height preset: **Compact** (300px), **Standard** (450px), or **Extended** (600px).
5. Click **Copy** to copy the generated `<iframe>` HTML snippet to your clipboard.
6. Paste the snippet into your external page's HTML source.

### How the Embed Renders
1. A viewer loads the external page containing the iframe.
2. The iframe points to `/embed/{pasteId}` on your ExtraBin instance.
3. The embed page fetches the paste via the public embed endpoint and renders:
   - A header with the ExtraBin branding, paste title, and language badge.
   - Multi-file tab bar (for multi-file pastes).
   - Line-numbered, syntax-highlighted code.
   - A footer with line count, file size, and "Powered by ExtraBin" attribution.
   - A copy button and "Open in ExtraBin" link.

### Security Model
The embed iframe uses the `sandbox` attribute with `allow-scripts allow-same-origin allow-popups`. This prevents the embedded page from navigating the parent frame, accessing parent-page cookies, or executing privileged operations.

---

## 5. Learn more

### API Endpoint

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/pastes/{id}/embed` | Public embed data (no auth required) |

### Access Constraints
- Only **public**, non-password-protected, non-view-once pastes are served.
- Expired pastes return an "Unavailable" card instead of content.
- The response includes strict cache-busting headers: `Cache-Control: no-cache, no-store, must-revalidate`.
- No authentication, share tokens, or password headers are accepted — the embed endpoint is strictly public.

### Embed HTML Structure
The generated iframe snippet follows this pattern:

```html
<iframe
  src="https://your-extrabin-instance/embed/{pasteId}"
  width="100%"
  height="{selectedHeight}"
  frameborder="0"
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-popups">
</iframe>
```

### Height Presets
| Preset | Height | Use Case |
|---|---|---|
| Compact | 300px | Short snippets, inline code examples |
| Standard | 450px | Medium-length files, typical documentation |
| Extended | 600px | Longer files, multi-file workspaces |
