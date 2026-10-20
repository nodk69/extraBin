import React, { useEffect, useState, useId } from 'react';
import {
  MessageSquare,
  Send,
  Trash2,
  User,
  ShieldCheck,
  Check,
  Copy,
  AlertCircle,
  Clock,
  KeyRound,
  X,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { pasteApi } from '../api/pasteApi';
import { CommentItem, PasteView } from '../types/paste';
import { ApiError } from '../../../lib/api-client/client';
import { Loading } from '../../../components/ui/Loading';

interface PasteCommentsSectionProps {
  paste: PasteView;
}

export const PasteCommentsSection: React.FC<PasteCommentsSectionProps> = ({ paste }) => {
  const { user, isAuthenticated } = useAuth();
  const guestNameId = useId();
  const commentTextId = useId();

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Anonymous deletion capability notification
  const [savedDeleteNotice, setSavedDeleteNotice] = useState<{
    commentId: number;
    key: string;
    copied: boolean;
  } | null>(null);

  // Delete modal / prompt state
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [deleteKeyInput, setDeleteKeyInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await pasteApi.getComments(paste.id);
      setComments(res.comments);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 400) {
        setError(err.detail || 'Comments are not enabled for this snippet.');
      } else {
        setError('Failed to load comments. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paste.visibility === 'PUBLIC') {
      fetchComments();
    }
  }, [paste.id, paste.visibility]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    try {
      setSubmitting(true);
      setPostError(null);

      const payload = {
        content: trimmed,
        ...(!isAuthenticated && authorName.trim() ? { authorName: authorName.trim() } : {}),
      };

      const result = await pasteApi.createComment(paste.id, payload);

      // Save anonymous deletion key in sessionStorage for auto-delete eligibility
      if (result.deletionCapability) {
        try {
          sessionStorage.setItem(`paste_cmnt_del_${result.id}`, result.deletionCapability);
        } catch {
          // ignore storage quota errors
        }

        setSavedDeleteNotice({
          commentId: result.id,
          key: result.deletionCapability,
          copied: false,
        });
      }

      setContent('');
      setAuthorName('');
      await fetchComments();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setPostError(err.detail || 'Failed to post comment.');
      } else {
        setPostError('Network error while posting comment. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStoredDeleteKey = (commentId: number): string | null => {
    try {
      return sessionStorage.getItem(`paste_cmnt_del_${commentId}`);
    } catch {
      return null;
    }
  };

  const handleDeleteComment = async (commentId: number, suppliedKey?: string) => {
    try {
      setIsDeleting(true);
      setDeleteError(null);

      const keyToUse = suppliedKey || getStoredDeleteKey(commentId) || undefined;
      await pasteApi.deleteComment(paste.id, commentId, keyToUse);

      try {
        sessionStorage.removeItem(`paste_cmnt_del_${commentId}`);
      } catch {
        // ignore
      }

      setDeletingCommentId(null);
      setDeleteKeyInput('');
      await fetchComments();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDeleteError(err.detail || 'Failed to delete comment.');
      } else {
        setDeleteError('An unexpected error occurred while deleting.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyNoticeKey = () => {
    if (!savedDeleteNotice) return;
    navigator.clipboard.writeText(savedDeleteNotice.key);
    setSavedDeleteNotice({ ...savedDeleteNotice, copied: true });
    setTimeout(() => {
      setSavedDeleteNotice((prev) => (prev ? { ...prev, copied: false } : null));
    }, 2500);
  };

  const formatRelativeTime = (isoString: string): string => {
    try {
      const now = Date.now();
      const past = new Date(isoString).getTime();
      const diffMs = now - past;
      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return 'just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  };

  if (paste.visibility !== 'PUBLIC') {
    return null;
  }

  return (
    <div className="mt-8 border-t border-[#d8d4ca] pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#ff5c3d]" />
          <h2 className="text-xl font-bold text-[#17201d] m-0">
            Comments
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[#17201d] text-white text-xs font-mono font-bold">
            {comments.length}
          </span>
        </div>
        <span className="text-xs font-mono text-[#74776f]">
          Public discussion
        </span>
      </div>

      {/* Anonymous Delete Notice Banner */}
      {savedDeleteNotice && (
        <div className="p-4 rounded-xl bg-[#c6f05b]/20 border border-[#17201d] shadow-[2px_2px_0px_#17201d] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="space-y-1 text-xs font-mono text-[#17201d]">
            <div className="flex items-center gap-1.5 font-bold">
              <KeyRound className="w-4 h-4 text-[#15803d]" />
              <span>Comment published as guest</span>
            </div>
            <p className="text-[11px] text-[#555a53] m-0">
              Save your deletion key if you want to delete this comment later:
            </p>
            <code className="inline-block px-2 py-0.5 bg-white border border-[#aaa89f] rounded font-mono text-[11px] font-bold select-all break-all">
              {savedDeleteNotice.key}
            </code>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyNoticeKey}
              className="action-btn text-xs"
            >
              {savedDeleteNotice.copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{savedDeleteNotice.copied ? 'Copied!' : 'Copy Key'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSavedDeleteNotice(null)}
              className="p-1 rounded text-[#74776f] hover:text-[#17201d]"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Post Comment Card */}
      <form onSubmit={handlePostComment} className="paper-card p-5 space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#ebe7dc] border border-[#17201d] flex items-center justify-center font-bold text-[10px] text-[#17201d]">
              {isAuthenticated && user?.username ? user.username.charAt(0).toUpperCase() : <User className="w-3 h-3" />}
            </div>
            {isAuthenticated && user ? (
              <span className="font-semibold text-[#17201d]">
                Posting as <span className="text-[#ff5c3d]">@{user.username}</span>
              </span>
            ) : (
              <span className="text-[#74776f]">Posting as Guest</span>
            )}
          </div>

          <span className={`text-[11px] ${content.length > 1900 ? 'text-red-600 font-bold' : 'text-[#74776f]'}`}>
            {content.length} / 2000
          </span>
        </div>

        {!isAuthenticated && (
          <div>
            <label htmlFor={guestNameId} className="sr-only">Your Display Name</label>
            <input
              id={guestNameId}
              type="text"
              placeholder="Your name or nickname (optional, defaults to Anonymous)..."
              maxLength={50}
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-[#d5d0c5] rounded-md text-xs font-mono text-[#17201d] placeholder-[#9ca3af] outline-none focus:border-[#17201d]"
            />
          </div>
        )}

        <div>
          <label htmlFor={commentTextId} className="sr-only">Comment Content</label>
          <textarea
            id={commentTextId}
            rows={3}
            placeholder="Share feedback, code suggestions, or notes on this snippet..."
            maxLength={2000}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 bg-white border border-[#d5d0c5] rounded-lg text-sm text-[#17201d] placeholder-[#9ca3af] outline-none focus:border-[#17201d] font-sans resize-y leading-relaxed"
          />
        </div>

        {postError && (
          <div className="p-2.5 rounded bg-red-100 border border-red-700 text-red-900 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{postError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px] font-mono text-[#74776f] m-0">
            Markdown format &amp; newlines preserved. Please keep discussions civil.
          </p>

          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="action-btn action-btn-primary !py-2 !px-4 text-xs font-bold"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{submitting ? 'Posting...' : 'Post Comment'}</span>
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loading variant="inline" icon="loader" message="Loading discussion..." announce={false} />
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono">
            {error}
          </div>
        ) : comments.length === 0 ? (
          <div className="paper-card p-8 text-center space-y-2">
            <div className="w-10 h-10 mx-auto rounded-full bg-[#ebe7dc] border border-[#d5d0c5] flex items-center justify-center text-[#74776f]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-[#17201d] m-0">No comments yet</p>
            <p className="text-xs font-mono text-[#74776f] m-0">
              Be the first to share your thoughts or code review on this public paste!
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const hasLocalDeleteKey = !!getStoredDeleteKey(comment.id);
            const userCanDelete = comment.canDelete || hasLocalDeleteKey;

            return (
              <div
                key={comment.id}
                className="paper-card p-4 space-y-2.5 transition-all hover:border-[#17201d]"
              >
                {/* Comment Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-[#17201d]">
                      {comment.authorName}
                    </span>

                    {comment.isPasteAuthor && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#ff5c3d] text-[#17201d] border border-[#17201d]">
                        Author
                      </span>
                    )}

                    {comment.isAuthenticatedUser && !comment.isPasteAuthor && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#ebe7dc] text-[#555a53] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-[#15803d]" />
                        <span>Verified</span>
                      </span>
                    )}

                    <span className="text-[11px] font-mono text-[#74776f] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatRelativeTime(comment.createdAt)}</span>
                    </span>
                  </div>

                  {/* Delete Button */}
                  <div className="flex items-center gap-1">
                    {userCanDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1 rounded text-[#a5a9a0] hover:text-[#ff5c3d] hover:bg-red-50 transition-colors"
                        title={comment.isPasteAuthor ? 'Delete comment' : 'Delete my comment'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeletingCommentId(comment.id)}
                        className="p-1 rounded text-[#a5a9a0] hover:text-[#17201d] text-[10px] font-mono flex items-center gap-1"
                        title="Delete with key"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Comment Body */}
                <div className="text-xs text-[#17201d] whitespace-pre-wrap font-sans leading-relaxed break-words">
                  {comment.content}
                </div>

                {/* Comment Reactions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-[#ebe7dc]">
                  <div className="inline-flex items-center rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono overflow-hidden">
                    <button
                      type="button"
                      data-testid={`comment-${comment.id}-upvote-btn`}
                      aria-label="Upvote comment"
                      onClick={async () => {
                        const previousVote = comment.userVote;
                        const previousUp = comment.upvotes ?? 0;
                        const previousDown = comment.downvotes ?? 0;
                        const isRetract = previousVote === 'UP';

                        // Optimistic
                        setComments((prev) =>
                          prev.map((c) => {
                            if (c.id !== comment.id) return c;
                            return {
                              ...c,
                              userVote: isRetract ? undefined : 'UP',
                              upvotes: isRetract ? Math.max(0, previousUp - 1) : previousUp + 1,
                              downvotes: previousVote === 'DOWN' ? Math.max(0, previousDown - 1) : previousDown,
                            };
                          })
                        );

                        try {
                          if (isRetract) {
                            const res = await pasteApi.retractCommentVote(paste.id, comment.id);
                            setComments((prev) =>
                              prev.map((c) => (c.id === comment.id ? { ...c, ...res } : c))
                            );
                          } else {
                            const res = await pasteApi.voteComment(paste.id, comment.id, 'UP');
                            setComments((prev) =>
                              prev.map((c) => (c.id === comment.id ? { ...c, ...res } : c))
                            );
                          }
                        } catch (err) {
                          // Rollback
                          setComments((prev) =>
                            prev.map((c) =>
                              c.id === comment.id
                                ? { ...c, userVote: previousVote, upvotes: previousUp, downvotes: previousDown }
                                : c
                            )
                          );
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 transition-colors hover:bg-[#ebe7dc] ${
                        comment.userVote === 'UP'
                          ? 'bg-[#c6f05b] text-[#17201d] font-bold'
                          : 'text-[#555a53]'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span data-testid={`comment-${comment.id}-upvotes`}>{comment.upvotes ?? 0}</span>
                    </button>

                    <div className="w-[1px] h-3.5 bg-[#d5d0c5]"></div>

                    <button
                      type="button"
                      data-testid={`comment-${comment.id}-downvote-btn`}
                      aria-label="Downvote comment"
                      onClick={async () => {
                        const previousVote = comment.userVote;
                        const previousUp = comment.upvotes ?? 0;
                        const previousDown = comment.downvotes ?? 0;
                        const isRetract = previousVote === 'DOWN';

                        // Optimistic
                        setComments((prev) =>
                          prev.map((c) => {
                            if (c.id !== comment.id) return c;
                            return {
                              ...c,
                              userVote: isRetract ? undefined : 'DOWN',
                              downvotes: isRetract ? Math.max(0, previousDown - 1) : previousDown + 1,
                              upvotes: previousVote === 'UP' ? Math.max(0, previousUp - 1) : previousUp,
                            };
                          })
                        );

                        try {
                          if (isRetract) {
                            const res = await pasteApi.retractCommentVote(paste.id, comment.id);
                            setComments((prev) =>
                              prev.map((c) => (c.id === comment.id ? { ...c, ...res } : c))
                            );
                          } else {
                            const res = await pasteApi.voteComment(paste.id, comment.id, 'DOWN');
                            setComments((prev) =>
                              prev.map((c) => (c.id === comment.id ? { ...c, ...res } : c))
                            );
                          }
                        } catch (err) {
                          // Rollback
                          setComments((prev) =>
                            prev.map((c) =>
                              c.id === comment.id
                                ? { ...c, userVote: previousVote, upvotes: previousUp, downvotes: previousDown }
                                : c
                            )
                          );
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 transition-colors hover:bg-[#ebe7dc] ${
                        comment.userVote === 'DOWN'
                          ? 'bg-[#fed7aa] text-[#17201d] font-bold'
                          : 'text-[#555a53]'
                      }`}
                    >
                      <ThumbsDown className="w-3 h-3" />
                      <span data-testid={`comment-${comment.id}-downvotes`}>{comment.downvotes ?? 0}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Comment with Secret Token Modal */}
      {deletingCommentId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm paper-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#ff5c3d]">
                <KeyRound className="w-5 h-5" />
                <h3 className="text-base font-bold text-[#17201d] m-0">Delete Comment</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeletingCommentId(null);
                  setDeleteKeyInput('');
                  setDeleteError(null);
                }}
                className="text-[#74776f] hover:text-[#17201d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-mono text-[#74776f] m-0">
              Enter the one-time deletion key generated when this comment was created.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded bg-red-100 border border-red-700 text-red-900 text-xs font-mono">
                {deleteError}
              </div>
            )}

            <div>
              <input
                type="text"
                placeholder="del_..."
                value={deleteKeyInput}
                onChange={(e) => setDeleteKeyInput(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#aaa89f] rounded text-xs font-mono text-[#17201d] outline-none focus:border-[#17201d]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingCommentId(null);
                  setDeleteKeyInput('');
                  setDeleteError(null);
                }}
                className="action-btn text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting || !deleteKeyInput.trim()}
                onClick={() => handleDeleteComment(deletingCommentId, deleteKeyInput.trim())}
                className="action-btn action-btn-danger text-xs"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
