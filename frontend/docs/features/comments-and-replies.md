# Interactive Comments & Replies

## 1. What this is

Comments and Replies enable threaded discussions on public pastes. Any viewer can leave a comment (with optional name for anonymous users), and authenticated users can create nested reply threads up to five levels deep. Both comments and replies support upvote/downvote reactions. Anonymous commenters receive a one-time deletion capability token to remove their own comments.

---

## 2. Live demo

Explore the commenting workflow below. Post simulated comments, vote on them, and observe how anonymous deletion capabilities work.

*(The interactive demo component is rendered above the fold in the ExtraBin web UI.)*

---

## 3. When to use it

### Recommended Use Cases
- **Code Review Feedback**: Discussing specific implementation choices or suggesting improvements on shared code snippets.
- **Q&A on Tutorials**: Asking clarifying questions about configuration examples or how-to snippets.
- **Community Collaboration**: Building knowledge around popular pastes through community discussion and voting.

### When not to use it
- **Private or Encrypted Pastes**: Comments are only available on public pastes. Password-protected and encrypted pastes do not expose the comment interface.
- **Burn-After-Reading Pastes**: View-once pastes disable comments because the paste content is destroyed after first access.
- **Non-Public Visibility**: Pastes with `UNLISTED` or `PRIVATE` visibility do not render the comment section.

---

## 4. Step-by-step: how to create, how to open

### How to Post a Comment
1. Open a public paste on the **View Paste** page.
2. Scroll to the **Comments** section below the paste content.
3. If you are anonymous, enter your display name in the guest name field (optional, max 50 characters).
4. Type your comment in the text area (max 2,000 characters).
5. Click **Post Comment**. The comment appears immediately in the list.
6. If you are anonymous, a **deletion capability token** is displayed once. Copy and save it if you want to be able to delete this comment later.

### How to Post a Reply
1. In the **Replies** section (authenticated users only), type your reply in the text area (max 5,000 characters).
2. To nest a reply under an existing comment, click the **Reply** button on that comment and type your response.
3. Click **Submit**. Nested replies support up to five levels of depth (depth 0 through 4).

### How to Vote on a Comment
1. Click the upvote or downvote arrow on any comment.
2. The vote is recorded using your authenticated session, or by client IP hash for anonymous voters.
3. You can change your vote by clicking the other arrow, or retract it by clicking the same arrow again.

### How to Delete a Comment
- **Authenticated author**: Click the **Delete** button on your own comment.
- **Paste owner or admin**: Delete any comment via the same button.
- **Anonymous commenter**: Click **Delete**, then enter your deletion capability token (the `del_...` string shown when you posted). The token can be provided via the `X-Comment-Delete-Token` header or in the request body.

---

## 5. Learn more

### API Endpoints — Comments

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/v1/pastes/{id}/comments` | List comments chronologically |
| `POST` | `/api/v1/pastes/{id}/comments` | Post a comment |
| `DELETE` | `/api/v1/pastes/{id}/comments/{commentId}` | Delete a comment |
| `POST` | `/api/v1/pastes/{id}/comments/{commentId}/vote` | Vote on a comment |
| `DELETE` | `/api/v1/pastes/{id}/comments/{commentId}/vote` | Retract comment vote |

### API Endpoints — Replies

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/v1/pastes/{pasteId}/replies` | Create a reply (auth required) |
| `GET` | `/api/v1/pastes/{pasteId}/replies` | Cursor-paginated replies with nested children (up to 5 levels) |
| `PATCH` | `/api/v1/replies/{id}` | Edit own reply (auth required) |
| `DELETE` | `/api/v1/replies/{id}` | Soft-delete own reply (auth required) |
| `POST` | `/api/v1/pastes/{pasteId}/replies/{replyId}/vote` | Vote on a reply (UP or DOWN) |
| `DELETE` | `/api/v1/pastes/{pasteId}/replies/{replyId}/vote` | Retract reply vote |

### Security Model
- **Anonymous deletion capabilities** are one-time tokens returned only in the `CreateCommentResponse`. They are never exposed as URL query parameters (audit finding P2-03).
- **User IDs are not exposed** in comment responses to prevent enumeration (audit finding P2-01).
- **Reply rate limiting**: 10 replies/minute, 100/hour per user. Exceeding the limit returns 429 Problem Details.
- **Soft-delete for replies**: Deleted replies preserve thread hierarchy by displaying a `[deleted]` placeholder rather than being removed entirely.
- **Password-protected pastes**: Comment endpoints accept the `X-Paste-Password` header to authorize access.

### Voting Mechanics
Votes use HMAC-SHA256 voter tracking for anonymous users (keyed by client IP) to prevent duplicate voting without exposing raw IP addresses. Authenticated users are tracked by user ID. Each voter can cast one vote (up or down) per comment or reply, and can retract or change their vote. Vote endpoints enforce the same rate limits as other reaction endpoints (60 votes/min per user, 30 votes/min per IP).
