import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PasteRepliesSection } from '../features/pastes/components/PasteRepliesSection';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { replyApi } from '../features/pastes/api/replyApi';
import { authApi } from '../features/auth/api/authApi';
import { PasteView } from '../features/pastes/types/paste';
import { ApiError } from '../lib/api-client/client';

const mockPublicPaste: PasteView = {
  id: 'paste123',
  title: 'Test Snippet',
  content: 'console.log("hello");',
  language: 'javascript',
  visibility: 'PUBLIC',
  contentSizeBytes: 100,
  lineCount: 1,
  isOwner: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 0,
  views: 5,
};

const mockPrivatePaste: PasteView = {
  ...mockPublicPaste,
  visibility: 'PRIVATE',
};

const mockExpiredPaste: PasteView = {
  ...mockPublicPaste,
  expiresAt: new Date(Date.now() - 3600000).toISOString(),
};

describe('PasteRepliesSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
  });

  it('renders disabled state for private pastes', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPrivatePaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/Replies are disabled on private pastes/i)).toBeInTheDocument();
  });

  it('renders disabled state for expired pastes', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockExpiredPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/This paste has expired. Replies are disabled/i)).toBeInTheDocument();
  });

  it('renders empty state when no replies exist', async () => {
    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No replies yet\. Be the first to reply\./i)
      ).toBeInTheDocument();
    });
  });

  it('renders threaded replies with nested children and [deleted] placeholder', async () => {
    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 1,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'This is a top level reply',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          children: [
            {
              id: 2,
              pasteId: 'paste123',
              parentReplyId: 1,
              authorId: 20,
              authorUsername: 'bob',
              content: 'This is a nested reply',
              isDeleted: false,
              createdAt: new Date().toISOString(),
              updatedAt: null,
              children: [],
            },
            {
              id: 3,
              pasteId: 'paste123',
              parentReplyId: 1,
              authorId: 30,
              authorUsername: 'charlie',
              content: '[deleted]',
              isDeleted: true,
              createdAt: new Date().toISOString(),
              updatedAt: null,
              children: [],
            },
          ],
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('This is a top level reply')).toBeInTheDocument();
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('This is a nested reply')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument();
      expect(screen.getByText('[deleted]')).toBeInTheDocument();
    });
  });

  it('allows authenticated user to optimistically post a reply and rolls back on failure', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 99,
      username: 'tester',
      email: 'tester@example.com',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    // Mock API failure (e.g. rate limit 429)
    vi.spyOn(replyApi, 'createReply').mockRejectedValueOnce(
      new ApiError({
        status: 429,
        title: 'Rate Limit Exceeded',
        detail: 'Rate limit exceeded: 10 replies/min or 100/hour.',
      })
    );

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    // Wait for user to be loaded
    await waitFor(() => {
      expect(screen.getByText('@tester')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/What are your thoughts on this snippet\?/i);
    fireEvent.change(textarea, { target: { value: 'Optimistic test reply' } });

    const postBtn = screen.getByRole('button', { name: /Post Reply/i });
    fireEvent.click(postBtn);

    // It should immediately show the optimistic reply
    expect(screen.getByText('Optimistic test reply')).toBeInTheDocument();

    // After failure, it should rollback optimistic reply item and show toast error, while restoring draft in input
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Rate limit exceeded/i);
      expect(screen.getByText(/No replies yet\. Be the first to reply\./i)).toBeInTheDocument();
      expect(textarea).toHaveValue('Optimistic test reply');
    });
  });

  it('renders "Load more replies" button when hasMore is true', async () => {
    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 1,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'First batch reply',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          children: [],
        },
      ],
      nextCursor: 'cursor_123',
      hasMore: true,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Load more replies (20 per page)')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // RV-F1: Reply voting UI renders upvote/downvote buttons with counts
  // =========================================================================
  it('renders upvote and downvote buttons with counts on each reply', async () => {
    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 100,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'A reply with votes',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          upvotes: 3,
          downvotes: 1,
          userVote: undefined,
          children: [],
        } as any,
      ],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reply-100-upvote-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reply-100-downvote-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reply-100-upvotes')).toHaveTextContent('3');
      expect(screen.getByTestId('reply-100-downvotes')).toHaveTextContent('1');
    });
  });

  // =========================================================================
  // RV-F2: Clicking upvote optimistically updates count
  // =========================================================================
  it('optimistically updates upvote count when upvote button is clicked', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 99,
      username: 'voter',
      email: 'voter@example.com',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 200,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'Vote me up',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          upvotes: 0,
          downvotes: 0,
          userVote: undefined,
          children: [],
        } as any,
      ],
      nextCursor: null,
      hasMore: false,
    });

    vi.spyOn(replyApi as any, 'voteReply').mockResolvedValue({
      replyId: 200,
      upvotes: 1,
      downvotes: 0,
      userVote: 'UP',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reply-200-upvote-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('reply-200-upvote-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reply-200-upvotes')).toHaveTextContent('1');
    });
  });

  // =========================================================================
  // RV-F3: Clicking same vote again retracts it
  // =========================================================================
  it('retracts vote when same vote button is clicked again', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      id: 99,
      username: 'voter',
      email: 'voter@example.com',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 300,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'Retract my vote',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          upvotes: 1,
          downvotes: 0,
          userVote: 'UP',
          children: [],
        } as any,
      ],
      nextCursor: null,
      hasMore: false,
    });

    vi.spyOn(replyApi as any, 'retractReplyVote').mockResolvedValue({
      replyId: 300,
      upvotes: 0,
      downvotes: 0,
      userVote: null,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reply-300-upvotes')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByTestId('reply-300-upvote-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('reply-300-upvotes')).toHaveTextContent('0');
    });
  });

  // =========================================================================
  // RV-F4: Reply button visible at depth 0-3, hidden at depth 4
  // =========================================================================
  it('shows reply button at depth 3 but not at depth 4', async () => {
    vi.spyOn(replyApi, 'getReplies').mockResolvedValueOnce({
      items: [
        {
          id: 400,
          pasteId: 'paste123',
          parentReplyId: null,
          authorId: 10,
          authorUsername: 'alice',
          content: 'Root reply (depth 0)',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          upvotes: 0,
          downvotes: 0,
          children: [
            {
              id: 401,
              pasteId: 'paste123',
              parentReplyId: 400,
              authorId: 20,
              authorUsername: 'bob',
              content: 'Depth 1 reply',
              isDeleted: false,
              createdAt: new Date().toISOString(),
              updatedAt: null,
              upvotes: 0,
              downvotes: 0,
              children: [
                {
                  id: 402,
                  pasteId: 'paste123',
                  parentReplyId: 401,
                  authorId: 30,
                  authorUsername: 'charlie',
                  content: 'Depth 2 reply',
                  isDeleted: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: null,
                  upvotes: 0,
                  downvotes: 0,
                  children: [
                    {
                      id: 403,
                      pasteId: 'paste123',
                      parentReplyId: 402,
                      authorId: 40,
                      authorUsername: 'dave',
                      content: 'Depth 3 reply',
                      isDeleted: false,
                      createdAt: new Date().toISOString(),
                      updatedAt: null,
                      upvotes: 0,
                      downvotes: 0,
                      children: [
                        {
                          id: 404,
                          pasteId: 'paste123',
                          parentReplyId: 403,
                          authorId: 50,
                          authorUsername: 'eve',
                          content: 'Depth 4 reply - no reply button',
                          isDeleted: false,
                          createdAt: new Date().toISOString(),
                          updatedAt: null,
                          upvotes: 0,
                          downvotes: 0,
                          children: [],
                        } as any,
                      ],
                    } as any,
                  ],
                } as any,
              ],
            } as any,
          ],
        } as any,
      ],
      nextCursor: null,
      hasMore: false,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteRepliesSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Root reply (depth 0)')).toBeInTheDocument();
      expect(screen.getByText('Depth 4 reply - no reply button')).toBeInTheDocument();
    });

    const findOwnReplyButton = (nodeText: string): boolean => {
      const node = screen.getByText(nodeText).closest('.reply-node');
      if (!node) return false;
      return Array.from(node.querySelectorAll('button')).some(b => {
        if (b.textContent?.trim() !== 'Reply') return false;
        return b.closest('.reply-node') === node;
      });
    };

    expect(findOwnReplyButton('Root reply (depth 0)')).toBe(true);
    expect(findOwnReplyButton('Depth 1 reply')).toBe(true);
    expect(findOwnReplyButton('Depth 2 reply')).toBe(true);
    expect(findOwnReplyButton('Depth 3 reply')).toBe(true);
    expect(findOwnReplyButton('Depth 4 reply - no reply button')).toBe(false);
  });
});
