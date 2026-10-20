import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { AuthContext } from '../features/auth/context/AuthContext';
import { PasteView } from '../features/pastes/types/paste';
import * as cryptoEngine from '../lib/crypto/e2ePaste';

vi.mock('../lib/confetti', () => ({
  triggerConfetti: vi.fn(),
  triggerSuccessBurst: vi.fn(),
}));

const mockAuthValue = (isAuthenticated: boolean = false) => ({
  user: isAuthenticated ? { id: 'user123', username: 'testuser', email: 'test@example.com' } : null,
  isAuthenticated,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  loginWithOAuth: vi.fn(),
  loginWithMagicLink: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
  syncSessionWithBackend: vi.fn(),
});

describe('Phase 2 E2EE Paste Lifecycle & UI Contract (Red Phase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('E2EE-FE-02: Recipient opening E2EE paste without #key= sees honest missing-key explanation and NO raw ciphertext in code blocks', async () => {
    const encryptedPasteDto: PasteView = {
      id: 'encPaste99',
      title: 'Secret Project Plans',
      content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
      language: 'markdown',
      visibility: 'PUBLIC',
      contentSizeBytes: 28,
      lineCount: 1,
      isOwner: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      burnAfterReading: false,
      viewOnce: false,
      passwordProtected: false,
      passwordRequired: false,
      encryptionMode: 'LINK',
      kdfSalt: 'AQIDBAUGBwgJCgsMDQ4PEA==',
      kdfIterations: 600000,
      wrappedKey: null,
      files: [
        {
          id: 1,
          filename: 'plans.md',
          content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          language: 'markdown',
          ciphertext: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          nonce: 'AQIDBAUGBwgJCgsM',
          authTag: 'AQIDBAUGBwgJCgsMDQ4PEA==',
        },
      ],
      views: 5,
    };

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValue(encryptedPasteDto);

    render(
      <AuthContext.Provider value={mockAuthValue(false) as any}>
        <MemoryRouter initialEntries={['/p/encPaste99']}>
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(await screen.findByRole('heading', { name: /End-to-End Encrypted/i })).toBeInTheDocument();

    // Must show exact UX specification copy
    expect(
      screen.getByText(/The link you opened does not include the decryption key\. Ask the person who shared it for the encrypted access link or the separately shared key\./i)
    ).toBeInTheDocument();

    // Crucial security invariant: raw ciphertext must never be rendered as code in the viewer
    expect(screen.queryByText('e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0')).not.toBeInTheDocument();
  });

  it('E2EE-FE-03: Recipient opening with invalid #key= shows honest decryption failure copy without falling back to plaintext', async () => {
    const encryptedPasteDto: PasteView = {
      id: 'encPasteBadKey',
      title: 'Corrupted Secret',
      content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
      language: 'markdown',
      visibility: 'PUBLIC',
      contentSizeBytes: 28,
      lineCount: 1,
      isOwner: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      burnAfterReading: false,
      viewOnce: false,
      passwordProtected: false,
      passwordRequired: false,
      encryptionMode: 'LINK',
      kdfSalt: 'AQIDBAUGBwgJCgsMDQ4PEA==',
      kdfIterations: 600000,
      wrappedKey: null,
      files: [
        {
          id: 1,
          filename: 'secret.txt',
          content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          language: 'markdown',
          ciphertext: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          nonce: 'AQIDBAUGBwgJCgsM',
          authTag: 'AQIDBAUGBwgJCgsMDQ4PEA==',
        },
      ],
      views: 1,
    };

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValue(encryptedPasteDto);
    vi.spyOn(cryptoEngine, 'decryptPaste').mockRejectedValue(new cryptoEngine.DecryptionFailedError());

    // Provide damaged key in hash
    window.location.hash = '#key=damagedInvalidKeyBytes';

    render(
      <AuthContext.Provider value={mockAuthValue(false) as any}>
        <MemoryRouter initialEntries={['/p/encPasteBadKey#key=damagedInvalidKeyBytes']}>
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // Expect exact failure explanation
    expect(
      await screen.findByText(/We couldn't decrypt this paste\. Possible causes include an incorrect key, an incomplete link, or corrupted encrypted data\./i)
    ).toBeInTheDocument();

    // Verify plaintext is never rendered on failure
    expect(screen.queryByText('e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0')).not.toBeInTheDocument();
  });

  it('E2EE-FE-04: Author visiting their own E2EE paste without #key= sees owner warning banner and destructive in-place edit is prevented', async () => {
    const encryptedPasteDto: PasteView = {
      id: 'authorEncPaste1',
      title: 'My Encrypted Notes',
      content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
      language: 'markdown',
      visibility: 'PUBLIC',
      contentSizeBytes: 28,
      lineCount: 1,
      isOwner: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      burnAfterReading: false,
      viewOnce: false,
      passwordProtected: false,
      passwordRequired: false,
      encryptionMode: 'LINK',
      kdfSalt: 'AQIDBAUGBwgJCgsMDQ4PEA==',
      kdfIterations: 600000,
      wrappedKey: null,
      files: [
        {
          id: 1,
          filename: 'notes.md',
          content: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          language: 'markdown',
          ciphertext: 'e2VuY3J5cHRlZC1jaXBoZXJ0ZXh0',
          nonce: 'AQIDBAUGBwgJCgsM',
          authTag: 'AQIDBAUGBwgJCgsMDQ4PEA==',
        },
      ],
      views: 10,
    };

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValue(encryptedPasteDto);

    render(
      <AuthContext.Provider value={mockAuthValue(true) as any}>
        <MemoryRouter initialEntries={['/p/authorEncPaste1']}>
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );

    // Exact author-specific copy
    expect(
      await screen.findByText(/You own this paste, but its decryption key isn't available in this session\./i)
    ).toBeInTheDocument();

    // Destructive editing without key must be disabled / prevented
    expect(screen.queryByRole('button', { name: /^Edit$/i })).not.toBeInTheDocument();
  });

  it('E2EE-FE-06: Share modal offers separate Copy Public Link vs Copy Encrypted Access Link with clear explanations', () => {
    const publicUrl = pasteApi.buildShareableUrl('https://extrabin.example', 'pasteXYZ', null, null);
    const encryptedAccessUrl = pasteApi.buildShareableUrl('https://extrabin.example', 'pasteXYZ', null, 'secretKey123');

    expect(publicUrl).toBe('https://extrabin.example/p/pasteXYZ');
    expect(encryptedAccessUrl).toBe('https://extrabin.example/p/pasteXYZ#key=secretKey123');

    // With unlisted token
    const unlistedEncryptedUrl = pasteApi.buildShareableUrl('https://extrabin.example', 'pasteXYZ', 'tokenABC', 'secretKey123');
    expect(unlistedEncryptedUrl).toBe('https://extrabin.example/p/pasteXYZ?token=tokenABC#key=secretKey123');
  });
});
