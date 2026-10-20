# Multi-File Workspaces

## 1. What this is

Multi-File Workspaces allow you to bundle multiple related files into a single paste. Instead of scattering code across separate links, you can package application code, configurations, test fixtures, and documentation together with syntax tabs, unified line counts, and single-click archive downloads.

---

## 2. Live demo

Explore the interactive multi-file workspace simulator below. Switch between source files, examine syntax highlighting, and test file addition controls directly in your browser.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Complete Module Snippets**: Bundling code files alongside their unit tests (e.g., `handler.go` + `handler_test.go`).
- **Application Configs**: Sharing multi-container setups (e.g., `docker-compose.yml` + `.env.example`).
- **Small Packages & Gists**: Distributing runnable multi-file scripts with `README.md`.

### When not to use it
- **Monorepo Backups**: ExtraBin is designed for concise code snippets up to 1 MB per paste, not full repository backups.
- **Large Binary Datasets**: Heavy image, video, or compiled assets should use dedicated artifact registries.

---

## 4. Step-by-step: how to create, how to open

### How to Create a Multi-File Workspace
1. On the **Create Paste** page, enter your first file's name and content.
2. Click the **+ Add File** tab in the editor header.
3. Name the additional file (e.g., `config.yaml`) and enter its contents.
4. Save the paste to generate a unified multi-file link.

### How to Open and Download a Multi-File Workspace
1. Open the paste link to see all files organized into tabbed navigation.
2. Click individual file tabs to switch syntax and content views.
3. Click **Download ZIP** or **Copy All** to export the entire workspace in one step.

---

## 5. Learn more

### Storage & Delivery Architecture
Each file within a multi-file workspace maintains its own filename, language identifier, and character count while sharing the parent paste's access controls, expiration timestamp, and optional zero-knowledge encryption envelope.
