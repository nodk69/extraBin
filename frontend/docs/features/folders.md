# Folders & Organization

## 1. What this is

Folders let authenticated ExtraBin users organize their pastes into named collections. You can create custom folders, rename them, move pastes between folders, and delete folders without losing the pastes inside them. Every account starts with an "Unfiled" bucket that holds pastes not assigned to any folder.

---

## 2. Live demo

Explore the folder management workflow below. Create folders, move simulated pastes between them, rename entries, and observe how deletion orphans pastes back to Unfiled rather than destroying them.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Project-Based Snippets**: Grouping related configuration files, deployment scripts, or environment templates under a single folder name.
- **Team Knowledge Bases**: Organizing shared code snippets, runbooks, or onboarding references by team or topic.
- **Workflow Stages**: Separating drafts, reviewed snippets, and archived pastes into distinct folders for lifecycle tracking.

### When not to use it
- **Anonymous Pastes**: Folders require authentication. Anonymous pastes cannot be organized into folders.
- **Single-Paste Users**: If you only create a few pastes, the Unfiled list and search are sufficient without folder overhead.
- **Cross-User Sharing**: Folders are personal organizational tools. They do not control sharing permissions or visibility — those are set per-paste.

---

## 4. Step-by-step: how to create, how to open

### How to Create a Folder
1. Sign in to your ExtraBin account and navigate to the **Account** page (`/account`).
2. Click the **New Folder** button in the folder bar.
3. Enter a folder name (1–100 characters, no control characters). Names are unique per account (case-insensitive).
4. Click **Create**. The folder appears in the folder bar with a paste count of 0.

### How to Move a Paste to a Folder
1. On the **Account** page, find the paste you want to organize.
2. Click the **Move to Folder** action on the paste row.
3. Select the target folder from the modal dropdown, or choose **Unfiled** to remove it from any folder.
4. Click **Move**. The paste is reassigned and the folder counts update immediately.

### How to Rename or Delete a Folder
1. On the **Account** page, click the rename (pencil) or delete (trash) icon next to the folder name in the folder bar.
2. For rename: enter the new name and confirm. The change applies instantly.
3. For delete: confirm the deletion dialog. All pastes in the folder are moved to **Unfiled** — they are not deleted.

### How to Filter by Folder
1. On the **Account** page, click a folder name in the folder bar to filter the paste list.
2. Click **All Pastes** to view everything, or **Unfiled** to see only pastes without a folder assignment.

---

## 5. Learn more

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/folders` | List all folders with active paste counts |
| `POST` | `/api/v1/folders` | Create a new folder |
| `PUT` | `/api/v1/folders/{id}` | Rename a folder |
| `DELETE` | `/api/v1/folders/{id}` | Delete a folder (pastes become Unfiled) |
| `PUT` | `/api/v1/folders/pastes/{pastePublicId}/move` | Move a paste to a folder |

All endpoints require authentication. Mutations enforce ownership — you can only manage your own folders and pastes.

### Validation Rules
- Folder names are trimmed, must be 1–100 characters, and cannot contain control characters (code points below 32 or 127).
- Duplicate names are rejected case-insensitively within the same account.
- Moving a paste to a non-existent or unowned folder returns a 404 Problem Details response.

### Deletion Safety
Deleting a folder never deletes the pastes inside it. The `disassociateFolder` operation sets each paste's `folder_id` to `null`, returning them to the Unfiled state. This prevents accidental data loss from folder cleanup.
