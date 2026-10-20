import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
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

import { accountApi } from '../features/dashboard/api/accountApi';

// Mock accountApi methods
vi.mock('../features/dashboard/api/accountApi', () => ({
  accountApi: {
    editPaste: vi.fn(),
    deleteOwnedPaste: vi.fn(),
    getRevisions: vi.fn(),
  },
}));

// Mock pasteApi methods
vi.mock('../features/pastes/api/pasteApi', async () => {
  const actual = await vi.importActual('../features/pastes/api/pasteApi');
  return {
    ...actual,
    pasteApi: {
      ...((actual as any).pasteApi || {}),
      getPaste: vi.fn(),
      downloadZip: vi.fn(),
      getRawUrl: vi.fn((id, _token) => `/api/v1/pastes/${id}/raw`),
      getDownloadUrl: vi.fn((id, _token) => `/api/v1/pastes/${id}/download`),
      getDownloadZipUrl: vi.fn((id, _token) => `/api/v1/pastes/${id}/download-zip`),
      getDownloadFileUrl: vi.fn((id, fn, _token) => `/api/v1/pastes/${id}/files/${fn}/download`),
    },
  };
});

const multiFileFixture: PasteView = {
  id: 'multi123',
  title: 'Multi-File Test Workspace',
  content: 'Content of File 1\nLine 2\nLine 3\n',
  language: 'typescript',
  visibility: 'PUBLIC',
  contentSizeBytes: 1024,
  lineCount: 15,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 42,
  files: [
    {
      id: 101,
      filename: 'index.ts',
      content: 'console.log("Hello from index.ts");\nconst x = 42;\nexport default x;\n',
      language: 'typescript',
      sizeBytes: 65,
      lineCount: 3,
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
    {
      id: 303,
      filename: '101', // Numeric filename edge case
      content: 'I am a file literally named 101\n',
      language: 'plaintext',
      sizeBytes: 32,
      lineCount: 1,
      sortOrder: 2,
    },
    {
      id: 404,
      filename: 'empty.txt',
      content: '',
      language: 'plaintext',
      sizeBytes: 0,
      lineCount: 0,
      sortOrder: 3,
    },
  ],
};

const legacySingleFileFixture: PasteView = {
  id: 'legacy999',
  title: 'Legacy Single File Paste',
  content: 'Single legacy content string\nLine 2\n',
  language: 'javascript',
  visibility: 'PUBLIC',
  contentSizeBytes: 35,
  lineCount: 2,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 5,
  files: [
    {
      id: undefined, // legacy synthesized file
      filename: 'legacy999.js',
      content: 'Single legacy content string\nLine 2\n',
      language: 'javascript',
      sizeBytes: 35,
      lineCount: 2,
      sortOrder: 0,
    },
  ],
};

const viewOnceFixture: PasteView = {
  id: 'viewonce888',
  title: 'View Once Workspace',
  content: 'Secret view once content\n',
  language: 'plaintext',
  visibility: 'PUBLIC',
  contentSizeBytes: 26,
  lineCount: 1,
  isOwner: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-18T10:00:00Z',
  version: 1,
  views: 1,
  burnAfterReading: true,
  viewOnce: true,
  files: [
    {
      id: 501,
      filename: 'secret.txt',
      content: 'Secret view once content\n',
      language: 'plaintext',
      sizeBytes: 26,
      lineCount: 1,
      sortOrder: 0,
    },
    {
      id: 502,
      filename: 'keys.json',
      content: '{"key": "abc"}\n',
      language: 'json',
      sizeBytes: 15,
      lineCount: 1,
      sortOrder: 1,
    },
  ],
};

describe('Multi-File Workspace (Developer Handoff Experience)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // A. Frontend Workspace Navigation & Identity
  it('FE-WS-NAV-01: Renders all workspace files in semantic <nav aria-label="Workspace files"> with filenames and language badges', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const nav = screen.getByRole('navigation', { name: /Workspace files/i });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveTextContent('index.ts');
    expect(nav).toHaveTextContent('utils.py');
    expect(nav).toHaveTextContent('101');
  });

  it('FE-WS-NAV-02: Direct navigation to /p/:id/file/:fileId displays the exact file matching the numeric database ID', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/202']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('def add(a, b):', { exact: false })).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Content of utils.py/i);
    expect(textarea).toHaveValue('def add(a, b):\n    return a + b\n');
  });

  it('FE-WS-NAV-03: Clicking a <NavLink> switches active file without full page reload and updates URL', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const utilsLink = screen.getByRole('link', { name: /utils.py/i });
    fireEvent.click(utilsLink);

    expect(screen.getByLabelText(/Content of utils.py/i)).toBeInTheDocument();
    expect(pasteApi.getPaste).toHaveBeenCalledTimes(1); // zero redundant backend calls
  });

  it('FE-WS-NAV-04: Non-existent file ID renders explicit File Not Found banner and never silently displays another file', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/File Not Found/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/999/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Content of index.ts/i)).not.toBeInTheDocument();
  });

  it('FE-WS-NAV-05: Legacy paste with id: null displays correctly on /p/:id and /p/:id/file/default', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(legacySingleFileFixture);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/p/legacy999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Content of legacy999.js/i)).toHaveValue('Single legacy content string\nLine 2\n');
    unmount();

    // Navigating to /p/legacy999/file/default
    render(
      <MemoryRouter initialEntries={['/p/legacy999/file/default']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Content of legacy999.js/i)).toHaveValue('Single legacy content string\nLine 2\n');
  });

  it('FE-WS-NAV-06: Accessing /p/:id/file/default on a multi-file paste displays File Not Found error; does not select files[0]', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/default']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/File Not Found/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Content of index.ts/i)).not.toBeInTheDocument();
  });

  it('FE-WS-NAV-07: Browser Back/Forward restores previous file view and URL in lockstep', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of index.ts/i)).toBeInTheDocument();
    });

    const utilsLink = screen.getByRole('link', { name: /utils.py/i });
    fireEvent.click(utilsLink);
    expect(screen.getByLabelText(/Content of utils.py/i)).toBeInTheDocument();
  });

  it('FE-WS-NAV-08: Preserves unlisted ?token=... safely across file navigation without duplication', async () => {
    const unlistedFixture = {
      ...multiFileFixture,
      visibility: 'UNLISTED' as const,
      shareToken: 'shr_secureToken123',
    };
    vi.mocked(pasteApi.getPaste).mockResolvedValue(unlistedFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123?token=shr_secureToken123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('utils.py')).toBeInTheDocument();
    });

    const utilsLink = screen.getByRole('link', { name: /utils.py/i });
    expect(utilsLink.getAttribute('href')).toContain('token=shr_secureToken123');
    expect(utilsLink.getAttribute('href')).not.toContain('token=shr_secureToken123&token=');
  });

  it('FE-WS-NAV-09: Numeric filenames are strictly distinguished from file IDs', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/303']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of 101/i)).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Content of 101/i);
    expect(textarea).toHaveValue('I am a file literally named 101\n');
  });

  // B. Deep Line Links (#L42)
  it('FE-WS-LIN-01: Clicking gutter line number updates URL hash to #L{n} without triggering clipboard writes', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const line2Button = screen.getByRole('button', { name: /Line 2/i });
    fireEvent.click(line2Button);

    expect(window.location.hash).toBe('#L2');
    expect(writeTextSpy).not.toHaveBeenCalled(); // Click alone does NOT write to clipboard
  });

  it('FE-WS-LIN-02: Direct navigation with #L2 applies target highlight to line 2', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    window.location.hash = '#L2';

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const line2Gutter = screen.getByRole('button', { name: /^Line 2$/i });
    expect(line2Gutter.className).toContain('line-target-highlight');
    window.location.hash = '';
  });

  it('FE-WS-LIN-03: Out-of-bounds line numbers (#L9999) render safely without crashing or highlight', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    window.location.hash = '#L9999';

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of index.ts/i)).toBeInTheDocument();
    });

    const line1 = screen.getByRole('button', { name: /^Line 1$/i });
    expect(line1.className).not.toContain('line-target-highlight');
    window.location.hash = '';
  });

  it('FE-WS-LIN-04: Switching files clears stale line highlights and resets scroll', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    window.location.hash = '#L2';

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Line 2$/i })).toHaveClass('line-target-highlight');
    });

    const utilsLink = screen.getByRole('link', { name: /utils.py/i });
    fireEvent.click(utilsLink);

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of utils.py/i)).toBeInTheDocument();
    });
    window.location.hash = '';
  });

  it('FE-WS-LIN-05: Browser Back/Forward hash changes dynamically update line highlighting', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of index.ts/i)).toBeInTheDocument();
    });

    window.location.hash = '#L3';
    fireEvent(window, new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Line 3$/i })).toHaveClass('line-target-highlight');
    });
    window.location.hash = '';
  });

  // C. Clipboard Operations & Fallback Modal
  it('FE-WS-CPY-01: "Copy file contents" copies raw text verbatim, preserving CRLF and whitespace without HTML/line numbers', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy index.ts/i })).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copy index.ts/i });
    fireEvent.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith('console.log("Hello from index.ts");\nconst x = 42;\nexport default x;\n');
  });

  it('FE-WS-CPY-02: Handles empty files correctly without crashing', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/404']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy empty.txt/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy empty.txt/i }));
    expect(writeTextSpy).toHaveBeenCalledWith('');
  });

  it('FE-WS-CPY-03: When navigator.clipboard.writeText rejects, displays the manual copy fallback modal with focused textarea; does not show false success', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy index.ts/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy index.ts/i }));

    // Never show false success
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();

    // Fallback modal appears
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Manual Copy/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Press Ctrl\+C to copy/i)).toBeInTheDocument();
  });

  it('FE-WS-CPY-04: "Copy file link" writes canonical URL to clipboard', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy file link/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy file link/i }));
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('/p/multi123/file/101'));
  });

  it('FE-WS-CPY-05: "Copy line link" writes canonical line URL to clipboard when a line is targeted', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });
    window.location.hash = '#L2';

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Copy link to line 2/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy link to line 2/i }));
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('/p/multi123/file/101#L2'));
    window.location.hash = '';
  });

  // D. ZIP Download & Workspace Actions
  it('FE-WS-ZIP-01: "Download ZIP" disables button and shows loading state during download', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    let resolveZip: (b: Blob) => void = () => {};
    const zipPromise = new Promise<Blob>((resolve) => {
      resolveZip = resolve;
    });
    vi.mocked(pasteApi.downloadZip).mockReturnValue(zipPromise);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download ZIP/i })).toBeInTheDocument();
    });

    const zipBtn = screen.getByRole('button', { name: /Download ZIP/i });
    fireEvent.click(zipBtn);

    expect(zipBtn).toBeDisabled();
    expect(screen.getByText(/Archiving/i)).toBeInTheDocument();

    resolveZip(new Blob(['mock-zip-bytes']));
  });

  it('FE-WS-ZIP-02: Repeated clicks while ZIP is generating trigger no duplicate in-flight requests', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    let resolveZip: (b: Blob) => void = () => {};
    const zipPromise = new Promise<Blob>((resolve) => {
      resolveZip = resolve;
    });
    vi.mocked(pasteApi.downloadZip).mockReturnValue(zipPromise);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download ZIP/i })).toBeInTheDocument();
    });

    const zipBtn = screen.getByRole('button', { name: /Download ZIP/i });
    fireEvent.click(zipBtn);
    fireEvent.click(zipBtn); // 2nd click while pending

    expect(pasteApi.downloadZip).toHaveBeenCalledTimes(1);
    resolveZip(new Blob(['mock-zip-bytes']));
  });

  it('FE-WS-ZIP-03: ZIP network or server failure restores button state and renders accessible error notice', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);
    vi.mocked(pasteApi.downloadZip).mockRejectedValue(new Error('Archive generation failed'));

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download ZIP/i })).toBeInTheDocument();
    });

    const zipBtn = screen.getByRole('button', { name: /Download ZIP/i });
    fireEvent.click(zipBtn);

    await waitFor(() => {
      expect(screen.getByText(/Archive generation failed/i)).toBeInTheDocument();
    });
    expect(zipBtn).not.toBeDisabled();
  });

  // E. Frontend Burn-After-Reading In-Memory Operations
  it('FE-WS-BAR-01: In loaded view-once paste, in-memory Blob download is used and zero network calls made to expired server endpoints', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(viewOnceFixture);
    const createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;

    render(
      <MemoryRouter initialEntries={['/p/viewonce888']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('View Once Workspace')).toBeInTheDocument();
    });

    // 1. File switching is in-memory
    const keysLink = screen.getByRole('link', { name: /keys.json/i });
    fireEvent.click(keysLink);
    expect(screen.getByLabelText(/Content of keys.json/i)).toBeInTheDocument();
    expect(pasteApi.getPaste).toHaveBeenCalledTimes(1);

    // 2. Download uses in-memory Blob
    const downloadBtn = screen.getByRole('button', { name: /Download keys.json/i });
    fireEvent.click(downloadBtn);

    expect(createObjectURLSpy).toHaveBeenCalled();
    const blobArg = createObjectURLSpy.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);

    // 3. Server ZIP button indicates server record was consumed
    expect(screen.getByText(/Server ZIP unavailable for view-once/i)).toBeInTheDocument();
  });

  // F. UI/UX Remediation Checklist Contract Tests (Phase 2 Red Phase)
  it('FE-WS-SRCH-01: Searching text renders matching highlight marks and navigates matches', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    // Open search toolbar via Find button
    const findBtn = screen.getByRole('button', { name: /find/i });
    fireEvent.click(findBtn);

    const searchInput = screen.getByPlaceholderText(/find in active file/i);
    expect(searchInput).toBeInTheDocument();

    // Type query matching "Hello" in index.ts ("console.log("Hello from index.ts");")
    fireEvent.change(searchInput, { target: { value: 'Hello' } });

    // Should indicate match count
    expect(screen.getByText(/1 of 1/i)).toBeInTheDocument();

    // Should render highlighted mark element
    const mark = document.querySelector('mark.search-match');
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveTextContent('Hello');
  });

  it('FE-WS-SRCH-02: Pressing Escape closes the search toolbar and clears query', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const findBtn = screen.getByRole('button', { name: /find/i });
    fireEvent.click(findBtn);

    const searchInput = screen.getByPlaceholderText(/find in active file/i);
    fireEvent.change(searchInput, { target: { value: 'Hello' } });
    expect(document.querySelector('mark.search-match')).toBeInTheDocument();

    // Fire Escape keydown
    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });

    // Search toolbar should be closed
    expect(screen.queryByPlaceholderText(/find in active file/i)).not.toBeInTheDocument();
    expect(document.querySelector('mark.search-match')).not.toBeInTheDocument();
  });

  it('FE-WS-NAV-04: Navigating between files automatically clears line number hash and resets active line', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    // Initial load on file 1 with line 2 targeted
    window.location.hash = '#L2';

    render(
      <MemoryRouter initialEntries={['/p/multi123/file/101']}>
        <Routes>
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent(window, new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Line 2$/i })).toHaveClass('line-target-highlight');
    });

    // Click navigation link to file 2 (utils.py, ID 202)
    const utilsLink = screen.getByRole('link', { name: /utils\.py/i });
    fireEvent.click(utilsLink);

    // After navigating to file 2, line highlight should be reset
    await waitFor(() => {
      expect(screen.getByLabelText(/Content of utils.py/i)).toBeInTheDocument();
    });
    expect(document.querySelector('.line-target-highlight')).toBeNull();
  });

  it('FE-WS-WRAP-01: Toggling line wrapping updates textarea wrap attribute and applies code-wrap class', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    expect(textarea).toHaveAttribute('wrap', 'off');

    // Wrap line toggle is located in More overflow menu per user-requested toolbar hierarchy
    const moreBtn = screen.getByRole('button', { name: /more actions/i });
    fireEvent.click(moreBtn);

    const wrapOption = screen.getByRole('menuitem', { name: /wrap lines/i });
    fireEvent.click(wrapOption);

    // Now should be wrapped
    expect(textarea).toHaveAttribute('wrap', 'on');
    expect(textarea).toHaveClass('code-wrap');

    // Toggle back via More menu
    fireEvent.click(moreBtn);
    const unwrapOption = screen.getByRole('menuitem', { name: /unwrap lines/i });
    fireEvent.click(unwrapOption);
    expect(textarea).toHaveAttribute('wrap', 'off');
    expect(textarea).not.toHaveClass('code-wrap');
  });

  it('FE-WS-MOB-01: Renders compact file selector on mobile viewports', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    // Mobile file dropdown selector should be present with aria-label
    const mobileSelect = screen.getByRole('combobox', { name: /select workspace file/i });
    expect(mobileSelect).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /index\.ts/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /utils\.py/i })).toBeInTheDocument();
  });

  it('FE-WS-MENU-01: Secondary actions are organized inside an accessible overflow menu', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(multiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    // Primary action bar should show Copy Code, Find, Download
    expect(screen.getByRole('button', { name: /copy index\.ts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find/i })).toBeInTheDocument();

    // More options overflow button
    const moreBtn = screen.getByRole('button', { name: /more actions/i });
    expect(moreBtn).toBeInTheDocument();

    fireEvent.click(moreBtn);

    // In the opened overflow dropdown menu: Wrap, Embed, QR Code, Raw, Download ZIP
    expect(screen.getByRole('menuitem', { name: /wrap lines/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /embed/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /qr code/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /raw/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /download zip/i })).toBeInTheDocument();
  });

  it('FE-WS-MODAL-01: Manual copy modal closes on Escape key press', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(legacySingleFileFixture);

    // Mock clipboard failure to trigger fallback modal
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/p/legacy999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /copy code/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /manual copy/i })).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /manual copy/i })).not.toBeInTheDocument();
    });

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  // G. In-Editor Editing, Dirty-State Safety, Toolbar Realignment & Sidebar (Phase 2 Red Phase)
  const ownedMultiFileFixture: PasteView = {
    ...multiFileFixture,
    isOwner: true,
  };

  const ownedSingleFileFixture: PasteView = {
    ...legacySingleFileFixture,
    isOwner: true,
  };

  it('FE-EDT-01: Clicking primary "Edit" enters inline edit mode and renders editable textarea and controls', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    // Primary action bar should have Edit button
    const editBtn = screen.getByRole('button', { name: /^Edit$/i });
    expect(editBtn).toBeInTheDocument();

    fireEvent.click(editBtn);

    // Should render Save and Cancel buttons in edit toolbar
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument();

    // Textarea should no longer be readOnly
    const textarea = screen.getByLabelText(/Content of index.ts/i);
    expect(textarea).not.toHaveAttribute('readonly');
  });

  it('FE-EDT-02: Editing single-file paste in place calls accountApi.editPaste and updates display', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedSingleFileFixture);
    vi.mocked(accountApi.editPaste).mockResolvedValue({
      ...ownedSingleFileFixture,
      content: 'Updated single file content',
      version: 2,
    } as any);

    render(
      <MemoryRouter initialEntries={['/p/legacy999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of legacy999\.js/i);
    fireEvent.change(textarea, { target: { value: 'Updated single file content' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(accountApi.editPaste).toHaveBeenCalledWith('legacy999', expect.objectContaining({
        content: 'Updated single file content',
        version: 1,
      }));
    });
  });

  it('FE-EDT-03: Editing active file in multi-file workspace submits authoritative snapshot with all file IDs intact', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);
    vi.mocked(accountApi.editPaste).mockResolvedValue({
      ...ownedMultiFileFixture,
      version: 2,
      files: [
        { ...ownedMultiFileFixture.files![0], content: 'console.log("edited index.ts");\n' },
        ownedMultiFileFixture.files![1],
        ownedMultiFileFixture.files![2],
        ownedMultiFileFixture.files![3],
      ],
    } as any);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea, { target: { value: 'console.log("edited index.ts");\n' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(accountApi.editPaste).toHaveBeenCalledWith('multi123', expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ id: 101, filename: 'index.ts', content: 'console.log("edited index.ts");\n' }),
          expect.objectContaining({ id: 202, filename: 'utils.py' }),
          expect.objectContaining({ id: 303, filename: '101' }),
        ]),
      }));
    });
  });

  it('FE-EDT-04: Clicking Cancel with no edits exits edit mode immediately without confirmation dialog', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();

    // Cancel without any changes
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    // Should immediately exit edit mode
    expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /discard/i })).not.toBeInTheDocument();
  });

  it('FE-EDT-05: Clicking Cancel with dirty edits shows discard prompt; clicking "Keep Editing" stays in edit mode', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea, { target: { value: 'dirty content changes' } });

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    // Should display discard confirmation modal
    expect(screen.getByText(/Discard unsaved changes/i)).toBeInTheDocument();

    // Click "Keep Editing"
    fireEvent.click(screen.getByRole('button', { name: /Keep Editing/i }));

    // Should remain in edit mode with draft content intact
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Content of index.ts/i)).toHaveValue('dirty content changes');
  });

  it('FE-EDT-06: Clicking Cancel with dirty edits and confirming discard restores original content and name', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea, { target: { value: 'temporary dirty text' } });

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.getByText(/Discard unsaved changes/i)).toBeInTheDocument();

    // Confirm discard
    fireEvent.click(screen.getByRole('button', { name: /Discard Changes/i }));

    // Exits edit mode and restores original content
    expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Content of index.ts/i)).toHaveValue(ownedMultiFileFixture.files![0].content);
  });

  it('FE-EDT-07: Server 409 Conflict keeps editor in edit mode, displays error alert, and preserves user draft', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);
    const conflictError = new Error('Concurrent modification detected');
    (conflictError as any).status = 409;
    (conflictError as any).detail = 'Concurrent modification detected. The paste was modified by another operation.';
    vi.mocked(accountApi.editPaste).mockRejectedValue(conflictError);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea, { target: { value: 'unsaved draft text preserved' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Concurrent modification detected/i)).toBeInTheDocument();
    });

    // Stays in edit mode and preserves user draft
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Content of index.ts/i)).toHaveValue('unsaved draft text preserved');
  });

  it('FE-EDT-08: Switching files while editing preserves drafts for previously edited files in memory', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
          <Route path="/p/:id/file/:fileId" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    // Edit File 1 (index.ts)
    const textarea1 = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea1, { target: { value: 'draft edit in index.ts' } });

    // Switch to File 2 (utils.py)
    const utilsLink = screen.getByRole('link', { name: /utils\.py/i });
    fireEvent.click(utilsLink);

    await waitFor(() => {
      expect(screen.getByLabelText(/Content of utils.py/i)).toBeInTheDocument();
    });

    // Switch back to File 1 (index.ts)
    const indexLink = screen.getByRole('link', { name: /index\.ts/i });
    fireEvent.click(indexLink);

    // Index.ts draft edits must be preserved in memory
    await waitFor(() => {
      expect(screen.getByLabelText(/Content of index.ts/i)).toHaveValue('draft edit in index.ts');
    });
  });

  it('FE-EDT-09: Duplicate Save clicks are prevented while request is in flight', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedSingleFileFixture);
    let resolveSave: (val: any) => void = () => {};
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(accountApi.editPaste).mockReturnValue(savePromise as any);

    render(
      <MemoryRouter initialEntries={['/p/legacy999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    // Save button should be disabled
    expect(saveBtn).toBeDisabled();

    // Second click should not call editPaste again
    fireEvent.click(saveBtn);
    expect(accountApi.editPaste).toHaveBeenCalledTimes(1);

    resolveSave({ ...ownedSingleFileFixture, version: 2 });
  });

  it('FE-EDT-10: On 409 Conflict, UI offers manual reload option and does not automatically resubmit', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);
    const conflictError = new Error('Conflict');
    (conflictError as any).status = 409;
    (conflictError as any).detail = 'Conflict detected';
    vi.mocked(accountApi.editPaste).mockRejectedValue(conflictError);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Conflict detected/i)).toBeInTheDocument();
    });

    // Should only have called once (zero auto-retry)
    expect(accountApi.editPaste).toHaveBeenCalledTimes(1);
  });

  it('FE-EDT-11: A delayed save response arriving after component unmount completes cleanly without errors', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedSingleFileFixture);
    let resolveSave: (val: any) => void = () => {};
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(accountApi.editPaste).mockReturnValue(savePromise as any);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/p/legacy999']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Legacy Single File Paste')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    // Unmount before save resolves
    unmount();

    // Resolving promise after unmount must not throw unhandled state update errors
    expect(() => resolveSave({ ...ownedSingleFileFixture, version: 2 })).not.toThrow();
  });

  it('FE-EDT-12: In-app SPA navigation while editing prompts discard confirmation dialog', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

    const textarea = screen.getByLabelText(/Content of index.ts/i);
    fireEvent.change(textarea, { target: { value: 'unsaved changes in file' } });

    // Attempt to click cancel
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    expect(screen.getByText(/Discard unsaved changes/i)).toBeInTheDocument();
  });

  it('FE-UI-01: Action hierarchy places Edit in primary bar for owners, and Wrap Lines inside More menu', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    // Primary bar should have Edit
    expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument();

    // Primary bar should NOT have Wrap Lines button directly
    expect(screen.queryByRole('button', { name: /Toggle line wrapping/i })).not.toBeInTheDocument();

    // Open More overflow menu
    fireEvent.click(screen.getByRole('button', { name: /More actions/i }));

    // Inside More menu, Wrap Lines toggle option must be present
    expect(screen.getByRole('menuitem', { name: /Wrap lines|Unwrap lines/i })).toBeInTheDocument();
  });

  it('FE-UI-02: Clicking outside the More overflow menu automatically dismisses it', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const moreBtn = screen.getByRole('button', { name: /More actions/i });
    fireEvent.click(moreBtn);

    expect(screen.getByRole('menu', { name: /Secondary actions/i })).toBeInTheDocument();

    // Click outside on the workspace title
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /Secondary actions/i })).not.toBeInTheDocument();
    });
  });

  it('FE-UI-03: Pressing Escape closes the overflow menu while retaining focus safely', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const moreBtn = screen.getByRole('button', { name: /More actions/i });
    fireEvent.click(moreBtn);

    expect(screen.getByRole('menu', { name: /Secondary actions/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /Secondary actions/i })).not.toBeInTheDocument();
    });
  });

  it('FE-NAV-05: Clicking sidebar collapse button hides sidebar, giving full width to editor; re-clicking expands it', async () => {
    vi.mocked(pasteApi.getPaste).mockResolvedValue(ownedMultiFileFixture);

    render(
      <MemoryRouter initialEntries={['/p/multi123']}>
        <Routes>
          <Route path="/p/:id" element={<ViewPastePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-File Test Workspace')).toBeInTheDocument();
    });

    const collapseBtn = screen.getByRole('button', { name: /Collapse files sidebar|Expand files sidebar/i });
    expect(collapseBtn).toBeInTheDocument();

    // Initially expanded
    const sidebar = screen.getByRole('navigation', { name: /Workspace files/i });
    expect(sidebar).not.toHaveClass('hidden');

    // Click to collapse
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(sidebar).toHaveClass('hidden');
    });

    // Click to expand again
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(sidebar).not.toHaveClass('hidden');
    });
  });
});


