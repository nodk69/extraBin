import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  AlertCircle,
  RefreshCw,
  Lock,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/context/AuthContext';
import { replyApi } from '../api/replyApi';
import { ReplyItem as ReplyItemType } from '../types/reply';
import { PasteView } from '../types/paste';
import { ReplyItem } from './ReplyItem';
import { ApiError } from '../../../lib/api-client/client';
import { Loading } from '../../../components/ui/Loading';

interface PasteRepliesSectionProps {
  paste: PasteView;
}

interface ToastNotification {
  id: number;
  type: 'error' | 'success';
  message: string;
}

export const PasteRepliesSection: React.FC<PasteRepliesSectionProps> = ({ paste }) => {
  const { user, isAuthenticated } = useAuth();

  const [replies, setReplies] = useState<ReplyItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Main reply box state
  const [mainContent, setMainContent] = useState('');
  const [submittingMain, setSubmittingMain] = useState(false);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const showToast = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const isExpired = paste.expiresAt ? new Date(paste.expiresAt).getTime() <= Date.now() : false;
  const allowsReplies = paste.visibility === 'PUBLIC' && !paste.burnAfterReading && !isExpired;

  // Initial load
  const loadInitialReplies = useCallback(async () => {
    if (!allowsReplies) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError(null);
      const res = await replyApi.getReplies(paste.id, null, 20);
      setReplies(res.items || []);
      setNextCursor(res.nextCursor || null);
      setHasMore(res.hasMore || false);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFetchError(err.detail || 'Failed to load replies.');
      } else {
        setFetchError('Failed to load replies. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [paste.id, allowsReplies]);

  useEffect(() => {
    loadInitialReplies();
  }, [loadInitialReplies]);

  // Load more replies (cursor-based pagination)
  const handleLoadMore = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;

    try {
      setLoadingMore(true);
      const res = await replyApi.getReplies(paste.id, nextCursor, 20);
      setReplies((prev) => [...prev, ...(res.items || [])]);
      setNextCursor(res.nextCursor || null);
      setHasMore(res.hasMore || false);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : 'Failed to load more replies.';
      showToast(msg, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  // Submit top-level reply with optimistic UI update
  const handleMainReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = mainContent.trim();
    if (!trimmed || submittingMain) return;

    if (!isAuthenticated || !user) {
      showToast('Please log in to post a reply.', 'error');
      return;
    }

    // Prepare optimistic reply
    const tempId = -Date.now();
    const optimisticReply: ReplyItemType = {
      id: tempId,
      pasteId: paste.id,
      parentReplyId: null,
      authorId: user.id ? Number(user.id) : null,
      authorUsername: user.username || 'You',
      content: trimmed,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      children: [],
    };

    // Optimistic update
    setReplies((prev) => [optimisticReply, ...prev]);
    setMainContent('');
    setSubmittingMain(true);

    try {
      const realReply = await replyApi.createReply(paste.id, { content: trimmed });
      // Replace optimistic reply with server response
      setReplies((prev) =>
        prev.map((r) => (r.id === tempId ? { ...realReply, children: [] } : r))
      );
      showToast('Reply posted successfully!', 'success');
    } catch (err: unknown) {
      // Rollback optimistic reply
      setReplies((prev) => prev.filter((r) => r.id !== tempId));
      setMainContent(trimmed); // restore text so user doesn't lose it

      let errorMsg = 'Failed to post reply.';
      if (err instanceof ApiError) {
        if (err.status === 429) {
          errorMsg = 'Rate limit exceeded: 10 replies/min or 100/hour. Please slow down.';
        } else {
          errorMsg = err.detail || errorMsg;
        }
      }
      showToast(errorMsg, 'error');
    } finally {
      setSubmittingMain(false);
    }
  };

  // Submit nested reply (child of parentId) with optimistic UI update
  const handleNestedReplySubmit = async (parentId: number, content: string): Promise<boolean> => {
    if (!isAuthenticated || !user) {
      showToast('Please log in to post a reply.', 'error');
      return false;
    }

    const tempId = -Date.now();
    const optimisticChild: ReplyItemType = {
      id: tempId,
      pasteId: paste.id,
      parentReplyId: parentId,
      authorId: user.id ? Number(user.id) : null,
      authorUsername: user.username || 'You',
      content,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      children: [],
    };

    // Optimistically insert child
    setReplies((prev) =>
      prev.map((root) => {
        if (root.id === parentId) {
          return {
            ...root,
            children: [...(root.children || []), optimisticChild],
          };
        }
        return root;
      })
    );

    try {
      const realChild = await replyApi.createReply(paste.id, {
        content,
        parentReplyId: parentId,
      });

      // Replace optimistic child
      setReplies((prev) =>
        prev.map((root) => {
          if (root.id === parentId) {
            return {
              ...root,
              children: (root.children || []).map((c) => (c.id === tempId ? realChild : c)),
            };
          }
          return root;
        })
      );
      showToast('Reply posted!', 'success');
      return true;
    } catch (err: unknown) {
      // Rollback child
      setReplies((prev) =>
        prev.map((root) => {
          if (root.id === parentId) {
            return {
              ...root,
              children: (root.children || []).filter((c) => c.id !== tempId),
            };
          }
          return root;
        })
      );

      let errorMsg = 'Failed to post nested reply.';
      if (err instanceof ApiError) {
        if (err.status === 429) {
          errorMsg = 'Rate limit exceeded: 10 replies/min or 100/hour. Please wait before replying again.';
        } else {
          errorMsg = err.detail || errorMsg;
        }
      }
      showToast(errorMsg, 'error');
      return false;
    }
  };

  // Edit reply with optimistic update
  const handleEditReply = async (replyId: number, content: string): Promise<boolean> => {
    // Snapshot previous state for rollback
    const previousReplies = replies;

    // Optimistically update
    const updateInTree = (list: ReplyItemType[]): ReplyItemType[] =>
      list.map((item) => {
        if (item.id === replyId) {
          return { ...item, content, updatedAt: new Date().toISOString() };
        }
        if (item.children && item.children.length > 0) {
          return { ...item, children: updateInTree(item.children) };
        }
        return item;
      });

    setReplies((prev) => updateInTree(prev));

    try {
      const updated = await replyApi.editReply(replyId, { content });
      // Apply confirmed data
      setReplies((prev) =>
        prev.map((root) => {
          if (root.id === replyId) {
            return { ...root, content: updated.content, updatedAt: updated.updatedAt };
          }
          if (root.children) {
            return {
              ...root,
              children: root.children.map((c) =>
                c.id === replyId ? { ...c, content: updated.content, updatedAt: updated.updatedAt } : c
              ),
            };
          }
          return root;
        })
      );
      showToast('Reply updated.', 'success');
      return true;
    } catch (err: unknown) {
      // Rollback
      setReplies(previousReplies);
      const msg = err instanceof ApiError ? err.detail : 'Failed to edit reply.';
      showToast(msg, 'error');
      return false;
    }
  };

  // Delete reply with soft-delete preserving thread structure
  const handleDeleteReply = async (replyId: number): Promise<boolean> => {
    const previousReplies = replies;

    // Optimistic soft delete
    const softDeleteInTree = (list: ReplyItemType[]): ReplyItemType[] =>
      list.map((item) => {
        if (item.id === replyId) {
          return { ...item, isDeleted: true, content: '[deleted]' };
        }
        if (item.children && item.children.length > 0) {
          return { ...item, children: softDeleteInTree(item.children) };
        }
        return item;
      });

    setReplies((prev) => softDeleteInTree(prev));

    try {
      await replyApi.deleteReply(replyId);
      showToast('Reply deleted.', 'success');
      return true;
    } catch (err: unknown) {
      setReplies(previousReplies);
      const msg = err instanceof ApiError ? err.detail : 'Failed to delete reply.';
      showToast(msg, 'error');
      return false;
    }
  };

  // Vote on a reply with optimistic UI update
  const handleVoteReply = async (replyId: number, voteType: 'UP' | 'DOWN'): Promise<void> => {
    const findReply = (list: ReplyItemType[], id: number): ReplyItemType | null => {
      for (const item of list) {
        if (item.id === id) return item;
        if (item.children) {
          const found = findReply(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const existing = findReply(replies, replyId);
    if (!existing) return;

    const previousVote = existing.userVote;
    const previousUp = existing.upvotes ?? 0;
    const previousDown = existing.downvotes ?? 0;
    const isRetract = previousVote === voteType;

    const updateVoteInTree = (list: ReplyItemType[]): ReplyItemType[] =>
      list.map((item) => {
        if (item.id === replyId) {
          return {
            ...item,
            userVote: isRetract ? undefined : voteType,
            upvotes: isRetract
              ? Math.max(0, previousUp - (previousVote === 'UP' ? 1 : 0))
              : previousUp + (previousVote === 'UP' ? 0 : 1) - (previousVote === 'DOWN' ? 1 : 0) + (voteType === 'UP' ? 1 : 0),
            downvotes: isRetract
              ? Math.max(0, previousDown - (previousVote === 'DOWN' ? 1 : 0))
              : previousDown + (previousVote === 'DOWN' ? 0 : 1) - (previousVote === 'UP' ? 1 : 0) + (voteType === 'DOWN' ? 1 : 0),
          };
        }
        if (item.children) {
          return { ...item, children: updateVoteInTree(item.children) };
        }
        return item;
      });

    // Compute new values
    let newUp = previousUp;
    let newDown = previousDown;
    let newVote: 'UP' | 'DOWN' | undefined = voteType;

    if (isRetract) {
      if (previousVote === 'UP') newUp = Math.max(0, previousUp - 1);
      else newDown = Math.max(0, previousDown - 1);
      newVote = undefined;
    } else {
      if (previousVote === 'UP') newUp = Math.max(0, previousUp - 1);
      if (previousVote === 'DOWN') newDown = Math.max(0, previousDown - 1);
      if (voteType === 'UP') newUp += 1;
      else newDown += 1;
    }

    // Optimistic update
    setReplies((prev) =>
      prev.map((item) => {
        if (item.id === replyId) {
          return { ...item, userVote: newVote, upvotes: newUp, downvotes: newDown };
        }
        const updateChildren = (r: ReplyItemType): ReplyItemType => ({
          ...r,
          children: r.children.map((c) => {
            if (c.id === replyId) return { ...c, userVote: newVote, upvotes: newUp, downvotes: newDown };
            return c;
          }),
        });
        return updateChildren(item);
      })
    );

    try {
      if (isRetract) {
        const res = await replyApi.retractReplyVote(paste.id, replyId);
        applyVoteResult(res);
      } else {
        const res = await replyApi.voteReply(paste.id, replyId, voteType);
        applyVoteResult(res);
      }
    } catch {
      // Rollback
      setReplies((prev) =>
        prev.map((item) => {
          if (item.id === replyId) {
            return { ...item, userVote: previousVote, upvotes: previousUp, downvotes: previousDown };
          }
          const rollbackChildren = (r: ReplyItemType): ReplyItemType => ({
            ...r,
            children: r.children.map((c) => {
              if (c.id === replyId) return { ...c, userVote: previousVote, upvotes: previousUp, downvotes: previousDown };
              return c;
            }),
          });
          return rollbackChildren(item);
        })
      );
    }
  };

  const applyVoteResult = (res: { replyId: number; upvotes: number; downvotes: number; userVote?: string | null }) => {
    const updateInTree = (list: ReplyItemType[]): ReplyItemType[] =>
      list.map((item) => {
        if (item.id === res.replyId) {
          return { ...item, upvotes: res.upvotes, downvotes: res.downvotes, userVote: (res.userVote as 'UP' | 'DOWN' | undefined) ?? undefined };
        }
        if (item.children) {
          return { ...item, children: updateInTree(item.children) };
        }
        return item;
      });
    setReplies((prev) => updateInTree(prev));
  };

  if (!allowsReplies) {
    return (
      <section className="mt-8 border-t border-[#d8d4ca] pt-6 font-sans">
        <div className="flex items-center gap-2 p-3.5 bg-[#f5f4ef] border border-[#e5e1d8] rounded-xl text-xs text-[#74776f]">
          <Lock className="w-4 h-4 text-[#a5a9a0] shrink-0" />
          <span>
            {isExpired
              ? 'This paste has expired. Replies are disabled.'
              : paste.visibility !== 'PUBLIC'
              ? `Replies are disabled on ${paste.visibility.toLowerCase()} pastes.`
              : 'Replies are disabled for this snippet.'}
          </span>
        </div>
      </section>
    );
  }

  const totalReplyCount = replies.reduce(
    (count, r) => count + 1 + (r.children ? r.children.length : 0),
    0
  );

  return (
    <section className="mt-10 border-t border-[#d8d4ca] pt-8 font-sans">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl border shadow-lg text-xs font-mono animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              toast.type === 'success'
                ? 'bg-[#eefcf3] border-[#a3e6b8] text-[#166534]'
                : 'bg-[#fef2f2] border-[#fecaca] text-[#991b1b]'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#16a34a]" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 text-[#dc2626]" />
              )}
              <span className="leading-tight">{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-[#74776f] hover:text-[#17201d] shrink-0"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#17201d]" />
          <h2 className="text-base font-bold text-[#17201d]">
            Discussion {totalReplyCount > 0 ? `(${totalReplyCount})` : ''}
          </h2>
        </div>

        <button
          type="button"
          onClick={loadInitialReplies}
          disabled={loading}
          className="text-xs text-[#74776f] hover:text-[#17201d] flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-[#f3f0e8]"
          title="Refresh replies"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Main Top-Level Reply Input Box */}
      <div className="border border-[#e5e1d8] bg-white rounded-xl p-4 shadow-xs mb-6">
        {!isAuthenticated ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-[#faf8f2] border border-[#eeebe2] rounded-lg">
            <div className="text-xs text-[#52554d]">
              <span className="font-semibold text-[#17201d]">Join the discussion!</span>{' '}
              Sign in with your account to reply to this paste.
            </div>
            <a
              href="/login"
              className="px-3.5 py-1.5 bg-[#17201d] text-white hover:bg-[#2c3b36] rounded-md text-xs font-semibold transition-colors shrink-0"
            >
              Sign In to Reply
            </a>
          </div>
        ) : (
          <form onSubmit={handleMainReplySubmit} className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[#74776f]">
              <div className="w-5 h-5 rounded-full bg-[#17201d] text-white flex items-center justify-center font-bold text-[10px]">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="font-semibold text-[#17201d]">@{user?.username}</span>
            </div>

            <textarea
              value={mainContent}
              onChange={(e) => setMainContent(e.target.value)}
              placeholder="What are your thoughts on this snippet? Type a reply..."
              rows={3}
              maxLength={5000}
              className="w-full text-xs font-mono p-3 bg-[#faf8f2] border border-[#cfcac0] rounded-lg text-[#17201d] outline-none focus:border-[#17201d] focus:bg-white resize-y shadow-inner transition-colors"
              required
            />

            <div className="flex items-center justify-between text-xs text-[#74776f]">
              <span className="text-[11px] font-mono">{mainContent.length}/5000</span>
              <button
                type="submit"
                disabled={submittingMain || !mainContent.trim()}
                className="px-4 py-1.5 bg-[#17201d] text-white hover:bg-[#2c3b36] rounded-lg font-medium text-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submittingMain ? 'Posting...' : 'Post Reply'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-xs text-[#991b1b] flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={loadInitialReplies}
            className="underline font-semibold hover:text-[#7f1d1d]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Replies List */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <Loading variant="inline" message="Loading discussion..." />
        </div>
      ) : replies.length === 0 ? (
        /* Empty State */
        <div className="border border-dashed border-[#cfcac0] rounded-xl p-8 text-center bg-[#faf8f2]">
          <MessageSquare className="w-8 h-8 text-[#aaa89f] mx-auto mb-2 opacity-60" />
          <h3 className="text-sm font-semibold text-[#17201d] mb-1">
            No replies yet. Be the first to reply.
          </h3>
          <p className="text-xs text-[#74776f] max-w-sm mx-auto">
            Share feedback, report an issue, or ask a question about this code snippet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              depth={0}
              onReplySubmit={handleNestedReplySubmit}
              onEditSubmit={handleEditReply}
              onDeleteSubmit={handleDeleteReply}
              onVote={handleVoteReply}
            />
          ))}

          {/* Pagination: Load More Button */}
          {hasMore && (
            <div className="pt-4 pb-2 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-xs font-semibold bg-[#faf8f2] hover:bg-[#ede9de] text-[#17201d] border border-[#cfcac0] rounded-xl transition-all shadow-xs flex items-center gap-2 mx-auto disabled:opacity-60"
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading more replies...</span>
                  </>
                ) : (
                  <span>Load more replies (20 per page)</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
