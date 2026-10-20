export interface ReplyItem {
  id: number;
  pasteId: string;
  parentReplyId?: number | null;
  parent_reply_id?: number | null;
  authorId?: number | null;
  authorUsername: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt?: string | null;
  upvotes?: number;
  downvotes?: number;
  userVote?: 'UP' | 'DOWN' | null;
  children: ReplyItem[];
}

export interface RepliesCursorPage {
  items: ReplyItem[];
  nextCursor?: string | null;
  hasMore: boolean;
}

export interface CreateReplyPayload {
  content: string;
  parentReplyId?: number | null;
  parent_reply_id?: number | null;
}

export interface EditReplyPayload {
  content: string;
}

export interface ReplyVoteResult {
  replyId: number;
  upvotes: number;
  downvotes: number;
  userVote?: 'UP' | 'DOWN' | null;
}
