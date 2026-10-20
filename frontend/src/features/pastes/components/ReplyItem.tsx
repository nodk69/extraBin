import React, { useState, useRef, useEffect } from 'react';
import {
  CornerDownRight,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { ReplyItem as ReplyItemType } from '../types/reply';
import { useAuth } from '../../auth/context/AuthContext';

interface ReplyItemProps {
  reply: ReplyItemType;
  depth?: number;
  onReplySubmit: (parentId: number, content: string) => Promise<boolean>;
  onEditSubmit: (replyId: number, content: string) => Promise<boolean>;
  onDeleteSubmit: (replyId: number) => Promise<boolean>;
  onVote?: (replyId: number, voteType: 'UP' | 'DOWN') => Promise<void>;
}

export const formatRelativeTime = (dateStr: string): string => {
  try {
    const now = Date.now();
    const past = new Date(dateStr).getTime();
    if (isNaN(past)) return 'recently';
    const diffSecs = Math.max(0, Math.floor((now - past) / 1000));
    if (diffSecs < 60) return 'just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'recently';
  }
};

export const ReplyItem: React.FC<ReplyItemProps> = ({
  reply,
  depth = 0,
  onReplySubmit,
  onEditSubmit,
  onDeleteSubmit,
  onVote,
}) => {
  const { user, isAuthenticated } = useAuth();

  // Nested replies collapse state (collapsed by default beyond depth 1 or can be toggled)
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Inline reply form state
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Focus reply input when toggled
  useEffect(() => {
    if (showReplyForm) {
      replyInputRef.current?.focus();
    }
  }, [showReplyForm]);

  // Focus edit input when toggled
  useEffect(() => {
    if (isEditing) {
      setEditContent(reply.content);
      editInputRef.current?.focus();
    }
  }, [isEditing, reply.content]);

  const isAuthor =
    Boolean(isAuthenticated && user && !reply.isDeleted && (
      (user.id != null && reply.authorId != null && String(user.id) === String(reply.authorId)) ||
      (user.username && reply.authorUsername && user.username.toLowerCase() === reply.authorUsername.toLowerCase())
    ));

  // Max depth is 5 levels: depth 0 through 3 can reply, depth 4 cannot
  const canReply = depth < 4;
  const hasChildren = reply.children && reply.children.length > 0;

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed || isSubmittingReply) return;

    setIsSubmittingReply(true);
    const success = await onReplySubmit(reply.id, trimmed);
    setIsSubmittingReply(false);
    if (success) {
      setReplyContent('');
      setShowReplyForm(false);
      setIsCollapsed(false); // Make sure children are visible when replying
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = editContent.trim();
    if (!trimmed || isSubmittingEdit) return;

    setIsSubmittingEdit(true);
    const success = await onEditSubmit(reply.id, trimmed);
    setIsSubmittingEdit(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    await onDeleteSubmit(reply.id);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  return (
    <div
      className={`reply-node group relative transition-colors duration-150 ${
        depth > 0
          ? 'ml-5 sm:ml-8 mt-3 pl-3 sm:pl-4 border-l-2 border-[#e5e1d8] hover:border-[#17201d]'
          : 'mt-4 border border-[#e5e1d8] bg-white rounded-xl p-4 shadow-xs hover:border-[#cfcac0]'
      }`}
      id={`reply-${reply.id}`}
    >
      {/* Reply Header */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-[#eef3f0] text-[#1b4332] font-semibold text-xs flex items-center justify-center border border-[#d2dfd8] shrink-0 select-none">
            {reply.isDeleted ? (
              <User className="w-3.5 h-3.5 text-[#a5a9a0]" />
            ) : (
              reply.authorUsername.charAt(0).toUpperCase()
            )}
          </div>

          <span
            className={`font-semibold truncate ${
              reply.isDeleted ? 'text-[#8a8d84] italic' : 'text-[#17201d]'
            }`}
          >
            {reply.isDeleted ? '[deleted user]' : reply.authorUsername}
          </span>

          <span className="text-[#a5a9a0] select-none">•</span>

          <span className="flex items-center gap-1 text-[#74776f] font-mono shrink-0" title={new Date(reply.createdAt).toLocaleString()}>
            <Clock className="w-3 h-3 text-[#a5a9a0]" />
            {formatRelativeTime(reply.createdAt)}
          </span>

          {reply.updatedAt && reply.createdAt && !reply.isDeleted && new Date(reply.updatedAt).getTime() > new Date(reply.createdAt).getTime() && (
            <span className="text-[11px] text-[#8a8d84] italic shrink-0" title={`Edited on ${new Date(reply.updatedAt).toLocaleString()}`}>
              (edited)
            </span>
          )}
        </div>

        {/* Action Controls for Author */}
        {isAuthor && !isEditing && (
          <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 text-[11px] font-medium text-[#52554d] hover:text-[#17201d] hover:bg-[#f3f0e8] rounded-md transition-colors flex items-center gap-1"
              title="Edit reply"
              aria-label="Edit reply"
            >
              <Edit2 className="w-3 h-3" />
              <span className="hidden sm:inline">Edit</span>
            </button>

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1.5 bg-[#fff4f0] px-2.5 py-1 rounded-md border-2 border-[#ff5c3d]">
                <span className="text-[11px] text-[#17201d] font-semibold">Delete?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2 py-0.5 text-[11px] font-bold text-white bg-[#ff5c3d] hover:bg-[#e84830] rounded transition-colors border border-[#17201d]"
                >
                  {isDeleting ? '...' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-1.5 py-0.5 text-[11px] font-medium text-[#52554d] hover:text-[#17201d] hover:bg-[#f3f0e8] rounded transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-2 py-1 text-[11px] font-medium text-[#52554d] hover:text-[#ff5c3d] hover:bg-[#fff4f0] rounded-md transition-colors flex items-center gap-1"
                title="Delete reply"
                aria-label="Delete reply"
              >
                <Trash2 className="w-3 h-3" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reply Content / Edit Mode */}
      <div className="mt-2 text-sm text-[#272b28] leading-relaxed break-words">
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="mt-1 space-y-2">
            <textarea
              ref={editInputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={5000}
              rows={3}
              className="w-full text-xs font-mono p-3 bg-[#faf8f2] border border-[#cfcac0] rounded-lg text-[#17201d] outline-none focus:border-[#17201d] focus:bg-white resize-y"
              required
            />
            <div className="flex items-center justify-between text-[11px] text-[#74776f]">
              <span>{editContent.length}/5000 characters</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 border border-[#cfcac0] text-[#52554d] hover:text-[#17201d] rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit || !editContent.trim()}
                  className="px-3 py-1 bg-[#17201d] text-white hover:bg-[#2c3b36] rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  <span>{isSubmittingEdit ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : reply.isDeleted ? (
          <div className="py-1 px-2.5 bg-[#f5f4ef] border border-[#e5e1d8] rounded text-xs text-[#8a8d84] italic font-mono inline-block">
            [deleted]
          </div>
        ) : (
          <div className="whitespace-pre-wrap font-sans text-[13px] leading-normal text-[#17201d]">
            {reply.content}
          </div>
        )}
      </div>

      {/* Reply Voting */}
      {!reply.isDeleted && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="inline-flex items-center rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono overflow-hidden">
            <button
              type="button"
              data-testid={`reply-${reply.id}-upvote-btn`}
              aria-label="Upvote reply"
              onClick={() => onVote?.(reply.id, 'UP')}
              className={`flex items-center gap-1 px-2 py-1 transition-colors hover:bg-[#ebe7dc] ${
                reply.userVote === 'UP'
                  ? 'bg-[#c6f05b] text-[#17201d] font-bold'
                  : 'text-[#555a53]'
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
              <span data-testid={`reply-${reply.id}-upvotes`}>{reply.upvotes ?? 0}</span>
            </button>

            <div className="w-[1px] h-3.5 bg-[#d5d0c5]"></div>

            <button
              type="button"
              data-testid={`reply-${reply.id}-downvote-btn`}
              aria-label="Downvote reply"
              onClick={() => onVote?.(reply.id, 'DOWN')}
              className={`flex items-center gap-1 px-2 py-1 transition-colors hover:bg-[#ebe7dc] ${
                reply.userVote === 'DOWN'
                  ? 'bg-[#fed7aa] text-[#17201d] font-bold'
                  : 'text-[#555a53]'
              }`}
            >
              <ThumbsDown className="w-3 h-3" />
              <span data-testid={`reply-${reply.id}-downvotes`}>{reply.downvotes ?? 0}</span>
            </button>
          </div>
        </div>
      )}

      {/* Reply Footer: Reply Button & Thread Collapse Toggle */}
      <div className="mt-2.5 flex items-center gap-3 text-xs">
        {canReply && !reply.isDeleted && (
          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                // If not authenticated, open login or show message
                setShowReplyForm(true);
              } else {
                setShowReplyForm((prev) => !prev);
              }
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#52554d] hover:text-[#17201d] transition-colors py-1 px-2 rounded-md hover:bg-[#f3f0e8]"
          >
            <CornerDownRight className="w-3 h-3" />
            <span>Reply</span>
          </button>
        )}

        {hasChildren && (
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] font-medium text-[#74776f] hover:text-[#17201d] transition-colors py-1 px-2 rounded-md hover:bg-[#f3f0e8]"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show {reply.children.length} {reply.children.length === 1 ? 'reply' : 'replies'}</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Hide replies</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Inline Reply Box (Auto-focus) */}
      {showReplyForm && (
        <div className="mt-3 pt-3 border-t border-[#eeebe2]">
          {!isAuthenticated ? (
            <div className="p-3 bg-[#fdf8f0] border border-[#fae2c5] rounded-lg text-xs text-[#824409] flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#b45309]" />
                Please log in to reply to this comment.
              </span>
              <a
                href="/login"
                className="underline font-bold hover:text-[#522b04] text-[11px]"
              >
                Sign In
              </a>
            </div>
          ) : (
            <form onSubmit={handleReplySubmit} className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-[#74776f]">
                <CornerDownRight className="w-3.5 h-3.5 text-[#a5a9a0]" />
                <span>Replying to <strong className="text-[#17201d]">@{reply.authorUsername}</strong></span>
              </div>
              <textarea
                ref={replyInputRef}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Write your reply to ${reply.authorUsername}...`}
                maxLength={5000}
                rows={3}
                className="w-full text-xs font-mono p-3 bg-[#faf8f2] border border-[#cfcac0] rounded-lg text-[#17201d] outline-none focus:border-[#17201d] focus:bg-white resize-y shadow-inner"
                required
              />
              <div className="flex items-center justify-between text-[11px] text-[#74776f]">
                <span>{replyContent.length}/5000 characters</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReplyForm(false);
                      setReplyContent('');
                    }}
                    className="px-3 py-1 border border-[#cfcac0] text-[#52554d] hover:text-[#17201d] rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReply || !replyContent.trim()}
                    className="px-3 py-1 bg-[#17201d] text-white hover:bg-[#2c3b36] rounded-md font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>{isSubmittingReply ? 'Posting...' : 'Post Reply'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Nested Replies (depth 1) */}
      {hasChildren && !isCollapsed && (
        <div className="nested-replies space-y-2 mt-2">
          {reply.children.map((child) => (
            <ReplyItem
              key={child.id}
              reply={child}
              depth={depth + 1}
              onReplySubmit={onReplySubmit}
              onEditSubmit={onEditSubmit}
              onDeleteSubmit={onDeleteSubmit}
              onVote={onVote}
            />
          ))}
        </div>
      )}
    </div>
  );
};
