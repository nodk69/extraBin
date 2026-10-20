export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export type ExpirationPolicy =
  | 'VIEW_ONCE'
  | 'BURN_AFTER_READING'
  | 'TEN_MINUTES'
  | 'ONE_HOUR'
  | 'ONE_DAY'
  | 'ONE_WEEK'
  | 'ONE_MONTH'
  | 'SIX_MONTHS'
  | 'ONE_YEAR'
  | 'NEVER';

export interface PasteFilePayload {
  filename: string;
  content: string;
  language?: string;
}

export interface PasteFileItem {
  id?: number;
  filename: string;
  content: string;
  language: string;
  sizeBytes?: number;
  lineCount?: number;
  sortOrder?: number;
  nonce?: string;
  ciphertext?: string;
  authTag?: string;
}

export interface CreatePastePayload {
  title?: string;
  content?: string;
  language?: string;
  visibility: Visibility;
  expiration: ExpirationPolicy;
  password?: string;
  files?: PasteFilePayload[];
  folderId?: number;
  website?: string;
  customSlug?: string;
}

export interface CreatePasteResult {
  id: string;
  title?: string;
  language: string;
  visibility: Visibility;
  contentSizeBytes: number;
  lineCount: number;
  createdAt: string;
  expiresAt?: string;
  deletionCapability?: string;
  burnAfterReading?: boolean;
  viewOnce?: boolean;
  passwordProtected?: boolean;
  encryptionMode?: 'LINK' | 'PASSPHRASE';
  shareToken?: string;
}

export interface RotateLinkResponse {
  id: string;
  shareToken: string;
}

export interface PasteView {
  id: string;
  title?: string;
  content: string;
  language: string;
  visibility: Visibility;
  contentSizeBytes: number;
  lineCount: number;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  version: number;
  burnAfterReading?: boolean;
  viewOnce?: boolean;
  passwordProtected?: boolean;
  passwordRequired?: boolean;
  files?: PasteFileItem[];
  views: number;
  encryptionMode?: 'LINK' | 'PASSPHRASE';
  kdfSalt?: string;
  kdfIterations?: number;
  wrappedKey?: string | null;
  shareToken?: string;
  shareStatus?: 'ACTIVE' | 'REVOKED';
  upvotes?: number;
  downvotes?: number;
  starsCount?: number;
  userVote?: 'UP' | 'DOWN';
  isStarred?: boolean;
}

export interface PasteVoteResult {
  pasteId: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'UP' | 'DOWN';
}

export interface PasteStarResult {
  pasteId: string;
  starsCount: number;
  isStarred: boolean;
}

export interface CommentVoteResult {
  commentId: number;
  upvotes: number;
  downvotes: number;
  userVote?: 'UP' | 'DOWN';
}

export interface CommentItem {
  id: number;
  pasteId: string;
  userId?: number;
  authorName: string;
  content: string;
  isPasteAuthor: boolean;
  isAuthenticatedUser: boolean;
  canDelete: boolean;
  createdAt: string;
  upvotes?: number;
  downvotes?: number;
  userVote?: 'UP' | 'DOWN';
}

export interface CommentsListResult {
  pasteId: string;
  totalComments: number;
  comments: CommentItem[];
}

export interface CreateCommentPayload {
  content: string;
  authorName?: string;
}

export interface CreateCommentResult {
  id: number;
  pasteId: string;
  userId?: number;
  authorName: string;
  content: string;
  isPasteAuthor: boolean;
  isAuthenticatedUser: boolean;
  createdAt: string;
  deletionCapability?: string;
}

export interface EmbedPasteView {
  publicId: string;
  title: string;
  language: string;
  createdAt: string;
  files: PasteFileItem[];
}
