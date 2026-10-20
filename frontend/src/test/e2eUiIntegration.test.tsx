import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { PasteCreatedModal } from '../features/pastes/components/PasteCreatedModal';
import { CreatePastePage } from '../features/pastes/pages/CreatePastePage';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { encryptPaste, type InputFile } from '../lib/crypto/e2ePaste';

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

describe('Deliverable 4: E2E Frontend UI Integration', { timeout: 45000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  // --- 1. PasteCreatedModal Component Tests ---
  describe('PasteCreatedModal E2E States', () => {
    it('renders LINK mode URL with #key= fragment, encrypted header, and client-side warning banner', () => {
      render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="link-paste-123"
          encryptionMode="LINK"
          linkKey="abcdef1234567890abcdef1234567890"
          isPassphraseProtected={false}
        />
      );

      // Verify encrypted header title
      expect(screen.getByText(/Encrypted paste ready/i)).toBeInTheDocument();

      // Verify share URL display contains the paste ID and key fragment indicator
      const urlDisplay = screen.getByLabelText('Shareable paste URL');
      expect(urlDisplay.textContent).toContain('link-paste-123');
      expect(urlDisplay.textContent).toContain('#key=');

      // Verify security note about fragment
      expect(
        screen.getByText(/decryption key lives in the URL fragment/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/server never sees it/i)
      ).toBeInTheDocument();
    });

    it('renders segmented share control and guidance when LINK mode is passphrase-wrapped', () => {
      render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="dual-paste-456"
          encryptionMode="LINK"
          linkKey="wrappedKeyFrag123"
          isPassphraseProtected={true}
        />
      );

      // Verify encrypted header title
      expect(screen.getByText(/Encrypted paste ready/i)).toBeInTheDocument();

      // Verify segmented share-mode control is present (One link / Link and key apart)
      expect(screen.getByRole('button', { name: /one link/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /link and key apart/i })).toBeInTheDocument();

      // Verify security note about URL fragment
      expect(
        screen.getByText(/decryption key lives in the URL fragment/i)
      ).toBeInTheDocument();
    });

    it('renders PASSPHRASE mode header without #key= in share URL', () => {
      render(
        <PasteCreatedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="pass-paste-789"
          encryptionMode="PASSPHRASE"
          linkKey={null}
          isPassphraseProtected={true}
        />
      );

      // Verify encrypted header title
      expect(screen.getByText(/Encrypted paste ready/i)).toBeInTheDocument();

      // Verify URL does NOT have #key=
      const urlDisplay = screen.getByLabelText('Shareable paste URL');
      expect(urlDisplay.textContent).toContain('pass-paste-789');
      expect(urlDisplay.textContent).not.toContain('#key=');

      // Verify passphrase guidance banner
      expect(screen.getByText(/separate channel/i)).toBeInTheDocument();
      expect(
        screen.getAllByText(/link alone cannot decrypt/i).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // --- 2. CreatePastePage E2E Creation Flow ---
  describe('CreatePastePage E2E Creation Flow', () => {
    it('submits LINK mode paste via createEncryptedPaste with client-side encrypted files', async () => {
      const mockCreateEncrypted = vi.spyOn(pasteApi, 'createEncryptedPaste').mockResolvedValueOnce({
        id: 'encrypted-paste-abc',
        title: 'Secret Code',
        language: 'javascript',
        visibility: 'UNLISTED',
        createdAt: '2026-10-18T00:00:00Z',
        contentSizeBytes: 100,
        lineCount: 1,
        deletionCapability: 'del-capability-token',
        encryptionMode: 'LINK',
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <CreatePastePage />
          </AuthProvider>
        </BrowserRouter>
      );

      // Enable E2E toggle
      const e2eToggle = screen.getByLabelText(/Enable E2E/i);
      fireEvent.click(e2eToggle);

      // Verify E2E mode buttons appear
      expect(screen.getByRole('button', { name: /Link Key/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Passphrase/i })).toBeInTheDocument();

      // Click Create paste
      const publishBtn = screen.getByRole('button', { name: /Create paste/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(mockCreateEncrypted).toHaveBeenCalledTimes(1);
      });

      const payload = mockCreateEncrypted.mock.calls[0][0];
      expect(payload.encryptionMode).toBe('LINK');
      expect(payload.files.length).toBe(1);
      // Ensure file payload is encrypted (has ciphertext, nonce, authTag, no plaintext)
      expect(payload.files[0].ciphertext).toBeDefined();
      expect(payload.files[0].nonce).toBeDefined();
      expect(payload.files[0].authTag).toBeDefined();
      expect((payload.files[0] as any).content).toBeUndefined();

      // Verify created modal is rendered with encrypted header
      await waitFor(() => {
        expect(screen.getByText(/Encrypted paste ready/i)).toBeInTheDocument();
      });

      mockCreateEncrypted.mockRestore();
    });

    it('validates required passphrase when PASSPHRASE mode is selected and submits correctly', async () => {
      const mockCreateEncrypted = vi.spyOn(pasteApi, 'createEncryptedPaste').mockResolvedValueOnce({
        id: 'pass-mode-paste-xyz',
        title: 'Passphrase Vault',
        language: 'plaintext',
        visibility: 'UNLISTED',
        createdAt: '2026-10-18T00:00:00Z',
        contentSizeBytes: 120,
        lineCount: 1,
        deletionCapability: 'del-tok-pass',
        encryptionMode: 'PASSPHRASE',
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <CreatePastePage />
          </AuthProvider>
        </BrowserRouter>
      );

      // Enable E2E toggle
      const e2eToggle = screen.getByLabelText(/Enable E2E/i);
      fireEvent.click(e2eToggle);

      // Switch mode to PASSPHRASE
      const passphraseModeBtn = screen.getByRole('button', { name: /Passphrase/i });
      fireEvent.click(passphraseModeBtn);

      // Try publishing without passphrase -> error should be shown
      const publishBtn = screen.getByRole('button', { name: /Create paste/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByText(/Passphrase is required for Passphrase-only E2E encryption mode/i)).toBeInTheDocument();
      });
      expect(mockCreateEncrypted).not.toHaveBeenCalled();

      // Enter passphrase into the E2E passphrase input
      const passphraseInput = screen.getByPlaceholderText(/Enter secret passphrase\.\.\./i);
      fireEvent.change(passphraseInput, { target: { value: 'Correct-Horse-Battery-Staple-99' } });

      // Submit again
      fireEvent.click(publishBtn);

      await waitFor(
        () => {
          expect(mockCreateEncrypted).toHaveBeenCalledTimes(1);
        },
        { timeout: 15000 }
      );

      const payload = mockCreateEncrypted.mock.calls[0][0];
      expect(payload.encryptionMode).toBe('PASSPHRASE');
      expect(payload.wrappedKey).toBeNull();
      expect(payload.kdfSalt).toBeDefined();
      expect(payload.kdfIterations).toBe(600000);

      // Verify modal opened with encrypted header
      await waitFor(() => {
        expect(screen.getByText(/Encrypted paste ready/i)).toBeInTheDocument();
      });

      mockCreateEncrypted.mockRestore();
    });
  });

  // --- 3. ViewPastePage E2E Decryption Flow ---
  describe('ViewPastePage E2E Decryption Flow', () => {
    it('auto-decrypts LINK mode paste when #key= is present in URL fragment', async () => {
      // 1. First encrypt a sample file using real Web Crypto to get valid ciphertexts
      const inputFiles: InputFile[] = [{ filename: 'secret.js', data: 'console.log("e2e-decrypted-secret");' }];
      const encrypted = await encryptPaste(inputFiles, { mode: 'LINK', pasteId: 'auto-paste-1' });

      // Mock pasteApi.getPaste to return the encrypted paste view
      const mockGetPaste = vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce({
        id: 'auto-paste-1',
        title: 'Auto Decrypt Test',
        language: 'javascript',
        visibility: 'UNLISTED',
        createdAt: '2026-10-18T00:00:00Z',
        contentSizeBytes: 100,
        lineCount: 1,
        encryptionMode: 'LINK',
        kdfSalt: encrypted.dto.kdfSalt,
        kdfIterations: encrypted.dto.kdfIterations,
        wrappedKey: encrypted.dto.wrappedKey,
        files: encrypted.dto.files.map((f, idx) => ({
          id: idx + 1,
          filename: f.filenameHint || 'secret.js',
          content: '',
          nonce: f.nonce,
          ciphertext: f.ciphertext,
          authTag: f.authTag,
          contentSizeBytes: 50,
          lineCount: 1,
          sortOrder: idx,
          language: 'javascript',
        })),
      } as any);

      // Set window.location.hash with the secret link key
      window.location.hash = `#key=${encrypted.linkKey}`;

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/auto-paste-1']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      // Verify auto-decrypted content appears in textarea
      await waitFor(() => {
        expect(screen.getByDisplayValue(/e2e-decrypted-secret/i)).toBeInTheDocument();
      });

      // Verify E2E badge is displayed
      expect(screen.getByText(/End-to-End Encrypted/i)).toBeInTheDocument();

      mockGetPaste.mockRestore();
    });

    it('shows manual decryption gate for PASSPHRASE mode, reports telemetry on failure, and decrypts on success', { timeout: 30000 }, async () => {
      const inputFiles: InputFile[] = [{ filename: 'notes.txt', data: 'Secret vault classified contents' }];
      const passphrase = 'MySuperSecurePassphrase2026!';
      const encrypted = await encryptPaste(inputFiles, {
        mode: 'PASSPHRASE',
        passphrase,
        pasteId: 'pass-gate-paste',
      });

      const mockGetPaste = vi.spyOn(pasteApi, 'getPaste').mockResolvedValueOnce({
        id: 'pass-gate-paste',
        title: 'Classified Vault',
        language: 'plaintext',
        visibility: 'UNLISTED',
        createdAt: '2026-10-18T00:00:00Z',
        contentSizeBytes: 100,
        lineCount: 1,
        encryptionMode: 'PASSPHRASE',
        kdfSalt: encrypted.dto.kdfSalt,
        kdfIterations: encrypted.dto.kdfIterations,
        wrappedKey: null,
        files: encrypted.dto.files.map((f, idx) => ({
          id: idx + 1,
          filename: f.filenameHint || 'notes.txt',
          content: '',
          nonce: f.nonce,
          ciphertext: f.ciphertext,
          authTag: f.authTag,
          contentSizeBytes: 50,
          lineCount: 1,
          sortOrder: idx,
          language: 'plaintext',
        })),
      } as any);

      const mockReportFailed = vi.spyOn(pasteApi, 'reportDecryptFailed').mockResolvedValue();

      // No hash in URL
      window.location.hash = '';

      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/p/pass-gate-paste']}>
            <Routes>
              <Route path="/p/:id" element={<ViewPastePage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      // Verify manual decryption gate is displayed
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /End-to-End Encrypted/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Enter unlock passphrase\.\.\./i)).toBeInTheDocument();
      });

      const passphraseInput = screen.getByPlaceholderText(/Enter unlock passphrase\.\.\./i);
      const decryptBtn = screen.getByRole('button', { name: /Decrypt Paste/i });
      const decryptForm = decryptBtn.closest('form')!;

      // Step 1: Submit incorrect passphrase
      fireEvent.change(passphraseInput, { target: { value: 'WrongPassword123' } });
      fireEvent.submit(decryptForm);

      // Verify error shown and telemetry called
      await waitFor(
        () => {
          expect(screen.getByText(/Decryption failed\. Incorrect passphrase or key\./i)).toBeInTheDocument();
          expect(mockReportFailed).toHaveBeenCalledWith('pass-gate-paste');
        },
        { timeout: 15000 }
      );

      // Step 2: Submit correct passphrase
      fireEvent.change(passphraseInput, { target: { value: passphrase } });
      fireEvent.submit(decryptForm);

      // Verify decrypted content rendered in textarea (allowing time for PBKDF2 600,000 iterations)
      await waitFor(
        () => {
          expect(screen.getByDisplayValue(/Secret vault classified contents/i)).toBeInTheDocument();
        },
        { timeout: 15000 }
      );

      mockGetPaste.mockRestore();
      mockReportFailed.mockRestore();
    });
  });
});
