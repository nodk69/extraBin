import React, { useState } from 'react';
import { MessageSquare, ThumbsUp, ThumbsDown, Trash2, RefreshCw, CheckCircle2, Key } from 'lucide-react';

interface SimComment {
  id: number;
  author: string;
  content: string;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  deletionToken?: string;
  isOwn: boolean;
}

export const CommentsDemo: React.FC = () => {
  const [comments, setComments] = useState<SimComment[]>([
    { id: 1, author: 'alice', content: 'Great approach! Consider adding error handling for the edge case.', upvotes: 3, downvotes: 0, userVote: null, isOwn: false },
    { id: 2, author: 'Guest', content: 'Works perfectly, thanks for sharing!', upvotes: 1, downvotes: 0, userVote: null, isOwn: true, deletionToken: 'del_8f3a2b1c' },
  ]);
  const [newComment, setNewComment] = useState('');
  const [showToken, setShowToken] = useState('');
  const [nextId, setNextId] = useState(3);

  const handlePost = () => {
    if (!newComment.trim()) return;
    const token = `del_${Math.random().toString(36).slice(2, 10)}`;
    setComments([
      ...comments,
      {
        id: nextId,
        author: 'You (Guest)',
        content: newComment.trim(),
        upvotes: 0,
        downvotes: 0,
        userVote: null,
        deletionToken: token,
        isOwn: true,
      },
    ]);
    setNextId(nextId + 1);
    setShowToken(token);
    setNewComment('');
  };

  const handleVote = (id: number, type: 'up' | 'down') => {
    setComments(comments.map((c) => {
      if (c.id !== id) return c;
      if (c.userVote === type) {
        return { ...c, userVote: null, [type === 'up' ? 'upvotes' : 'downvotes']: c[type === 'up' ? 'upvotes' : 'downvotes'] - 1 };
      }
      const prev = c.userVote;
      return {
        ...c,
        userVote: type,
        upvotes: c.upvotes + (type === 'up' ? 1 : prev === 'up' ? -1 : 0),
        downvotes: c.downvotes + (type === 'down' ? 1 : prev === 'down' ? -1 : 0),
      };
    }));
  };

  const handleDelete = (id: number) => {
    setComments(comments.filter((c) => c.id !== id));
    setShowToken('');
  };

  const handleReset = () => {
    setComments([
      { id: 1, author: 'alice', content: 'Great approach! Consider adding error handling for the edge case.', upvotes: 3, downvotes: 0, userVote: null, isOwn: false },
      { id: 2, author: 'Guest', content: 'Works perfectly, thanks for sharing!', upvotes: 1, downvotes: 0, userVote: null, isOwn: true, deletionToken: 'del_8f3a2b1c' },
    ]);
    setNewComment('');
    setShowToken('');
    setNextId(3);
  };

  return (
    <div
      data-testid="comments-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#ccfbf1] border border-[#0d9488] text-[#0f766e]">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Comments & Voting Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Post comments, vote, and test anonymous deletion</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] hover:text-[#17201d] flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#ccfbf1] text-[#0f766e] px-1.5 py-0.5 rounded border border-[#0d9488] font-bold shrink-0">
          SIMULATION
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-4 font-mono text-xs">
        {showToken && (
          <div className="p-3 rounded-lg bg-[#fef9c3] border border-[#ca8a04] text-[#854d0e] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-[11px]">
              <Key className="w-3.5 h-3.5" />
              <span>Your one-time deletion capability (save this!):</span>
            </div>
            <code className="text-[10px] bg-white px-2 py-1 rounded border border-[#ca8a04] block">{showToken}</code>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePost()}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 rounded-lg border border-[#d5d0c5] bg-[#faf8f2] text-xs font-mono text-[#17201d] placeholder:text-[#74786f] focus:outline-none focus:ring-2 focus:ring-[#0d9488]"
            aria-label="New comment"
          />
          <button
            type="button"
            onClick={handlePost}
            className="px-3 py-2 rounded-lg bg-[#0d9488] text-white font-bold text-xs hover:bg-[#0f766e] transition-all cursor-pointer shadow-[2px_2px_0px_#17201d]"
          >
            Post
          </button>
        </div>

        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="p-3 rounded-lg border border-[#d5d0c5] bg-[#faf8f2] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#17201d] text-[11px]">{comment.author}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleVote(comment.id, 'up')}
                      className={`p-1 rounded transition-colors cursor-pointer ${comment.userVote === 'up' ? 'text-[#16a34a] bg-[#f0fdf4]' : 'text-[#74786f] hover:text-[#16a34a]'}`}
                      aria-label="Upvote"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-bold text-[#525a54] min-w-[12px] text-center">{comment.upvotes}</span>
                    <button
                      type="button"
                      onClick={() => handleVote(comment.id, 'down')}
                      className={`p-1 rounded transition-colors cursor-pointer ${comment.userVote === 'down' ? 'text-[#ef4444] bg-[#fef2f2]' : 'text-[#74786f] hover:text-[#ef4444]'}`}
                      aria-label="Downvote"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-bold text-[#525a54] min-w-[12px] text-center">{comment.downvotes}</span>
                  </div>
                  {comment.isOwn && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 rounded text-[#991b1b] hover:bg-[#fee2e2] transition-colors cursor-pointer"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-[#2f3833] m-0 leading-relaxed">{comment.content}</p>
            </div>
          ))}
        </div>

        <div className="p-2.5 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px]">{comments.length} comment{comments.length !== 1 ? 's' : ''} on this paste</span>
        </div>
      </div>
    </div>
  );
};
