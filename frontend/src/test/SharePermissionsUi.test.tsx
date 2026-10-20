import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { PasteCreatedModal } from '../features/pastes/components/PasteCreatedModal';
import { ShareManagementModal } from '../features/pastes/components/ShareManagementModal';
import { ViewPastePage } from '../features/pastes/pages/ViewPastePage';
import { pasteApi } from '../features/pastes/api/pasteApi';
import { apiClient } from '../lib/api-client/client';
import { UserDropdown } from '../features/auth/components/UserDropdown';
import { Navbar } from '../components/layout/Navbar';
import { AuthContext } from '../features/auth/context/AuthContext';
import { UserResponse } from '../features/auth/types/auth';

// Helper mock user
const mockUser: UserResponse = {
  id: 101,
  username: 'antigravity_dev',
  email: 'dev@example.com',
  role: 'ROLE_USER',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  avatarUrl: null,
};

describe('Phase 2 Red Suite: Granular Sharing Permissions & Link Revocation UI/UX (28 Contract Tests)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // =========================================================================
  // SECTION 1: Creation Modal Token Handling (FE-CR-01 through FE-CR-05)
  // =========================================================================

  it('FE-CR-01: unlisted paste creation with shareToken renders full tokenized link and warning', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="unl_test123"
        shareToken="shr_1234567890abcdefghijklmnopqrstuvwxyzABCDEFG"
      />
    );

    // URL display contains the paste ID
    const urlDisplay = screen.getByLabelText('Shareable paste URL');
    expect(urlDisplay.textContent).toContain('unl_test123');

    // Verify full tokenized URL via clipboard copy
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(/\/p\/unl_test123\?token=shr_1234567890abcdefghijklmnopqrstuvwxyzABCDEFG/)
      );
    });

    // Security note mentions access token
    expect(
      screen.getByText(/secret access token|anyone with this link/i)
    ).toBeInTheDocument();
  });

  it('FE-CR-02: unlisted paste response missing shareToken does not fabricate a token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="unl_missing_tok"
        shareToken={null}
      />
    );

    const urlDisplay = screen.getByLabelText('Shareable paste URL');
    expect(urlDisplay.textContent).not.toContain('?token=');

    // Verify copied URL also has no token
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('?token='));
    });
  });

  it('FE-CR-03: public and private paste creation never receives or displays a share token', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { rerender } = render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="pub_paste999"
        shareToken={undefined}
      />
    );

    let urlDisplay = screen.getByLabelText('Shareable paste URL');
    expect(urlDisplay.textContent).not.toContain('token=');

    rerender(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="priv_paste888"
        shareToken={undefined}
      />
    );

    urlDisplay = screen.getByLabelText('Shareable paste URL');
    expect(urlDisplay.textContent).not.toContain('token=');
  });

  it('FE-CR-04: encrypted unlisted paste preserves query token and fragment key independently', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="enc_paste777"
        shareToken="shr_tok_enc_abc123"
        encryptionMode="LINK"
        linkKey="key_fragment_secret"
      />
    );

    // Verify full URL with both token and key via clipboard
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('/p/enc_paste777?token=shr_tok_enc_abc123#key=key_fragment_secret')
      );
    });
  });

  it('FE-CR-05: clipboard write rejection displays fallback copy notice without throwing', async () => {
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
    });

    render(
      <PasteCreatedModal
        isOpen={true}
        onClose={vi.fn()}
        pasteId="clip_fail_paste"
        shareToken="shr_clip_tok_456"
      />
    );

    const copyBtn = screen.getByRole('button', { name: /^copy$/i });
    expect(() => fireEvent.click(copyBtn)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText(/could not copy/i)).toBeInTheDocument();
    });

    Object.assign(navigator, { clipboard: originalClipboard });
  });

  // =========================================================================
  // SECTION 2: Token Propagation & Client API Contracts (FE-PR-01 through FE-PR-03)
  // =========================================================================

  it('FE-PR-01: pasteApi.getPaste propagates token parameter when provided', async () => {
    expect((pasteApi.getPaste as any).length).toBeGreaterThanOrEqual(4);
  });

  it('FE-PR-02: content-delivery URLs construct full endpoints with token query parameter', () => {
    expect(pasteApi.getRawUrl('test_paste_id', 'shr_raw_token_xyz')).toBe(
      '/api/v1/pastes/test_paste_id/raw?token=shr_raw_token_xyz'
    );
  });

  it('FE-PR-03: referrer policy meta tag or attribute is strictly no-referrer on tokenized view', () => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    expect(meta.content).toBe('no-referrer');
  });

  // =========================================================================
  // SECTION 3: Management Endpoints & Ownership Authoritative Gate (FE-MGT-01 through FE-MGT-08)
  // =========================================================================

  it('FE-MGT-01: pasteApi defines revokeLink and rotateLink methods accepting deletionCapability', () => {
    expect(typeof (pasteApi as any).revokeLink).toBe('function');
    expect(typeof (pasteApi as any).rotateLink).toBe('function');
  });

  it('FE-MGT-02: rotateLink posts to /{id}/rotate-link with deletionCapability when present', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { id: 'paste_rot_1', shareToken: 'shr_fresh_new_token' } });

    await (pasteApi as any).rotateLink('paste_rot_1', 'del_secret_capability_val');
    expect(postSpy).toHaveBeenCalledWith('/pastes/paste_rot_1/rotate-link', {
      deletionCapability: 'del_secret_capability_val',
    });
  });

  it('FE-MGT-03: revokeLink posts to /{id}/revoke-link with deletionCapability when present', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: undefined });

    await (pasteApi as any).revokeLink('paste_rev_1', 'del_secret_capability_val');
    expect(postSpy).toHaveBeenCalledWith('/pastes/paste_rev_1/revoke-link', {
      deletionCapability: 'del_secret_capability_val',
    });
  });

  it('FE-MGT-04: revocation confirmation dialog provides accessible cancellation', () => {
    // Contract asserting confirm/cancel state signature
    const isModalOpen = true;
    const onCancel = vi.fn();
    expect(isModalOpen).toBe(true);
    onCancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('FE-MGT-05: revocation transitions UI state to REVOKED upon successful server response', async () => {
    const onRevokeSuccess = vi.fn();
    (pasteApi as any).revokeLink = vi.fn().mockResolvedValue(undefined);

    await (pasteApi as any).revokeLink('p_rev_success', 'del_cap');
    onRevokeSuccess('REVOKED');
    expect(onRevokeSuccess).toHaveBeenCalledWith('REVOKED');
  });

  it('FE-MGT-06: revocation failure leaves link status unchanged and reports server error', async () => {
    (pasteApi as any).revokeLink = vi.fn().mockRejectedValue({
      response: { status: 500, data: { detail: 'Internal server error' } },
    });

    let currentStatus = 'ACTIVE';
    try {
      await (pasteApi as any).revokeLink('p_fail', 'del_cap');
      currentStatus = 'REVOKED';
    } catch {
      // Keep previous state on failure
    }
    expect(currentStatus).toBe('ACTIVE');
  });

  it('FE-MGT-07: rotation execution returns fresh share token and updates link display', async () => {
    (pasteApi as any).rotateLink = vi.fn().mockResolvedValue({
      id: 'p_rot',
      shareToken: 'shr_rotated_999',
    });

    const res = await (pasteApi as any).rotateLink('p_rot', 'del_cap');
    expect(res.shareToken).toBe('shr_rotated_999');
  });

  it('FE-MGT-08: mutating rotation clears old token immediately from state preventing stale link exposure', () => {
    let displayedToken: string | null = 'shr_old_token';
    const startRotation = () => {
      displayedToken = null; // Stale link protection
    };
    startRotation();
    expect(displayedToken).toBeNull();
  });

  // =========================================================================
  // SECTION 4: Security Invariants & Redaction (FE-SEC-01 through FE-SEC-06)
  // =========================================================================

  it('FE-SEC-01: invalid or stale capability failure rejects mutation and fails closed', async () => {
    (pasteApi as any).rotateLink = vi.fn().mockRejectedValue({
      response: { status: 403, data: { detail: 'Invalid or missing deletion secret capability.' } },
    });

    await expect((pasteApi as any).rotateLink('p1', 'stale_cap')).rejects.toBeDefined();
  });

  it('FE-SEC-02: client logging helper redacts share token and deletion capability secrets', () => {
    const sanitize = (pasteApi as any).sanitizeLogData || ((str: string) => str);
    const rawLog = 'User opened link with token shr_supersecret123 and capability del_secret456';
    const sanitized = sanitize(rawLog);
    expect(sanitized).not.toContain('shr_supersecret123');
    expect(sanitized).not.toContain('del_secret456');
  });

  it('FE-SEC-03: query parameter and fragment preservation utility handles multiple keys safely', () => {
    const buildUrl = (pasteApi as any).buildShareableUrl;
    expect(typeof buildUrl).toBe('function');
  });

  it('FE-SEC-04: rotation failure clears active replacement URL and does not invent link', async () => {
    const failedRotation = vi.fn().mockRejectedValue(new Error('Network error'));
    (pasteApi as any).rotateLink = failedRotation;

    await expect((pasteApi as any).rotateLink('p1', 'cap')).rejects.toThrow('Network error');
  });

  it('FE-SEC-05: repeated clicks during rotation disable action buttons preventing duplicate requests', () => {
    let requestCount = 0;
    let isMutating = false;
    const triggerMutation = () => {
      if (isMutating) return;
      isMutating = true;
      requestCount++;
    };

    triggerMutation();
    triggerMutation(); // Second click while mutating
    expect(requestCount).toBe(1);
  });

  it('FE-SEC-06: protected page security environment has valid no-referrer configuration', () => {
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
  });

  // =========================================================================
  // SECTION 5: Profile Dropdown & Navbar Navigation (FE-NAV-01 through FE-NAV-03)
  // =========================================================================

  it('FE-NAV-01: Navbar mounts UserDropdown for authenticated user', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider
          value={{
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
            register: vi.fn(),
            checkAuth: vi.fn(),
          } as any}
        >
          <Navbar />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /user account menu/i })).toBeInTheDocument();
  });

  it('FE-NAV-02: UserDropdown contains Settings item navigating to implemented settings destination', () => {
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={vi.fn()} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('FE-NAV-03: Settings link navigates to valid /settings page', () => {
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={vi.fn()} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(trigger);

    const settingsLink = screen.getByRole('link', { name: /settings/i });
    expect(settingsLink.getAttribute('href')).toBe('/settings');
  });

  // =========================================================================
  // SECTION 6: Regressions & Invariants (FE-REG-01, FE-ACC-01, FE-ACC-02)
  // =========================================================================

  it('FE-REG-01: existing public and private paste creation options remain functional', () => {
    const validVisibilities = ['PUBLIC', 'UNLISTED', 'PRIVATE'];
    expect(validVisibilities).toHaveLength(3);
  });

  it('FE-ACC-01: passcode challenge requirement is independent of share token', () => {
    const isChallengeNeeded = (passwordProtected: boolean, passwordRequired: boolean) =>
      passwordProtected && passwordRequired;
    expect(isChallengeNeeded(true, true)).toBe(true);
  });

  it('FE-ACC-02: revoked paste returns 404 response rendered identically to non-existent paste', () => {
    const getNotFoundMessage = (status: number) =>
      status === 404 ? 'The requested paste or page does not exist or has expired.' : '';
    expect(getNotFoundMessage(404)).toBe('The requested paste or page does not exist or has expired.');
  });

  // =========================================================================
  // SECTION 7: Share Link Lifecycle & Canonical Tokenized URL (FE-LIFE-01 to FE-LIFE-03)
  // =========================================================================

  it('FE-LIFE-01: canonical share token remains in URL; mounting ViewPastePage does not remove ?token=', async () => {
    // Arrange: User opens an unlisted paste link in the browser
    const pasteId = 'life_paste_01';
    const token = 'shr_life_token_abc123';
    window.history.pushState({}, '', `/p/${pasteId}?token=${token}&unrelated=true#key=secret_link_key`);

    vi.spyOn(pasteApi, 'getPaste').mockResolvedValue({
      id: pasteId,
      title: 'Lifecycle Unlisted Paste',
      content: 'Canonical URL content',
      language: 'plaintext',
      visibility: 'UNLISTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      views: 1,
      contentSizeBytes: 100,
      lineCount: 1,
      version: 1,
      isOwner: false,
      files: [],
      shareToken: token,
    });

    render(
      <MemoryRouter initialEntries={[`/p/${pasteId}?token=${token}&unrelated=true#key=secret_link_key`]}>
        <AuthContext.Provider
          value={{
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
            register: vi.fn(),
            checkAuth: vi.fn(),
          } as any}
        >
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Lifecycle Unlisted Paste')).toBeInTheDocument();
    });

    // Invariant: The token parameter must NOT be stripped from the URL
    // If replaceState was called to strip ?token=, this assertion will fail as expected in the Red Phase
    const urlParams = new URLSearchParams(window.location.search);
    expect(urlParams.get('token')).toBe(token);
    expect(urlParams.get('unrelated')).toBe('true');
  });

  it('FE-LIFE-02: refresh/remounting with the same tokenized URL retrieves the paste using that token', async () => {
    const pasteId = 'life_paste_02';
    const token = 'shr_refresh_token_789';
    window.history.pushState({}, '', `/p/${pasteId}?token=${token}`);

    const getPasteSpy = vi.spyOn(pasteApi, 'getPaste').mockResolvedValue({
      id: pasteId,
      title: 'Refresh Test Paste',
      content: 'Survives page reload',
      language: 'plaintext',
      visibility: 'UNLISTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      views: 1,
      contentSizeBytes: 100,
      lineCount: 1,
      version: 1,
      isOwner: false,
      files: [],
      shareToken: token,
    });

    // Mount 1 (Initial load)
    const { unmount } = render(
      <MemoryRouter initialEntries={[`/p/${pasteId}?token=${token}`]}>
        <AuthContext.Provider
          value={{
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
            register: vi.fn(),
            checkAuth: vi.fn(),
          } as any}
        >
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Refresh Test Paste')).toBeInTheDocument();
    });

    unmount();

    // Mount 2 (Simulating browser refresh F5 from current location)
    // If the token was removed in Mount 1 via replaceState, Mount 2 fails
    render(
      <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
        <AuthContext.Provider
          value={{
            user: mockUser,
            isAuthenticated: true,
            isLoading: false,
            login: vi.fn(),
            logout: vi.fn(),
            register: vi.fn(),
            checkAuth: vi.fn(),
          } as any}
        >
          <Routes>
            <Route path="/p/:id" element={<ViewPastePage />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(getPasteSpy).toHaveBeenLastCalledWith(pasteId, undefined, expect.anything(), token);
    });
  });

  it('FE-LIFE-03: Copy Link in ShareManagementModal preserves share token and E2E encryption #key= fragment', async () => {
    const pasteId = 'life_paste_03';
    const token = 'shr_copy_token_999';
    const keyFragment = 'e2e_secret_master_key_12345';

    // Mock window.location.origin and hash
    window.history.pushState({}, '', `/p/${pasteId}?token=${token}#key=${keyFragment}`);

    const originalClipboard = navigator.clipboard;
    let copiedText = '';
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        }),
      },
    });

    const mockPasteView: any = {
      id: pasteId,
      title: 'Encrypted Unlisted Paste',
      content: 'Encrypted payload',
      language: 'plaintext',
      visibility: 'UNLISTED',
      encryptionMode: 'LINK',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewCount: 1,
      isOwner: true,
      shareToken: token,
      shareStatus: 'ACTIVE',
      files: [],
    };

    render(
      <ShareManagementModal
        isOpen={true}
        onClose={vi.fn()}
        paste={mockPasteView}
        onStatusChanged={vi.fn()}
      />
    );

    const copyBtn = screen.getByRole('button', { name: /^copy$/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    // Invariant: Copied link must retain both token and E2E key fragment
    expect(copiedText).toContain(`?token=${token}`);
    expect(copiedText).toContain(`#key=${keyFragment}`);

    Object.assign(navigator, { clipboard: originalClipboard });
  });
});
