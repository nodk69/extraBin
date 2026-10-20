import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { CreatePasteForm } from '../features/pastes/components/CreatePasteForm';
import { PasteCreatedModal } from '../features/pastes/components/PasteCreatedModal';
import { EmbedModal } from '../features/pastes/components/EmbedModal';
import { EmbedPastePage } from '../features/pastes/pages/EmbedPastePage';
import { pasteApi } from '../features/pastes/api/pasteApi';
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

vi.mock('../lib/confetti', () => ({
  triggerConfetti: vi.fn(),
  triggerSuccessBurst: vi.fn(),
}));

vi.mock('../features/dashboard/api/accountApi', () => ({
  accountApi: {
    editPaste: vi.fn(),
    deleteOwnedPaste: vi.fn(),
    getRevisions: vi.fn(),
  },
}));

vi.mock('../features/pastes/api/pasteApi', async () => {
  const actual = await vi.importActual('../features/pastes/api/pasteApi');
  return {
    ...actual,
    pasteApi: {
      ...((actual as any).pasteApi || {}),
      getPaste: vi.fn(),
      getEmbedPaste: vi.fn(),
      downloadZip: vi.fn(),
      downloadFile: vi.fn(),
      getRawBlob: vi.fn(),
      getComments: vi.fn().mockResolvedValue({ pasteId: 'x', totalComments: 0, comments: [] }),
      createComment: vi.fn(),
      deleteComment: vi.fn(),
      getPasteTags: vi.fn().mockResolvedValue([]),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      votePaste: vi.fn(),
      retractPasteVote: vi.fn(),
      starPaste: vi.fn(),
      unstarPaste: vi.fn(),
    },
  };
});

const multiFileFixture: PasteView = {
  id: 'public123',
  title: 'Public Workspace',
  content: 'console.log("index");\n',
  language: 'typescript',
  visibility: 'PUBLIC',
  contentSizeBytes: 21,
  lineCount: 1,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 7,
  files: [
    {
      id: 101,
      filename: 'index.ts',
      content: 'console.log("index");\n',
      language: 'typescript',
      sizeBytes: 21,
      lineCount: 1,
      sortOrder: 0,
    },
    {
      id: 202,
      filename: 'utils.py',
      content: 'def add(a, b):\n    return a + b\n',
      language: 'python',
      sizeBytes: 32,
      lineCount: 2,
      sortOrder: 1,
    },
  ],
};

const unlistedFixture: PasteView = {
  ...multiFileFixture,
  id: 'unlisted123',
  title: 'Unlisted Workspace',
  visibility: 'UNLISTED',
  shareToken: 'shr_token',
};

const privateFixture: PasteView = {
  ...multiFileFixture,
  id: 'private123',
  title: 'Private Workspace',
  visibility: 'PRIVATE',
  isOwner: true,
};

const viewOnceFixture: PasteView = {
  ...multiFileFixture,
  id: 'viewonce123',
  title: 'View Once Workspace',
  viewOnce: true,
  burnAfterReading: true,
};

const passwordChallengeFixture: PasteView = {
  id: 'locked123',
  title: 'Locked Workspace',
  content: '',
  language: 'plaintext',
  visibility: 'PUBLIC',
  contentSizeBytes: 0,
  lineCount: 0,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 1,
  passwordProtected: true,
  passwordRequired: true,
  files: [
    {
      id: 701,
      filename: 'file-1.txt',
      content: '',
      language: 'plaintext',
      sizeBytes: 0,
      lineCount: 0,
      sortOrder: 0,
    },
  ],
};

const unlockedFixture: PasteView = {
  ...passwordChallengeFixture,
  passwordRequired: false,
  content: 'secret-data',
  contentSizeBytes: 11,
  lineCount: 1,
  files: [
    {
      id: 701,
      filename: 'secret.txt',
      content: 'secret-data',
      language: 'plaintext',
      sizeBytes: 11,
      lineCount: 1,
      sortOrder: 0,
    },
  ],
};

