# Revision History & Diffs

## 1. What this is

Revision History automatically captures a snapshot of your paste every time you edit it. You can browse the version timeline, compare any two versions side-by-side with a unified or split diff view, and see exactly which lines were added, removed, or changed between edits.

---

## 2. Live demo

Explore the revision inspection workflow below. Switch between versions, compare side-by-side diffs, and observe how additions and deletions are highlighted line-by-line.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Tracking Configuration Changes**: Comparing before and after states of infrastructure configs, environment files, or deployment manifests.
- **Code Review Audits**: Inspecting what changed between iterations of a shared snippet during a review cycle.
- **Accidental Edit Recovery**: Reverting to a previous version if an edit introduced errors or removed important content.

### When not to use it
- **Anonymous Pastes**: Revision history requires authentication. Anonymous pastes do not track revisions.
- **Single-Edit Pastes**: If you create a paste and never edit it, there is only one version and no diff to inspect.
- **Encrypted Pastes**: The server stores revision snapshots of the metadata and primary file, but encrypted paste content is opaque to the server. Revision tracking applies to the editable workspace primary file.

---

## 4. Step-by-step: how to create, how to open

### How Revisions Are Created
1. Create or open one of your pastes on the **View Paste** page.
2. Click the **Edit** button to enter editing mode.
3. Modify the title, language, or content, then click **Save**.
4. ExtraBin atomically captures a snapshot of the previous state as a new revision, then applies your changes. Each revision is assigned an incrementing version number.

### How to View Revision History
1. On the **Account** page, find the paste and click the **Revision History** action.
2. The revision workspace opens showing the version timeline on the left and the content on the right.
3. Select any two versions to compare them. The diff view highlights additions in green and deletions in red.

### How to Read the Diff
- **Side-by-side view** (desktop): The base version appears on the left, the target version on the right. Lines unique to the base are marked with `-`, lines unique to the target with `+`.
- **Unified view** (mobile): Additions and deletions are interleaved in a single column.
- **Statistics badges** at the top show the count of additions, deletions, and any line-ending or EOF newline differences.

### Performance Limits
The diff engine handles pastes up to 250KB or 3,000 lines. Beyond these limits, the diff view displays a notice that the content exceeds the processing threshold.

---

## 5. Learn more

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/account/pastes/{id}/revisions` | List all revision snapshots for an owned paste |
| `PUT` | `/api/v1/account/pastes/{id}` | Edit a paste (creates a revision snapshot atomically) |

Both endpoints require authentication and ownership of the paste.

### Concurrency Model
Editing uses optimistic concurrency control via a `version` field. If another session edits the paste between your load and save, the server returns a 409 Conflict response. You must reload the latest version and re-apply your changes.

### Version List Construction
The version list is built in descending order: the live (current) version appears first, followed by stored revisions from newest to oldest. If a revision's version number equals or exceeds the paste's current version (indicating a data inconsistency), a warning banner is displayed.

### Multi-File Workspaces
For multi-file pastes, revisions track the workspace primary file only. A notice in the revision workspace indicates this limitation.
