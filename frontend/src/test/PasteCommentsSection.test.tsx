import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { PasteCommentsSection } from '../features/pastes/components/PasteCommentsSection';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { authApi } from '../features/auth/api/authApi';
import { PasteView } from '../features/pastes/types/paste';

const mockPublicPaste: PasteView = {
  id: 'abc12345',
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

const mockUnlistedPaste: PasteView = {
  ...mockPublicPaste,
  visibility: 'UNLISTED',
};

describe('PasteCommentsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
  });

  it('does not render for unlisted or private pastes', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <PasteCommentsSection paste={mockUnlistedPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders comments header and empty state for public pastes', async () => {
    vi.spyOn(pasteApi, 'getComments').mockResolvedValueOnce({
      pasteId: 'abc12345',
      totalComments: 0,
      comments: [],
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteCommentsSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText(/Comments/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/No comments yet/i)).toBeInTheDocument();
    });

    expect(
      screen.getByPlaceholderText(/Share feedback, code suggestions, or notes/i)
    ).toBeInTheDocument();
  });

  it('loads and displays existing comments with author badges', async () => {
    vi.spyOn(pasteApi, 'getComments').mockResolvedValueOnce({
      pasteId: 'abc12345',
      totalComments: 2,
      comments: [
        {
          id: 1,
          pasteId: 'abc12345',
          authorName: 'DevUser',
          content: 'First review comment',
          isPasteAuthor: true,
          isAuthenticatedUser: true,
          canDelete: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          pasteId: 'abc12345',
          authorName: 'GuestAlice',
          content: 'Second guest comment',
          isPasteAuthor: false,
          isAuthenticatedUser: false,
          canDelete: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteCommentsSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('First review comment')).toBeInTheDocument();
      expect(screen.getByText('Second guest comment')).toBeInTheDocument();
      expect(screen.getByText('Author')).toBeInTheDocument();
    });
  });

  it('submits a new comment and handles anonymous deletion key notification', async () => {
    vi.spyOn(pasteApi, 'getComments')
      .mockResolvedValueOnce({
        pasteId: 'abc12345',
        totalComments: 0,
        comments: [],
      })
      .mockResolvedValueOnce({
        pasteId: 'abc12345',
        totalComments: 1,
        comments: [
          {
            id: 10,
            pasteId: 'abc12345',
            authorName: 'CoolGuest',
            content: 'Brand new feedback',
            isPasteAuthor: false,
            isAuthenticatedUser: false,
            canDelete: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });

    const createSpy = vi.spyOn(pasteApi, 'createComment').mockResolvedValueOnce({
      id: 10,
      pasteId: 'abc12345',
      authorName: 'CoolGuest',
      content: 'Brand new feedback',
      isPasteAuthor: false,
      isAuthenticatedUser: false,
      createdAt: new Date().toISOString(),
      deletionCapability: 'del_secret123',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PasteCommentsSection paste={mockPublicPaste} />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Share feedback, code suggestions/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Share feedback, code suggestions/i);
    const nameInput = screen.getByPlaceholderText(/Your name or nickname/i);

    fireEvent.change(nameInput, { target: { value: 'CoolGuest' } });
    fireEvent.change(textarea, { target: { value: 'Brand new feedback' } });

    const postBtn = screen.getByRole('button', { name: /Post Comment/i });
    fireEvent.click(postBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('abc12345', {
        content: 'Brand new feedback',
        authorName: 'CoolGuest',
      });
      expect(screen.getByText(/Comment published as guest/i)).toBeInTheDocument();
      expect(screen.getByText('del_secret123')).toBeInTheDocument();
    });
  });
});
