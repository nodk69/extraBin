import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { ApiError } from '../lib/api-client/client';
import type { PasteView } from '../features/pastes/types/paste';

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

vi.mock('../features/dashboard/api/accountApi', () => ({
  accountApi: {
    editPaste: vi.fn(),
    deleteOwnedPaste: vi.fn(),
    getRevisions: vi.fn(),
  },
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
      downloadZip: vi.fn(),
      reportDecryptFailed: vi.fn(),
    },
  };
});

const publicFixture: PasteView = {
  id: 'public123',
  title: 'Public Share Fixture',
  content: 'public content\n',
  language: 'plaintext',
  visibility: 'PUBLIC',
  contentSizeBytes: 16,
  lineCount: 1,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 7,
  files: [
    {
      id: undefined,
      filename: 'public123.txt',
      content: 'public content\n',
      language: 'plaintext',
      sizeBytes: 16,
      lineCount: 1,
      sortOrder: 0,
    },
  ],
};

const multiFileFixture: PasteView = {
  id: 'multi123',
  title: 'Multi File Share Fixture',
  content: 'console.log("index");\n',
  language: 'typescript',
  visibility: 'PUBLIC',
  contentSizeBytes: 64,
  lineCount: 1,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 3,
  files: [
    {
      id: 101,
      filename: 'index.ts',
      content: 'console.log("index");\n',
      language: 'typescript',
      sizeBytes: 22,
      lineCount: 1,
      sortOrder: 0,
    },
    {
      id: 202,
      filename: 'utils.ts',
      content: 'export const value = 42;\n',
      language: 'typescript',
      sizeBytes: 25,
      lineCount: 1,
      sortOrder: 1,
    },
  ],
};

const unlistedFixture: PasteView = {
  ...publicFixture,
  id: 'unl123',
  title: 'Unlisted Share Fixture',
  visibility: 'UNLISTED',
  shareToken: 'shr_testtoken',
  shareStatus: 'ACTIVE',
};

const passwordFixture: PasteView = {
  ...publicFixture,
  id: 'pw123',
  title: 'Password Share Fixture',
  content: '',
  passwordProtected: true,
  passwordRequired: true,
  files: [],
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/p/:id" element={<ViewPastePage />} />
        <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function primaryCopyLink() {
  return screen.findByRole('button', { name: /^copy link$/i });
}

describe('Sharing experience: primary copy-link and states', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    Object.assign(navigator, { clipboard: { writeText } });
    writeText.mockResolvedValue(undefined);
  });

  it('FE-SHARE-01: renders a visible primary Copy link action for a public paste', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);

    renderAt('/p/public123');

    const button = await primaryCopyLink();
    expect(button).toBeVisible();
    expect(button.tagName).toBe('BUTTON');
  });

  it('FE-SHARE-02: copies the canonical paste URL for a legacy single-file paste', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);

    renderAt('/p/public123');
    fireEvent.click(await primaryCopyLink());

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/public123`);
    });
  });

  it('FE-SHARE-03: copies the active file URL when a file tab is selected', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    renderAt('/p/multi123/file/202');
    fireEvent.click(await primaryCopyLink());

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/multi123/file/202`);
    });
  });

  it('FE-SHARE-04: copies the canonical paste URL on the multi-file root route', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    renderAt('/p/multi123');
    fireEvent.click(await primaryCopyLink());

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/multi123`);
    });
  });

  it('FE-SHARE-05: preserves the share token and encryption key fragment', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(unlistedFixture);
    window.history.replaceState({}, '', '/p/unl123?token=shr_testtoken#key=testkey');

    renderAt('/p/unl123');
    fireEvent.click(await primaryCopyLink());

    await waitFor(() => {
      const copied = String(writeText.mock.calls[0]?.[0] ?? '');
      expect(copied).toContain(`${window.location.origin}/p/unl123`);
      expect(copied).toContain('token=shr_testtoken');
      expect(copied).toContain('#key=testkey');
    });
  });

  it('FE-SHARE-06: shows an explicit copied confirmation only after success', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);

    renderAt('/p/public123');
    const button = await primaryCopyLink();
    fireEvent.click(button);

    expect(await within(button).findByText('Copied')).toBeInTheDocument();
  });

  it('FE-SHARE-07: opens the manual-copy fallback with focused text when clipboard rejects', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);
    writeText.mockRejectedValue(new Error('clipboard denied'));

    renderAt('/p/public123');
    fireEvent.click(await primaryCopyLink());

    const dialog = await screen.findByRole('dialog', { name: /manual copy/i });
    expect(dialog).toBeInTheDocument();
    const textarea = within(dialog).getByRole('textbox');
    expect(textarea).toHaveValue(`${window.location.origin}/p/public123`);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('FE-SHARE-08: never claims success when the clipboard rejects', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);
    writeText.mockRejectedValue(new Error('clipboard denied'));

    renderAt('/p/public123');
    const button = await primaryCopyLink();
    fireEvent.click(button);

    await screen.findByRole('dialog', { name: /manual copy/i });
    expect(within(button).queryByText('Copied')).not.toBeInTheDocument();
  });

  it('FE-SHARE-09: the primary copy action is keyboard focusable', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);

    renderAt('/p/public123');
    const button = await primaryCopyLink();
    button.focus();

    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('FE-SHARE-10: updates document.title for a loaded public paste', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(publicFixture);

    renderAt('/p/public123');
    await screen.findByText('Public Share Fixture');

    await waitFor(() => expect(document.title).toContain('Public Share Fixture'));
  });

  it('FE-SHARE-11: renders a rate-limit state instead of a generic connection error', async () => {
    vi.mocked(pasteApi.getPaste).mockRejectedValue(
      new ApiError({
        title: 'Too Many Requests',
        status: 429,
        detail: 'Too many attempts. Try again later.',
        properties: { code: 'RATE_LIMITED' },
      })
    );

    renderAt('/p/public123');

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText(/please check your connection/i)).not.toBeInTheDocument();
  });

  it('FE-SHARE-12: shows the password gate for a masked password-protected paste', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(passwordFixture);

    renderAt('/p/pw123');

    expect(await screen.findByPlaceholderText(/enter unlock passcode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock paste/i })).toBeInTheDocument();
  });

  it('FE-SHARE-13: unavailable paste shows a uniform unavailable state without the title', async () => {
    vi.mocked(pasteApi.getPaste).mockRejectedValue(
      new ApiError({
        title: 'Not Found',
        status: 404,
        detail: 'Paste not found or has expired.',
        properties: { code: 'RESOURCE_NOT_FOUND' },
      })
    );

    renderAt('/p/public123');

    expect(await screen.findByRole('heading', { name: /paste unavailable/i })).toBeInTheDocument();
    expect(screen.queryByText('Public Share Fixture')).not.toBeInTheDocument();
  });
});
