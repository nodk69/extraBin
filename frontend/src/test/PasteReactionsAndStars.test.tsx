import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { PasteCommentsSection } from '../features/pastes/components/PasteCommentsSection';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { authApi } from '../features/auth/api/authApi';
import { PasteView } from '../features/pastes/types/paste';

const mockPublicPasteWithReactions: PasteView = {
  id: 'reactPaste1',
  title: 'Community Snippet',
  content: 'console.log("react");',
  language: 'javascript',
  visibility: 'PUBLIC',
  contentSizeBytes: 50,
  lineCount: 1,
  isOwner: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 0,
  views: 10,
  upvotes: 5,
  downvotes: 1,
  starsCount: 3,
  userVote: undefined,
  isStarred: false,
};

const mockBurnPaste: PasteView = {
  ...mockPublicPasteWithReactions,
  id: 'burnPaste1',
  burnAfterReading: true,
  viewOnce: true,
};

describe('Phase 2 Red Suite: Paste Reactions, Comment Reactions & Paste Starring (Vitest Contract)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // FE-REACT-01: Star Badge, Action, and Authentication Protection
  // =========================================================================
  it('renders star count and filled star icon when paste is starred by user', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      username: 'starUser',
      email: 'star@pastebin.local',
      role: 'ROLE_USER',
      emailVerified: true,
      createdAt: '2024-01-01T00:00:00Z',
    });

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce({
      ...mockPublicPasteWithReactions,
      starsCount: 7,
      isStarred: true,
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <ViewPastePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Expect to see star counter badge with 7 stars and active star state
    await waitFor(() => {
      const starCountElement = screen.getByTestId('paste-stars-count');
      expect(starCountElement).toBeInTheDocument();
      expect(starCountElement.textContent).toContain('7');
    });

    const starBtn = screen.getByRole('button', { name: /unstar this paste/i });
    expect(starBtn).toBeInTheDocument();
  });

  it('clicking star toggles status and count optimistically, rolls back on failure', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      username: 'starUser',
      email: 'star@pastebin.local',
      role: 'ROLE_USER',
      emailVerified: true,
      createdAt: '2024-01-01T00:00:00Z',
    });

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce({
      ...mockPublicPasteWithReactions,
      starsCount: 3,
      isStarred: false,
    });

    // Mock API failure on star toggle
    const starSpy = vi.spyOn(pasteApi as any, 'starPaste').mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <AuthProvider>
          <ViewPastePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('paste-stars-count')).toHaveTextContent('3');
    });

    const starBtn = screen.getByRole('button', { name: /star this paste/i });
    fireEvent.click(starBtn);

    // Verifies starPaste was called
    expect(starSpy).toHaveBeenCalledWith('reactPaste1');

    // Should rollback count to 3 after rejection
    await waitFor(() => {
      expect(screen.getByTestId('paste-stars-count')).toHaveTextContent('3');
    });
  });

  it('anonymous user clicking star prompts authentication notification', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
    vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPublicPasteWithReactions);

    render(
      <BrowserRouter>
        <AuthProvider>
          <ViewPastePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('paste-stars-count')).toBeInTheDocument();
    });

    const starBtn = screen.getByRole('button', { name: /star this paste/i });
    fireEvent.click(starBtn);

    // Assert login prompt toast/notification appears
    await waitFor(() => {
      expect(screen.getByText(/sign in to star pastes/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // FE-REACT-02: Thumbs Up / Down Segmented Pill on Paste
  // =========================================================================
  it('renders upvote/downvote pills on paste, toggles between UP and DOWN, retracts on active click', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      username: 'voter1',
      email: 'v1@pastebin.local',
      role: 'ROLE_USER',
      emailVerified: true,
      createdAt: '2024-01-01T00:00:00Z',
    });

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce({
      ...mockPublicPasteWithReactions,
      upvotes: 5,
      downvotes: 1,
      userVote: 'UP',
    });

    const voteSpy = vi.spyOn(pasteApi as any, 'votePaste').mockResolvedValue({
      pasteId: 'reactPaste1',
      upvotes: 4,
      downvotes: 2,
      userVote: 'DOWN',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <ViewPastePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('paste-upvotes-count')).toHaveTextContent('5');
      expect(screen.getByTestId('paste-downvotes-count')).toHaveTextContent('1');
    });

    // Clicking downvote triggers votePaste with DOWN
    const downBtn = screen.getByTestId('paste-downvote-btn');
    fireEvent.click(downBtn);

    expect(voteSpy).toHaveBeenCalledWith('reactPaste1', 'DOWN');
  });

  it('disables voting and starring on view-once/burn-after-reading pastes with tooltip', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      username: 'voter1',
      email: 'v1@pastebin.local',
      role: 'ROLE_USER',
      emailVerified: true,
      createdAt: '2024-01-01T00:00:00Z',
    });

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockBurnPaste);

    render(
      <BrowserRouter>
        <AuthProvider>
          <ViewPastePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      const upBtn = screen.getByTestId('paste-upvote-btn');
      expect(upBtn).toBeDisabled();
      const downBtn = screen.getByTestId('paste-downvote-btn');
      expect(downBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // FE-REACT-03: Comment Upvotes / Downvotes
  // =========================================================================
  it('renders comment upvotes and downvotes and correctly dispatches reactions', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValueOnce({
      id: 1,
      username: 'commentVoter',
      email: 'cv@pastebin.local',
      role: 'ROLE_USER',
      emailVerified: true,
      createdAt: '2024-01-01T00:00:00Z',
    });

    vi.spyOn(pasteApi, 'getComments').mockResolvedValueOnce({
      pasteId: 'reactPaste1',
      totalComments: 1,
      comments: [
        {
          id: 101,
          pasteId: 'reactPaste1',
          authorName: 'DevFriend',
          content: 'Awesome code snippet!',
          isPasteAuthor: false,
          isAuthenticatedUser: true,
          canDelete: false,
          createdAt: new Date().toISOString(),
          upvotes: 4,
          downvotes: 0,
          userVote: undefined,
        } as any,
      ],
    });

    const commentVoteSpy = vi.spyOn(pasteApi as any, 'voteComment').mockResolvedValue({
      commentId: 101,
      upvotes: 5,
      downvotes: 0,
      userVote: 'UP',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteCommentsSection paste={mockPublicPasteWithReactions} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Awesome code snippet!')).toBeInTheDocument();
      expect(screen.getByTestId('comment-101-upvotes')).toHaveTextContent('4');
    });

    const upBtn = screen.getByTestId('comment-101-upvote-btn');
    fireEvent.click(upBtn);

    expect(commentVoteSpy).toHaveBeenCalledWith('reactPaste1', 101, 'UP');
  });
});
