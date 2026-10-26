import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { PasteView } from '../features/pastes/types/paste';

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    token: null,
    isLoading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../features/pastes/api/pasteApi', async () => {
  const actual = await vi.importActual<typeof import('../features/pastes/api/pasteApi')>(
    '../features/pastes/api/pasteApi'
  );
  return {
    ...actual,
    pasteApi: {
      ...actual.pasteApi,
      getPaste: vi.fn(),
    },
  };
});

const mockPaste: PasteView = {
  id: 'test-paste-1',
  title: 'Test Navigation Paste',
  language: 'typescript',
  visibility: 'PUBLIC',
  content: 'console.log("hello");',
  lineCount: 1,
  contentSizeBytes: 24,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isOwner: true,
  version: 1,
  files: [
    {
      id: 1,
      filename: 'index.ts',
      language: 'typescript',
      content: 'console.log("hello");',
      lineCount: 1,
      sizeBytes: 24,
      sortOrder: 0,
    },
  ],
  views: 10,
  starsCount: 2,
};

describe('ViewPastePage Back Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pasteApi.getPaste).mockResolvedValue(mockPaste);
  });

  it('renders "Back to Explore" and navigates to /explore when coming from explore tab', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/p/test-paste-1',
            state: { fromTab: 'explore' },
          },
        ]}
      >
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/explore" element={<div>Explore Feed Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    const backBtn = await screen.findByRole('button', { name: 'Back to Explore' });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(screen.getByText('Explore Feed Page')).toBeInTheDocument();
  });

  it('renders "Back to Trending" and navigates to /explore?tab=trending when coming from trending tab', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/p/test-paste-1',
            state: { fromTab: 'trending' },
          },
        ]}
      >
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/explore" element={<div>Trending Target Feed</div>} />
        </Routes>
      </MemoryRouter>
    );

    const backBtn = await screen.findByRole('button', { name: 'Back to Trending' });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(screen.getByText('Trending Target Feed')).toBeInTheDocument();
  });

  it('renders "Back to Most saved" and navigates to /explore?tab=most-saved when coming from most-saved tab', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/p/test-paste-1',
            state: { fromTab: 'most-saved' },
          },
        ]}
      >
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/explore" element={<div>Most Saved Target Feed</div>} />
        </Routes>
      </MemoryRouter>
    );

    const backBtn = await screen.findByRole('button', { name: 'Back to Most saved' });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(screen.getByText('Most Saved Target Feed')).toBeInTheDocument();
  });

  it('falls back to "Back to Explore" when no origin tab state is provided', async () => {
    render(
      <MemoryRouter initialEntries={['/p/test-paste-1']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/explore" element={<div>Default Explore Feed</div>} />
        </Routes>
      </MemoryRouter>
    );

    const backBtn = await screen.findByRole('button', { name: 'Back to Explore' });
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(screen.getByText('Default Explore Feed')).toBeInTheDocument();
  });
});
