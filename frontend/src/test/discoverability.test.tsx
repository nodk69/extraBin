import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PasteCreatedModal } from '../features/pastes/components/PasteCreatedModal';
import { CreatePastePage } from '../features/pastes/pages/CreatePastePage';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { AppLayout } from '../app/AppLayout';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { ApiError } from '../lib/api-client/client';

// Import raw markdown to verify dynamic rendering in T5.2 (Single Source of Truth)
import encryptedMarkdown from '../../../docs/features/encrypted-pastes.md?raw';
import apiMarkdown from '../../../docs/features/paste-as-api.md?raw';

vi.mock('../lib/confetti', () => ({
  triggerSuccessBurst: vi.fn(),
  triggerConfetti: vi.fn(),
}));

vi.mock('../features/discovery/api/discoveryApi', () => ({
  discoveryApi: {
    getDiscovery: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getPublicPastes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

vi.mock('../features/pastes/api/folderApi', () => ({
  folderApi: {
    getFolders: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    movePaste: vi.fn(),
  },
}));

describe('UI Discoverability Suite (AGENTS.md Phase 2 Red Phase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(pasteApi, 'getPaste');
    window.location.hash = '';
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  // ==========================================
  // TOUCHPOINT 1 — Create page: E2E and API Hints
  // ==========================================
  describe('Touchpoint 1: Create Page E2E & API Hints', () => {
    it('T1.1 e2eToggle_hasTooltip_orHelpText', async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <CreatePastePage />
          </MemoryRouter>
        </AuthProvider>
      );

      // 1. Locate the Enable E2E checkbox and verify tooltip
      const toggle = screen.getByLabelText(/Enable E2E/i);
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveAttribute('title', 'Browser encryption where the server cannot read your content');

      // 2. Locate sibling help text mentioning server blindness, recipient access choice, and no recovery
      const helpText = screen.getByText(/Encrypts content in your browser before upload/i);
      expect(helpText).toBeInTheDocument();
      expect(helpText.textContent).toMatch(/server cannot read/i);
      expect(helpText.textContent).toMatch(/choose how the recipient gets access/i);
      expect(helpText.textContent).toMatch(/no recovery/i);
    });

    it('T1.2 apiHint_visibleNearCreateButton', async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <CreatePastePage />
          </MemoryRouter>
        </AuthProvider>
      );

      // Verify hint near create button
      const apiHint = screen.getByText(/Tip: Unencrypted pastes can be fetched directly as APIs/i);
      expect(apiHint).toBeInTheDocument();
      expect(apiHint.textContent).toMatch(/\.json/i);

      const docsLink = screen.getByRole('link', { name: /API docs/i });
      expect(docsLink).toBeInTheDocument();
      expect(docsLink).toHaveAttribute('href', '/docs');
    });
  });

  // ==========================================
  // TOUCHPOINT 2 — Created Modal: Share Links
  // ==========================================
  describe('Touchpoint 2: Created Modal Share Links', () => {
    it('T2.1 modal_plaintextPaste_showsApiSection', async () => {
      render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="demo-paste-123"
          encryptionMode={null}
        />
      );

      // Expand Advanced accordion to reveal API endpoint
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }));

      // API endpoint row with GET path
      expect(screen.getByText(/GET \/api\/v1\/pastes\/demo-paste-123\.json/i)).toBeInTheDocument();

      // Copy JSON URL button (labeled "JSON")
      const copyBtn = screen.getByRole('button', { name: /^json$/i });
      expect(copyBtn).toBeInTheDocument();

      fireEvent.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pastes/demo-paste-123.json')
      );
    });

    it('T2.2 modal_encryptedPaste_doesNotShowApiSection', () => {
      // Step a: Positive precondition on plaintext paste — MUST fail today in red phase
      const { unmount } = render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="demo-paste-123"
          encryptionMode={null}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
      expect(screen.getByText(/GET \/api\/v1\/pastes\/demo-paste-123\.json/i)).toBeInTheDocument();
      unmount();

      // Step b: Negative assertion on encrypted paste
      render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="enc-paste-456"
          encryptionMode="LINK"
          linkKey="dummyKey"
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
      expect(screen.queryByText(/GET \/api\/v1\/pastes.*\.json/i)).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // TOUCHPOINT 3 — View page: Fetch As Section
  // ==========================================
  describe('Touchpoint 3: View Page Fetch As Section', () => {
    const mockPlaintextPaste = {
      id: 'Y5voMx29AT',
      title: 'Demo Public Paste',
      content: '{"healthy": true}',
      language: 'json',
      visibility: 'PUBLIC',
      contentSizeBytes: 18,
      lineCount: 1,
      isOwner: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null,
      version: 1,
      burnAfterReading: false,
      viewOnce: false,
      passwordProtected: false,
      passwordRequired: false,
      files: [{ id: 1, filename: 'data.json', content: '{"healthy": true}', language: 'json', contentSizeBytes: 18, lineCount: 1, sortOrder: 0 }],
      views: 12,
    };

    it('T3.1 viewPage_plaintextPaste_showsApiUrls', async () => {
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPlaintextPaste as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/Y5voMx29AT']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Demo Public Paste')).toBeInTheDocument();
      });

      // Assert Fetch as section exists
      expect(screen.getByText(/Fetch as/i)).toBeInTheDocument();

      // Assert 6 format buttons exist
      const jsonBtn = screen.getByRole('button', { name: /\.json/i });
      expect(jsonBtn).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\.yaml/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\.md/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\.txt/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\.csv/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\.xml/i })).toBeInTheDocument();

      fireEvent.click(jsonBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/pastes/Y5voMx29AT.json')
      );
    });

    it('T3.2 viewPage_privatePaste_owner_seesApiUrls', async () => {
      const mockPrivatePaste = {
        ...mockPlaintextPaste,
        id: 'priv-123',
        visibility: 'PRIVATE',
        isOwner: true,
      };
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPrivatePaste as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/priv-123']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Demo Public Paste')).toBeInTheDocument();
      });

      expect(screen.getByText(/Fetch as/i)).toBeInTheDocument();
    });

    it('T3.3a viewPage_privatePaste_nonOwner_doesNotSeeApiUrls', async () => {
      // Step a: Positive precondition — owner sees Fetch as on private paste (fails today)
      const mockPrivateOwnerPaste = {
        ...mockPlaintextPaste,
        id: 'priv-owner',
        visibility: 'PRIVATE',
        isOwner: true,
      };
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPrivateOwnerPaste as any);

      const { unmount } = render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/priv-owner']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Fetch as/i)).toBeInTheDocument();
      });
      unmount();

      // Step b: Frontend defensive check — non-owner viewing leaked private paste cannot see Fetch as
      const mockLeakedPrivatePaste = {
        ...mockPlaintextPaste,
        id: 'priv-leaked',
        visibility: 'PRIVATE',
        isOwner: false,
      };
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockLeakedPrivatePaste as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/priv-leaked']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('Demo Public Paste')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Fetch as/i)).not.toBeInTheDocument();
    });

    it('T3.3b viewPage_privatePaste_backend404_doesNotRenderAnything', async () => {
      // Step a: Precondition — plaintext paste shows Fetch as (fails today)
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPlaintextPaste as any);
      const { unmount } = render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/Y5voMx29AT']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByText(/Fetch as/i)).toBeInTheDocument();
      });
      unmount();

      // Step b: Backend returns 404 for unauthenticated non-owner
      vi.spyOn(pasteApi, 'getPaste').mockRejectedValueOnce(
        new ApiError({ status: 404, title: 'Not Found', detail: 'Paste not found or has expired.' })
      );

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/priv-nonowner']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/does not exist, has expired, or was already consumed/i)).toBeInTheDocument();
      });

      expect(screen.queryByText(/Fetch as/i)).not.toBeInTheDocument();
    });

    it('T3.4 viewPage_encryptedPaste_doesNotShowApiUrls', async () => {
      // Step a: Positive precondition on plaintext paste — MUST fail today in red phase
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockPlaintextPaste as any);
      const { unmount } = render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/Y5voMx29AT']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
      await waitFor(() => {
        expect(screen.getByText(/Fetch as/i)).toBeInTheDocument();
      });
      unmount();

      // Step b: Encrypted paste MUST NOT show Fetch as
      const mockEncryptedPaste = {
        ...mockPlaintextPaste,
        id: 'enc-789',
        encryptionMode: 'LINK',
        files: [{ id: 1, filename: 'secret.enc', ciphertext: 'abc', nonce: '123', authTag: 'xyz' }],
      };
      vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce(mockEncryptedPaste as any);

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/enc-789']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/End-to-End Encrypted/i)).toBeInTheDocument();
      });

      expect(screen.queryByText(/Fetch as/i)).not.toBeInTheDocument();
    });
  });

  // ==========================================
  // TOUCHPOINT 4 — Home / Empty State Onboarding
  // ==========================================
  describe('Touchpoint 4: Home Page Features Hint Strip', () => {
    it('T4.1 homePage_hasFeatureHints', () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <CreatePastePage />
          </MemoryRouter>
        </AuthProvider>
      );

      // Locate details element with summary "What can I do?"
      const summary = screen.getByText('What can I do?');
      expect(summary).toBeInTheDocument();

      // Open the collapsible details
      fireEvent.click(summary);

      // Assert the three feature hints become visible
      const encryptedHint = screen.getByText(/Encrypted pastes: Encrypt files in your browser/i);
      expect(encryptedHint).toBeInTheDocument();
      expect(encryptedHint.textContent).toMatch(/server cannot read/i);

      const apiHint = screen.getByText(/Paste as API: Fetch any unencrypted paste as/i);
      expect(apiHint).toBeInTheDocument();
      expect(apiHint.textContent).toMatch(/\.json/i);
    });

    it('T4.2 homePage_docsLink', () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <CreatePastePage />
          </MemoryRouter>
        </AuthProvider>
      );

      const summary = screen.getByText('What can I do?');
      fireEvent.click(summary);

      const docsLink = screen.getByRole('link', { name: /Feature guides →/i });
      expect(docsLink).toBeInTheDocument();
      expect(docsLink).toHaveAttribute('href', '/docs');
    });
  });

  // ==========================================
  // TOUCHPOINT 5 — Docs Link & Markdown Rendering
  // ==========================================
  describe('Touchpoint 5: Navbar & Footer Docs Link', () => {
    it('T5.1 navOrFooter_hasDocsLink', () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <AppLayout />
          </MemoryRouter>
        </AuthProvider>
      );

      // Main navigation contains Docs link
      const mainNav = screen.getByRole('navigation', { name: /Main navigation/i });
      const navDocsLink = screen.getByRole('link', { name: /Docs/i });
      expect(mainNav).toContainElement(navDocsLink);
      expect(navDocsLink).toHaveAttribute('href', '/docs');

      // Footer contains Documentation link
      const footerDocsLink = screen.getByRole('link', { name: /Documentation/i });
      expect(footerDocsLink).toBeInTheDocument();
      expect(footerDocsLink).toHaveAttribute('href', '/docs');
    });

    it('T5.2 docsLink_resolves', async () => {
      // Dynamic import of DocsPage to test router resolution
      const DocsPage = (await import('../features/docs/pages/DocsPage')).default;

      render(
        <MemoryRouter initialEntries={['/docs']}>
          <DocsPage />
        </MemoryRouter>
      );

      // Extract expected headings directly from raw markdown files to prove single source of truth
      const expectedEncryptedHeading = encryptedMarkdown.match(/^#\s+(.+)$/m)?.[1];
      const expectedApiHeading = apiMarkdown.match(/^#\s+(.+)$/m)?.[1];

      expect(expectedEncryptedHeading).toBeTruthy();
      expect(expectedApiHeading).toBeTruthy();

      // Assert headings from the raw markdown files are rendered in the DOM
      expect(
        screen.getByRole('heading', { name: new RegExp(expectedEncryptedHeading!, 'i'), level: 1 })
      ).toBeInTheDocument();

      expect(
        screen.getByRole('heading', { name: new RegExp(expectedApiHeading!, 'i'), level: 1 })
      ).toBeInTheDocument();
    });
  });
});