const secondFixture: PasteView = {
  ...multiFileFixture,
  id: 'second123',
  title: 'Second Workspace',
};

function renderView(fixture: PasteView = multiFileFixture, path = `/p/${fixture.id}`) {
  vi.mocked(pasteApi.getPaste).mockResolvedValue(fixture);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/p/:id" element={<ViewPastePage />} />
        <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
      </Routes>
    </MemoryRouter>
  );
}

function installClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

function installObjectUrlMocks() {
  const createObjectURL = vi.fn(() => 'blob:server');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL, anchorClick };
}

async function openShareMenu() {
  fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
  return screen.getByRole('menu');
}

describe('Sharing Everywhere UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://bin.example');
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    window.history.replaceState({}, '', '/');
  });

  it('SHARE-UI-01: Share uses the configured public base URL and omits stale tokens for a public paste', async () => {
    window.history.replaceState({}, '', '/p/public123?token=shr_stale');
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);
    renderView(multiFileFixture, '/p/public123?token=shr_stale');

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    const menu = await openShareMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /copy share link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('https://bin.example/p/public123')
    );
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('token='));
  });

  it('SHARE-UI-02: unlisted token and E2E key are preserved only in their required URL components', async () => {
    window.history.replaceState({}, '', '/p/unlisted123?token=shr_token#key=link-secret');
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);
    renderView(unlistedFixture, '/p/unlisted123?token=shr_token');

    await waitFor(() => expect(screen.getByText('Unlisted Workspace')).toBeInTheDocument());
    const menu = await openShareMenu();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /copy share link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'https://bin.example/p/unlisted123?token=shr_token#key=link-secret'
      )
    );
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.indexOf('?token=')).toBeGreaterThan(copied.indexOf('/p/unlisted123'));
    expect(copied.indexOf('#key=')).toBeGreaterThan(copied.indexOf('?token='));
  });

  it('SHARE-UI-03: a private paste has no public share link and explains why', async () => {
    renderView(privateFixture);

    await waitFor(() => expect(screen.getByText('Private Workspace')).toBeInTheDocument());
    const menu = await openShareMenu();
    expect(within(menu).queryByRole('menuitem', { name: /copy share link/i })).not.toBeInTheDocument();
    expect(within(menu).getByText(/private.*(no public link|restricted|only you)/i)).toBeInTheDocument();
  });

  it('SHARE-UI-04: Share exposes raw, download, and Markdown link actions', async () => {
    renderView(multiFileFixture);

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    const menu = await openShareMenu();

    expect(within(menu).getByRole('menuitem', { name: /raw/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /download/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /markdown/i })).toBeInTheDocument();
  });

  it('CLIP-01: clipboard success is announced only after the write promise resolves', async () => {
    let resolveWrite: (value?: unknown) => void = () => {};
    const writeText = vi.fn(
      () => new Promise((resolve) => {
        resolveWrite = resolve;
      })
    );
    installClipboard(writeText);
    renderView(multiFileFixture);

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copy index\.ts/i }));

    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    await act(async () => {
      resolveWrite();
    });
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
  });

  it('CLIP-02: clipboard denial opens the manual-copy dialog, never announces success, and announces failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'));
    installClipboard(writeText);
    renderView(multiFileFixture);

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copy index\.ts/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox')).toHaveValue('console.log("index");\n');
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(/could not copy/i);
  });

  it('DL-01: password-protected download uses persisted server bytes instead of component state', async () => {
    const { createObjectURL, revokeObjectURL } = installObjectUrlMocks();
    vi.mocked(pasteApi.getPaste)
      .mockResolvedValueOnce(passwordChallengeFixture)
      .mockResolvedValueOnce(unlockedFixture);
    (pasteApi as any).downloadFile.mockResolvedValue(new Blob(['server-secret-data']));

    render(
      <MemoryRouter initialEntries={['/p/locked123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Protected Paste')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter unlock passcode/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock paste/i }));

    const content = await screen.findByLabelText(/Content of secret\.txt/i);
    expect((content as HTMLTextAreaElement).value).toBe('secret-data');
    fireEvent.click(screen.getByTitle('Download file'));

    await waitFor(() =>
      expect((pasteApi as any).downloadFile).toHaveBeenCalledWith(
        'locked123',
        701,
        'hunter2',
        undefined
      )
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:server'));
  });

  it('RAW-01: password-protected raw opens server bytes with the password, not the cached textarea value', async () => {
    const { createObjectURL } = installObjectUrlMocks();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ location: { href: '' } } as any);
    vi.mocked(pasteApi.getPaste)
      .mockResolvedValueOnce(passwordChallengeFixture)
      .mockResolvedValueOnce(unlockedFixture);
    (pasteApi as any).getRawBlob.mockResolvedValue(new Blob(['server-raw-data']));

    render(
      <MemoryRouter initialEntries={['/p/locked123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Protected Paste')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter unlock passcode/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock paste/i }));
    await screen.findByLabelText(/Content of secret\.txt/i);

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /raw secret\.txt/i }));

    await waitFor(() =>
      expect((pasteApi as any).getRawBlob).toHaveBeenCalledWith(
        'locked123',
        701,
        'hunter2',
        undefined
      )
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(openSpy).toHaveBeenCalled();
  });

  it('DL-02: a failed server download is announced and no success is claimed', async () => {
    installObjectUrlMocks();
    vi.mocked(pasteApi.getPaste)
      .mockResolvedValueOnce(passwordChallengeFixture)
      .mockResolvedValueOnce(unlockedFixture);
    (pasteApi as any).downloadFile.mockRejectedValue(new Error('download failed'));

    render(
      <MemoryRouter initialEntries={['/p/locked123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Protected Paste')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/Enter unlock passcode/i), {
      target: { value: 'hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /unlock paste/i }));
    await screen.findByLabelText(/Content of secret\.txt/i);

    fireEvent.click(screen.getByTitle('Download file'));
    expect(await screen.findByRole('status')).toHaveTextContent(/download.*failed|could not download/i);
    expect(screen.queryByText(/downloaded/i)).not.toBeInTheDocument();
  });

  it('DL-03: download is disabled with an explanation after a view-once paste is consumed', async () => {
    renderView(viewOnceFixture);

    await waitFor(() => expect(screen.getByText('View Once Workspace')).toBeInTheDocument());
    const download = screen.queryByTitle(/download index\.ts/i);
    if (download) {
      expect(download).toBeDisabled();
    }
    expect(screen.getByText(/download.*unavailable|already.*consumed|view.?once.*download/i)).toBeInTheDocument();
  });

  it('RACE-01: a stale paste response cannot overwrite the currently routed paste', async () => {
    let resolveFirst: (value: PasteView) => void = () => {};
    const firstPromise = new Promise<PasteView>((resolve) => {
      resolveFirst = resolve;
    });
    vi.mocked(pasteApi.getPaste).mockImplementation((id: string) => {
      if (id === 'first123') return firstPromise;
      return Promise.resolve(secondFixture);
    });

    function NavigationHarness() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/p/second123')}>
          go-second
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/p/first123']}>
        <NavigationHarness />
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(pasteApi.getPaste).toHaveBeenCalledWith('first123', undefined, false, undefined));
    fireEvent.click(screen.getByRole('button', { name: 'go-second' }));
    await waitFor(() => expect(screen.getByText('Second Workspace')).toBeInTheDocument());

    await act(async () => {
      resolveFirst({ ...multiFileFixture, id: 'first123', title: 'First Workspace' });
    });
    await waitFor(() => expect(screen.getByText('Second Workspace')).toBeInTheDocument());
    expect(screen.queryByText('First Workspace')).not.toBeInTheDocument();
  });

  it('A11Y-01: overflow menu supports arrow navigation, Escape close, and focus return', async () => {
    renderView(multiFileFixture);

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Secondary actions' });
    const items = within(menu).getAllByRole('menuitem');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Secondary actions' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['PUBLIC', multiFileFixture, /public.*(discover|community)|discover.*public/i],
    ['UNLISTED', unlistedFixture, /unlisted.*(link|discover)|not.*discover/i],
    ['PRIVATE', privateFixture, /private.*(only you|account|restricted)|only you.*private/i],
  ])('VIS-01: %s detail page explains what the visibility means', async (_label, fixture, copy) => {
    renderView(fixture as PasteView);

    await waitFor(() => expect(screen.getByText((fixture as PasteView).title!)).toBeInTheDocument());
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it('VIS-02: creation form keeps the PUBLIC/UNLISTED visibility explanations', async () => {
    render(<CreatePasteForm />);

    expect(screen.getByText(/Public pastes appear in community discovery/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/VISIBILITY_POLICY/i), {
      target: { value: 'UNLISTED' },
    });
    expect(screen.getByText(/Unlisted pastes are hidden from discovery/i)).toBeInTheDocument();
  });

  it('MODAL-01: created-paste modal uses the configured base and preserves token plus key fragment', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard(writeText);

    render(
      <PasteCreatedModal
        isOpen
        onClose={vi.fn()}
        pasteId="new123"
        shareToken="shr_new"
        deletionCapability="del_new"
        encryptionMode="LINK"
        linkKey="link-key"
      />
    );

    // URL display contains paste ID and key fragment indicator
    const urlDisplay = screen.getByLabelText('Shareable paste URL');
    expect(urlDisplay.textContent).toContain('new123');
    expect(urlDisplay.textContent).toContain('#key=');

    // Verify full URL is correctly constructed via clipboard copy
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'https://bin.example/p/new123?token=shr_new#key=link-key'
      )
    );
  });

  it('MODAL-02: created-paste modal clipboard denial never claims success and announces failure', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('blocked')));
    render(
      <PasteCreatedModal isOpen onClose={vi.fn()} pasteId="new123" shareToken="shr_new" />
    );

    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(screen.queryByText('Copied!')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent(/could not copy/i);
  });

  it('EMBED-01: embed snippet uses the configured public base URL and is sandboxed read-only', () => {
    render(
      <EmbedModal isOpen onClose={vi.fn()} pasteId="public123" pasteTitle="Public Workspace" />
    );

    const snippet = screen.getByLabelText(/HTML Embed Code/i);
    expect((snippet as HTMLTextAreaElement).value).toContain(
      'https://bin.example/embed/public123'
    );
    expect((snippet as HTMLTextAreaElement).value).not.toContain('allow-top-navigation');
    expect(screen.getByTitle('Embed Preview')).toHaveAttribute('sandbox');
  });

  it('EMBED-02: embed-modal clipboard denial never claims success and announces failure', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('blocked')));
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });

    render(
      <EmbedModal isOpen onClose={vi.fn()} pasteId="public123" pasteTitle="Public Workspace" />
    );
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }));

    await waitFor(() => expect(screen.queryByText('Copied!')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent(/could not copy/i);
  });

  it('EMBED-03: the embed page is read-only and announces clipboard failure', async () => {
    vi.mocked(pasteApi.getEmbedPaste).mockResolvedValue({
      publicId: 'public123',
      title: 'Public Workspace',
      language: 'typescript',
      createdAt: '2026-10-18T10:00:00Z',
      files: [
        {
          filename: 'index.ts',
          content: 'const x = 1;',
          language: 'typescript',
          sizeBytes: 12,
          lineCount: 1,
          sortOrder: 0,
        },
      ],
    });
    installClipboard(vi.fn().mockRejectedValue(new Error('blocked')));

    render(
      <MemoryRouter initialEntries={['/embed/public123']}>
        <Routes>
          <Route path="/embed/:id" element={<EmbedPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Public Workspace')).toBeInTheDocument());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy snippet code/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/could not copy/i);
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });
});
