import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SettingsPage } from '../features/dashboard/pages/SettingsPage';
import { CreatePastePage } from '../features/pastes/pages/CreatePastePage';
import * as AuthContext from '../features/auth/context/AuthContext';
import { apiClient } from '../lib/api-client/client';
import { accountApi } from '../features/dashboard/api/accountApi';

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Phase 2 Red Suite: Settings Workspace Contract Tests', () => {
  const mockUser = {
    id: 1,
    username: 'octocat',
    email: 'octocat@github.com',
    role: 'ROLE_USER',
    emailVerified: true,
    avatarUrl: null,
    createdAt: '2026-01-01T12:00:00Z',
  };

  const mockAuthContext = {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
    loginWithOAuth: vi.fn(),
    loginWithMagicLink: vi.fn(),
    syncSessionWithBackend: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(AuthContext.useAuth).mockReturnValue(mockAuthContext as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // 1. Navigation & Workspace Structure
  it('FE-SET-WS-01: renders the 7-section settings workspace navigation sidebar with accessibility attributes', () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    const nav = screen.getByRole('navigation', { name: /settings navigation/i });
    expect(nav).toBeInTheDocument();

    const tabs = [
      'Profile',
      'Account & Security',
      'Paste Defaults',
      'Privacy & Sharing',
      'Appearance & Editor',
      'Data & Account',
      'About ExtraBin',
    ];

    tabs.forEach((tabName) => {
      expect(screen.getByRole('tab', { name: new RegExp(tabName, 'i') })).toBeInTheDocument();
    });
  });

  it('FE-SET-WS-02: switches active panels when clicking sidebar navigation tabs and manages aria-selected', () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    const pasteDefaultsTab = screen.getByRole('tab', { name: /paste defaults/i });
    expect(pasteDefaultsTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(pasteDefaultsTab);

    expect(pasteDefaultsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /default paste settings/i })).toBeInTheDocument();
  });

  it('FE-SET-WS-03: supports keyboard navigation (ArrowDown, ArrowUp, Home, End) across settings tabs', () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    const profileTab = screen.getByRole('tab', { name: /profile/i });
    profileTab.focus();

    fireEvent.keyDown(profileTab, { key: 'ArrowDown' });
    const securityTab = screen.getByRole('tab', { name: /account & security/i });
    expect(securityTab).toHaveFocus();

    fireEvent.keyDown(securityTab, { key: 'End' });
    const aboutTab = screen.getByRole('tab', { name: /about extrabin/i });
    expect(aboutTab).toHaveFocus();
  });

  // 2. Paste Defaults & Runtime Validation
  it('FE-SET-DEF-01: saves valid paste defaults to localStorage and shows feedback', async () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /paste defaults/i }));

    const visibilitySelect = screen.getByLabelText(/default visibility/i);
    fireEvent.change(visibilitySelect, { target: { value: 'PRIVATE' } });

    const expirationSelect = screen.getByLabelText(/default expiration/i);
    fireEvent.change(expirationSelect, { target: { value: 'ONE_DAY' } });

    const languageSelect = screen.getByLabelText(/default syntax language/i);
    fireEvent.change(languageSelect, { target: { value: 'python' } });

    const burnCheckbox = screen.getByLabelText(/default auto-delete on first view/i);
    fireEvent.click(burnCheckbox);

    const saveButton = screen.getByRole('button', { name: /save paste defaults/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/paste defaults saved successfully/i)).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem('extrabin_paste_defaults_v1') || '{}');
    expect(stored).toEqual({
      version: 1,
      defaultVisibility: 'PRIVATE',
      defaultExpiration: 'ONE_DAY',
      defaultLanguage: 'python',
      defaultBurnAfterReading: true,
    });
  });

  it('FE-SET-DEF-02: recovers gracefully from corrupted or invalid localStorage schemas by falling back to system defaults', () => {
    localStorage.setItem(
      'extrabin_paste_defaults_v1',
      JSON.stringify({
        version: 999,
        defaultVisibility: 'ILLEGAL_VALUE',
        defaultExpiration: 'EXPIRED_POLICY',
      })
    );

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /paste defaults/i }));

    const visibilitySelect = screen.getByLabelText(/default visibility/i) as HTMLSelectElement;
    expect(visibilitySelect.value).toBe('UNLISTED');

    const expirationSelect = screen.getByLabelText(/default expiration/i) as HTMLSelectElement;
    expect(expirationSelect.value).toBe('ONE_WEEK');
  });

  it('FE-SET-DEF-03: handles localStorage write errors (QuotaExceededError) with a user-facing error message', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /paste defaults/i }));
    fireEvent.click(screen.getByRole('button', { name: /save paste defaults/i }));

    await waitFor(() => {
      expect(screen.getByText(/unable to save preferences due to browser storage limitations/i)).toBeInTheDocument();
    });

    setItemSpy.mockRestore();
  });

  // 3. Precedence Integration with CreatePastePage
  it('FE-CREAT-DEF-01: CreatePastePage applies saved paste defaults when starting a new session', () => {
    localStorage.setItem(
      'extrabin_paste_defaults_v1',
      JSON.stringify({
        version: 1,
        defaultVisibility: 'PRIVATE',
        defaultExpiration: 'ONE_DAY',
        defaultLanguage: 'python',
        defaultBurnAfterReading: false,
      })
    );

    render(
      <BrowserRouter>
        <CreatePastePage />
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/paste exposure visibility/i)).toHaveValue('PRIVATE');
    expect(screen.getByLabelText(/paste expiration policy/i)).toHaveValue('ONE_DAY');
  });

  it('FE-CREAT-DEF-02: Restored draft takes strict precedence over stored defaults', async () => {
    localStorage.setItem(
      'extrabin_paste_defaults_v1',
      JSON.stringify({
        version: 1,
        defaultVisibility: 'PRIVATE',
        defaultExpiration: 'ONE_DAY',
        defaultLanguage: 'python',
        defaultBurnAfterReading: false,
      })
    );

    localStorage.setItem(
      'extrabin_draft_v1_user_1',
      JSON.stringify({
        version: 1,
        savedAt: Date.now() - 5000,
        title: 'Draft Title',
        files: [{ id: 'f1', filename: 'draft.js', content: 'console.log("meaningful content");', language: 'javascript' }],
        privacy: 'PUBLIC',
        expiry: 'ONE_MONTH',
        burnAfterReading: true,
        category: 'code',
        tags: 'test',
        folder: 'root',
      })
    );

    render(
      <BrowserRouter>
        <CreatePastePage />
      </BrowserRouter>
    );

    // Wait for recoverable draft banner and restore it
    const restoreBtn = await screen.findByRole('button', { name: /restore draft/i });
    fireEvent.click(restoreBtn);

    expect(screen.getByLabelText(/paste exposure visibility/i)).toHaveValue('PUBLIC');
    expect(screen.getByLabelText(/paste expiration policy/i)).toHaveValue('VIEW_ONCE');
  });

  // 4. Account & Security, Password Reset & Sign Out
  it('FE-SET-SEC-01: triggers self-service password reset email and displays anti-enumeration feedback', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { message: 'If that email address exists in our database, we will send a password reset link.' },
    });

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /account & security/i }));

    const sendResetBtn = screen.getByRole('button', { name: /send password reset link/i });
    expect(sendResetBtn).toBeInTheDocument();

    fireEvent.click(sendResetBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/auth/password-reset/request', {
        email: 'octocat@github.com',
      });
      expect(
        screen.getByText(/if that email address exists in our database, we will send a password reset link/i)
      ).toBeInTheDocument();
    });
  });

  it('FE-SET-SEC-02: handles password reset request network failure gracefully', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /account & security/i }));
    fireEvent.click(screen.getByRole('button', { name: /send password reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to request password reset\. please try again later\./i)).toBeInTheDocument();
    });
  });

  it('FE-SET-SEC-03: triggers sign-out and displays honest single-session notice', () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /account & security/i }));

    expect(screen.getByText(/active session: current browser/i)).toBeInTheDocument();
    expect(screen.getByText(/multi-device remote session revocation is not supported/i)).toBeInTheDocument();

    const signoutBtn = screen.getByRole('button', { name: /sign out of this session/i });
    fireEvent.click(signoutBtn);

    expect(mockAuthContext.logout).toHaveBeenCalled();
  });

  // 5. Appearance & Editor Customization
  it('FE-SET-EDT-01: saves and persists editor preferences (tab size, font size, wrapping, line numbers)', async () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /appearance & editor/i }));

    const fontSizeSelect = screen.getByLabelText(/editor font size/i);
    fireEvent.change(fontSizeSelect, { target: { value: '16px' } });

    const tabSizeSelect = screen.getByLabelText(/editor tab indentation/i);
    fireEvent.change(tabSizeSelect, { target: { value: '4' } });

    const wrapToggle = screen.getByLabelText(/soft line wrapping/i);
    fireEvent.click(wrapToggle);

    const gutterToggle = screen.getByLabelText(/show line numbers/i);
    fireEvent.click(gutterToggle);

    const saveEditorBtn = screen.getByRole('button', { name: /save editor preferences/i });
    fireEvent.click(saveEditorBtn);

    await waitFor(() => {
      expect(screen.getByText(/editor preferences saved/i)).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem('extrabin_editor_prefs_v1') || '{}');
    expect(stored).toEqual({
      version: 1,
      fontSize: '16px',
      tabSize: 4,
      lineWrapping: true,
      showLineNumbers: false,
    });
  });

  it('FE-SET-EDT-02: CreatePastePage applies saved editor font size, tab indentation, and gutter visibility to DOM elements', () => {
    localStorage.setItem(
      'extrabin_editor_prefs_v1',
      JSON.stringify({
        version: 1,
        fontSize: '16px',
        tabSize: 4,
        lineWrapping: true,
        showLineNumbers: false,
      })
    );

    render(
      <BrowserRouter>
        <CreatePastePage />
      </BrowserRouter>
    );

    const textarea = screen.getByLabelText(/paste content/i);
    expect(textarea).toHaveAttribute('wrap', 'on');

    // When showLineNumbers is false, the gutter is hidden or omitted
    expect(document.querySelector('.code-editor-gutter')).toHaveClass('hidden');

    // Pressing Tab in textarea should insert 4 spaces instead of 2
    fireEvent.change(textarea, { target: { value: 'hello' } });
    (textarea as HTMLTextAreaElement).setSelectionRange(5, 5);
    fireEvent.keyDown(textarea, { key: 'Tab' });

    expect(textarea).toHaveValue('hello    ');
  });

  // 6. Data & Account Metadata Export
  it('FE-SET-DAT-01: exports complete paginated paste metadata as a downloadable JSON file', async () => {
    const mockPage1 = {
      items: [
        { id: 'paste-1', title: 'Snippet 1', language: 'typescript', visibility: 'UNLISTED', contentSizeBytes: 120, lineCount: 5, createdAt: '2026-01-01T00:00:00Z', version: 1, views: 10 },
      ],
      page: 0,
      size: 1,
      totalElements: 2,
      totalPages: 2,
      isFirst: true,
      isLast: false,
    };

    const mockPage2 = {
      items: [
        { id: 'paste-2', title: 'Snippet 2', language: 'python', visibility: 'PUBLIC', contentSizeBytes: 240, lineCount: 12, createdAt: '2026-01-02T00:00:00Z', version: 1, views: 4 },
      ],
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
      isFirst: false,
      isLast: true,
    };

    const getPastesSpy = vi.spyOn(accountApi, 'getMyPastes')
      .mockResolvedValueOnce(mockPage1 as any)
      .mockResolvedValueOnce(mockPage2 as any);

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));

    const exportBtn = screen.getByRole('button', { name: /export metadata as json/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(getPastesSpy).toHaveBeenCalledWith(0, 50);
      expect(getPastesSpy).toHaveBeenCalledWith(1, 50);
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(screen.getByText(/metadata export completed: 2 pastes exported/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/self-service account deletion is currently unavailable/i)).toBeInTheDocument();
  });

  it('FE-SET-DAT-02: handles paginated metadata export API failure with user error alert and stops export loop', async () => {
    vi.spyOn(accountApi, 'getMyPastes').mockRejectedValueOnce(new Error('Export failed'));

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to export metadata\. please check your network connection\./i)).toBeInTheDocument();
    });
  });

  // 7. About ExtraBin Build Details
  it('FE-SET-ABT-01: renders verified frontend build version, OpenAPI docs link, and license details', () => {
    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /about extrabin/i }));

    expect(screen.getByText(/application version: v0\.1\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/api specification: v1\.0\.0/i)).toBeInTheDocument();

    const swaggerLink = screen.getByRole('link', { name: /interactive openapi documentation/i });
    expect(swaggerLink).toHaveAttribute('href', '/swagger-ui.html');
  });

  // 8. Advanced Invariant & Regression Coverage
  it('FE-SET-DAT-03: reports safety pagination limit warning when export reaches 100 pages with remaining records', async () => {
    // Mock 100 full pages with totalPages = 105
    const mockFullPage = (page: number) => ({
      items: [{ id: `paste-${page}`, title: `Paste ${page}`, language: 'plaintext', visibility: 'UNLISTED', contentSizeBytes: 10, lineCount: 1, createdAt: '2026-01-01T00:00:00Z', version: 1, views: 0 }],
      page,
      size: 1,
      totalElements: 105,
      totalPages: 105,
      isFirst: page === 0,
      isLast: false,
    });

    const getPastesSpy = vi.spyOn(accountApi, 'getMyPastes').mockImplementation(async (page = 0) => {
      return mockFullPage(page) as any;
    });

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = vi.fn();

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(getPastesSpy).toHaveBeenCalledTimes(100);
      expect(screen.getByText(/export safety limit reached: exported first 100 pastes\. some older records were omitted\./i)).toBeInTheDocument();
    });
  });

  it('FE-SET-DAT-04: handles empty paste inventory (zero elements) cleanly without download or export failure', async () => {
    vi.spyOn(accountApi, 'getMyPastes').mockResolvedValueOnce({
      items: [],
      page: 0,
      size: 50,
      totalElements: 0,
      totalPages: 0,
      isFirst: true,
      isLast: true,
    } as any);

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = vi.fn();

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(screen.getByText(/metadata export completed: 0 pastes exported\./i)).toBeInTheDocument();
    });
  });

  it('FE-SET-DAT-05: marks export as partial and warns user when pagination reaches empty page before isLast is true', async () => {
    let capturedBlobContent = '';
    const mockBlob = vi.fn().mockImplementation((chunks) => {
      capturedBlobContent = chunks.join('');
      return {};
    });
    vi.stubGlobal('Blob', mockBlob);

    // Page 0 has items, but page 1 has 0 items even though totalPages says 3 and isLast is false
    vi.spyOn(accountApi, 'getMyPastes')
      .mockResolvedValueOnce({
        items: [{ id: 'p1', title: 'Paste 1', language: 'plaintext', visibility: 'PUBLIC', createdAt: '2026-01-01', version: 1, views: 1, contentSizeBytes: 10, lineCount: 1 }],
        page: 0,
        size: 50,
        totalElements: 55,
        totalPages: 2,
        isFirst: true,
        isLast: false,
      } as any)
      .mockResolvedValueOnce({
        items: [],
        page: 1,
        size: 50,
        totalElements: 55,
        totalPages: 2,
        isFirst: false,
        isLast: false,
      } as any);

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = vi.fn();

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/partial export: server pagination metadata indicated additional pastes, but an empty page was encountered\. exported 1 pastes\./i)
      ).toBeInTheDocument();
    });

    const parsed = JSON.parse(capturedBlobContent);
    expect(parsed.isPartialExport).toBe(true);
    expect(parsed.totalExported).toBe(1);
    expect(parsed.pastes).toHaveLength(1);
  });

  it('FE-SET-DAT-06: strictly enforces metadata allowlist and drops arbitrary or sensitive backend DTO fields', async () => {
    let capturedBlobContent = '';
    const mockBlob = vi.fn().mockImplementation((chunks) => {
      capturedBlobContent = chunks.join('');
      return {};
    });
    vi.stubGlobal('Blob', mockBlob);

    // Mock API returning extra non-metadata / sensitive fields
    vi.spyOn(accountApi, 'getMyPastes').mockResolvedValueOnce({
      items: [
        {
          id: 'paste-priv-1',
          title: 'Allowed Title',
          language: 'typescript',
          visibility: 'PUBLIC',
          contentSizeBytes: 100,
          lineCount: 5,
          createdAt: '2026-01-01T00:00:00Z',
          expiresAt: null,
          version: 1,
          views: 10,
          folderId: 2,
          folderName: 'Work',
          // Unauthorized / unexpected fields that should NOT leak:
          content: 'SECRET_UNENCRYPTED_BODY_LEAK',
          rawFileUrl: 'https://secret.extrabin.internal/raw',
          shareToken: 'shr_leaked_super_token',
          internalUserId: 9999,
          passwordHash: '$2a$12$fakeHashSecret',
        },
      ],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    } as any);

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(screen.getByText(/metadata export completed: 1 pastes exported\./i)).toBeInTheDocument();
    });

    const parsed = JSON.parse(capturedBlobContent);
    const exportedPaste = parsed.pastes[0];

    // Allowed fields
    expect(exportedPaste.id).toBe('paste-priv-1');
    expect(exportedPaste.title).toBe('Allowed Title');
    expect(exportedPaste.language).toBe('typescript');

    // Leaked/Arbitrary fields MUST be undefined/omitted
    expect(exportedPaste.content).toBeUndefined();
    expect(exportedPaste.rawFileUrl).toBeUndefined();
    expect(exportedPaste.shareToken).toBeUndefined();
    expect(exportedPaste.internalUserId).toBeUndefined();
    expect(exportedPaste.passwordHash).toBeUndefined();
  });

  it('FE-SET-DAT-07: aborts cleanly and reports error without generating download if item records are malformed', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url');
    window.URL.createObjectURL = createObjectURLMock;

    vi.spyOn(accountApi, 'getMyPastes').mockResolvedValueOnce({
      items: [
        {
          id: 12345, // invalid type, should be string
          title: 'Malformed Item',
        },
      ],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    } as any);

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: /data & account/i }));
    fireEvent.click(screen.getByRole('button', { name: /export metadata as json/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to export metadata\. please check your network connection\./i)).toBeInTheDocument();
    });

    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('FE-CREAT-DEF-03: manual input during active creation session is never overwritten by subsequent preference storage changes', () => {
    localStorage.setItem(
      'extrabin_paste_defaults_v1',
      JSON.stringify({
        version: 1,
        defaultVisibility: 'UNLISTED',
        defaultExpiration: 'ONE_WEEK',
        defaultLanguage: 'plaintext',
        defaultBurnAfterReading: false,
      })
    );

    render(
      <BrowserRouter>
        <CreatePastePage />
      </BrowserRouter>
    );

    // Explicit manual input by user
    const titleInput = screen.getByLabelText(/paste title/i);
    fireEvent.change(titleInput, { target: { value: 'My Active Untouched Title' } });

    const exposureBtn = screen.getByLabelText(/paste exposure visibility/i);
    fireEvent.click(exposureBtn);
    const publicOption = screen.getAllByText('Public').find((el) => el.closest('.pp-sel__opt')) || screen.getAllByText('Public')[0];
    fireEvent.click(publicOption);

    // Simulate external storage mutation
    localStorage.setItem(
      'extrabin_paste_defaults_v1',
      JSON.stringify({
        version: 1,
        defaultVisibility: 'PRIVATE',
        defaultExpiration: 'ONE_DAY',
        defaultLanguage: 'python',
        defaultBurnAfterReading: true,
      })
    );

    // Verify user's explicit manual input remains intact and untouched
    expect(screen.getByLabelText(/paste title/i)).toHaveValue('My Active Untouched Title');
    expect(screen.getByLabelText(/paste exposure visibility/i)).toHaveValue('PUBLIC');
  });
});
