import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, IconName } from '../../../components/ui/PaperIcon';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Select, type SelectOption } from '../../../components/ui/dropdown';
import { useAuth } from '../../auth/context/AuthContext';
import { apiClient } from '../../../lib/api-client/client';
import { accountApi } from '../api/accountApi';
import {
  loadPasteDefaults,
  savePasteDefaults,
  loadEditorPrefs,
  saveEditorPrefs,
  StoredPasteDefaultsV1,
  StoredEditorPrefsV1,
} from '../utils/userPreferences';
import { Visibility, ExpirationPolicy } from '../../pastes/types/paste';

type SettingsTab =
  | 'profile'
  | 'security'
  | 'defaults'
  | 'privacy'
  | 'editor'
  | 'data'
  | 'about';

interface TabDefinition {
  id: SettingsTab;
  label: string;
  icon: IconName;
  description: string;
}

const SETTINGS_TABS: TabDefinition[] = [
  { id: 'profile', label: 'Profile', icon: 'user', description: 'Account identity, credentials, and role status' },
  { id: 'security', label: 'Account & Security', icon: 'lock', description: 'Authentication, password reset, and active sessions' },
  { id: 'defaults', label: 'Paste Defaults', icon: 'settings', description: 'Default visibility, expiration, and language for new pastes' },
  { id: 'privacy', label: 'Privacy & Sharing', icon: 'key', description: 'Bearer share tokens and client-side encryption guarantees' },
  { id: 'editor', label: 'Appearance & Editor', icon: 'code', description: 'Terminal font size, indentation tabs, and line numbers' },
  { id: 'data', label: 'Data & Account', icon: 'upload', description: 'Paste metadata export and account data safeguards' },
  { id: 'about', label: 'About ExtraBin', icon: 'spark', description: 'Verified application build, API specs, and documentation' },
];

export const SettingsPage: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Paste Defaults state
  const [pasteDefaults, setPasteDefaults] = useState<StoredPasteDefaultsV1>(loadPasteDefaults());
  const [defaultsSavedMsg, setDefaultsSavedMsg] = useState<string | null>(null);
  const [defaultsErrorMsg, setDefaultsErrorMsg] = useState<string | null>(null);

  // Editor Preferences state
  const [editorPrefs, setEditorPrefs] = useState<StoredEditorPrefsV1>(loadEditorPrefs());
  const [editorSavedMsg, setEditorSavedMsg] = useState<string | null>(null);
  const [editorErrorMsg, setEditorErrorMsg] = useState<string | null>(null);

  // Password reset state
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Handle keyboard navigation across sidebar tabs (ArrowDown, ArrowUp, Home, End)
  const handleKeyDownTab = (e: React.KeyboardEvent, index: number) => {
    let targetIndex = index;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % SETTINGS_TABS.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = SETTINGS_TABS.length - 1;
    } else {
      return;
    }
    tabButtonRefs.current[targetIndex]?.focus();
    setActiveTab(SETTINGS_TABS[targetIndex].id);
  };

  const handleSavePasteDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    setDefaultsSavedMsg(null);
    setDefaultsErrorMsg(null);
    try {
      savePasteDefaults(pasteDefaults);
      setDefaultsSavedMsg('Paste defaults saved successfully.');
      setTimeout(() => setDefaultsSavedMsg(null), 4000);
    } catch {
      setDefaultsErrorMsg('Unable to save preferences due to browser storage limitations.');
    }
  };

  const handleSaveEditorPrefs = (e: React.FormEvent) => {
    e.preventDefault();
    setEditorSavedMsg(null);
    setEditorErrorMsg(null);
    try {
      saveEditorPrefs(editorPrefs);
      setEditorSavedMsg('Editor preferences saved.');
      setTimeout(() => setEditorSavedMsg(null), 4000);
    } catch {
      setEditorErrorMsg('Unable to save preferences due to browser storage limitations.');
    }
  };

  const handleRequestPasswordReset = async () => {
    if (!user?.email || isResettingPassword) return;
    setIsResettingPassword(true);
    setResetFeedback(null);
    try {
      const response = await apiClient.post<{ message: string }>('/auth/password-reset/request', {
        email: user.email,
      });
      setResetFeedback({
        type: 'success',
        message: response.data?.message || 'If that email address exists in our database, we will send a password reset link.',
      });
    } catch {
      setResetFeedback({
        type: 'error',
        message: 'Failed to request password reset. Please try again later.',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleExportMetadata = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportFeedback(null);
    try {
      const allPastes: any[] = [];
      let currentPage = 0;
      let isLast = false;

      // Safe bounded pagination loop
      let hitLimitWithMorePages = false;
      let hasPaginationInconsistency = false;
      while (!isLast && currentPage < 100) {
        const pageData = await accountApi.getMyPastes(currentPage, 50);
        if (!pageData || !Array.isArray(pageData.items)) {
          throw new Error('Malformed page response');
        }
        
        // Inconsistency guard: if backend returns 0 items on a non-first page or before isLast,
        // stop loop and flag as incomplete/partial export.
        if (pageData.items.length === 0 && !pageData.isLast && (pageData.totalElements > 0 || (pageData.totalPages && pageData.totalPages > currentPage))) {
          hasPaginationInconsistency = true;
          break;
        }

        for (const item of pageData.items) {
          if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.language !== 'string') {
            throw new Error('Malformed paste record in export response');
          }
        }

        allPastes.push(...pageData.items);
        isLast = pageData.isLast || (pageData.totalPages > 0 && currentPage >= pageData.totalPages - 1) || (pageData.items.length === 0);
        currentPage++;
        if (currentPage >= 100 && !isLast) {
          hitLimitWithMorePages = true;
        }
      }

      const isPartialExport = hitLimitWithMorePages || hasPaginationInconsistency;

      // Strict metadata allowlist: explicitly exclude arbitrary or future DTO fields
      const sanitizedPastes = allPastes.map((p) => ({
        id: p.id,
        title: p.title ?? '',
        language: p.language,
        visibility: p.visibility,
        contentSizeBytes: p.contentSizeBytes,
        lineCount: p.lineCount,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt ?? null,
        version: p.version,
        views: p.views,
        folderId: p.folderId ?? null,
        folderName: p.folderName ?? null,
      }));

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        username: user?.username,
        totalExported: sanitizedPastes.length,
        isPartialExport,
        pastes: sanitizedPastes,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extrabin_metadata_${user?.username || 'user'}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (hasPaginationInconsistency) {
        setExportFeedback({
          type: 'error',
          message: `Partial export: server pagination metadata indicated additional pastes, but an empty page was encountered. Exported ${allPastes.length} pastes.`,
        });
      } else if (hitLimitWithMorePages) {
        setExportFeedback({
          type: 'error',
          message: `Export safety limit reached: exported first ${allPastes.length} pastes. Some older records were omitted.`,
        });
      } else {
        setExportFeedback({
          type: 'success',
          message: `Metadata export completed: ${allPastes.length} pastes exported.`,
        });
      }
    } catch {
      setExportFeedback({
        type: 'error',
        message: 'Failed to export metadata. Please check your network connection.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="workspace">
        <div className="py-24 text-center">
          <div className="inline-block animate-spin text-[#ff5c3d] mb-3">
            <Icon name="spark" size={28} />
          </div>
          <div className="font-mono text-xs text-[#74786f] tracking-wider uppercase">
            Loading settings...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow">
            <span></span> SETTINGS WORKSPACE
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17201d] m-0">
            Account Settings
          </h1>
          <p className="text-xs text-[#74786f] font-mono mt-1">
            Manage your ExtraBin preferences, paste defaults, editor styling, and session security.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/account"
            className="flex items-center gap-2 py-2 px-3.5 border border-[#d5d0c5] rounded-lg bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all no-underline shadow-[2px_2px_0px_#d5d0c5]"
          >
            <Icon name="file" size={14} />
            <span>Pastes &amp; Folders</span>
          </Link>
        </div>
      </div>

      {/* Two-Column Neo-Brutalist Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Sidebar */}
        <div className="md:col-span-4 lg:col-span-3">
          <nav
            aria-label="Settings navigation"
            className="paper-card p-2 space-y-1"
          >
            <div role="tablist" aria-orientation="vertical" className="space-y-1">
            {SETTINGS_TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabButtonRefs.current[idx] = el; }}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-controls={`panel-${tab.id}`}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleKeyDownTab(e, idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-mono font-bold transition-all border ${
                    isActive
                      ? 'bg-[#17201d] text-white border-[#17201d] shadow-[2px_2px_0px_#ff5c3d]'
                      : 'bg-transparent text-[#17201d] border-transparent hover:bg-[#ebe7dc] hover:border-[#d5d0c5]'
                  }`}
                >
                  <Icon name={tab.icon} size={15} className={isActive ? 'text-[#ff5c3d]' : 'text-[#74786f]'} />
                  <span className="flex-1 truncate">{tab.label}</span>
                </button>
              );
            })}
            </div>
          </nav>
        </div>

        {/* Right Active Content Panel */}
        <div className="md:col-span-8 lg:col-span-9">
          {/* Panel 1: Profile */}
          {activeTab === 'profile' && (
            <div role="tabpanel" id="panel-profile" aria-labelledby="tab-profile" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Profile Overview</h2>
                  <p className="text-xs text-[#74786f] font-mono mt-1">Verified account identity and credentials.</p>
                </div>
                <UserAvatar user={user} size="lg" showStatus={true} />
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-1">
                  <label className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider block font-mono">
                    Username
                  </label>
                  <div className="font-mono text-sm font-bold text-[#17201d]">{user.username}</div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-1">
                  <label className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider block font-mono">
                    Email Address
                  </label>
                  <div className="font-mono text-sm font-bold text-[#17201d] flex items-center justify-between">
                    <span>{user.email}</span>
                    {user.emailVerified ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#10b981]/20 text-[#047857] font-mono font-bold">
                        Verified
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#f59e0b]/20 text-[#b45309] font-mono font-bold">
                        Unverified
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-1">
                  <label className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider block font-mono">
                    Account Role
                  </label>
                  <div className="font-mono text-sm font-bold text-[#17201d]">{user.role || 'ROLE_USER'}</div>
                </div>

                {user.createdAt && (
                  <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-1">
                    <label className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider block font-mono">
                      Member Since
                    </label>
                    <div className="font-mono text-xs text-[#17201d]">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Panel 2: Account & Security */}
          {activeTab === 'security' && (
            <div role="tabpanel" id="panel-security" aria-labelledby="tab-security" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Account &amp; Security</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">Authentication controls, password reset, and active session management.</p>
              </div>

              {resetFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-mono font-semibold ${
                    resetFeedback.type === 'success'
                      ? 'bg-[#f0fdf4] text-[#166534] border border-[#86efac]'
                      : 'bg-[#fef2f2] text-[#991b1b] border border-[#fca5a5]'
                  }`}
                >
                  {resetFeedback.message}
                </div>
              )}

              <div className="space-y-4">
                {/* Password Reset Action */}
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#17201d] font-mono m-0">Change Password</h3>
                    <p className="text-xs text-[#74786f] font-mono mt-0.5">
                      Send a secure single-use password reset link to your registered email ({user.email}).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isResettingPassword}
                    onClick={handleRequestPasswordReset}
                    className="py-2 px-4 rounded-lg bg-[#17201d] text-white text-xs font-bold font-mono shadow-[2px_2px_0px_#ff5c3d] hover:bg-[#2b3531] disabled:opacity-50 transition-all shrink-0"
                  >
                    {isResettingPassword ? 'Sending...' : 'Send Password Reset Link'}
                  </button>
                </div>

                {/* Session Management Notice & Logout */}
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#17201d] font-mono m-0">Session Controls</h3>
                    <p className="text-xs text-[#74786f] font-mono mt-0.5">
                      Active session: Current browser session authenticated with secure HttpOnly cookies.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-[#f9fafb] border border-[#e5e7eb] text-xs font-mono text-[#4b5563] space-y-1">
                    <div className="font-bold text-[#17201d]">Security Policy Notice:</div>
                    <p className="m-0 leading-relaxed">
                      Multi-device remote session revocation is not supported on this server architecture. Signing out invalidates your current browser cookie.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="py-2 px-4 rounded-lg bg-[#ef4444] text-white text-xs font-bold font-mono shadow-[2px_2px_0px_#17201d] hover:bg-[#dc2626] transition-all"
                    >
                      Sign Out of this Session
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Panel 3: Paste Defaults */}
          {activeTab === 'defaults' && (
            <div role="tabpanel" id="panel-defaults" aria-labelledby="tab-defaults" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Default Paste Settings</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">
                  Applied when creating new pastes. Existing pastes and active restored drafts remain unaffected.
                </p>
              </div>

              {defaultsSavedMsg && (
                <div className="p-3 rounded-lg bg-[#f0fdf4] text-[#166534] border border-[#86efac] text-xs font-mono font-semibold">
                  {defaultsSavedMsg}
                </div>
              )}

              {defaultsErrorMsg && (
                <div className="p-3 rounded-lg bg-[#fef2f2] text-[#991b1b] border border-[#fca5a5] text-xs font-mono font-semibold">
                  {defaultsErrorMsg}
                </div>
              )}

              <form onSubmit={handleSavePasteDefaults} className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <label htmlFor="default-visibility-select" className="text-xs font-bold text-[#17201d] font-mono block">
                    Default Visibility
                  </label>
                  <p className="text-[11px] text-[#74786f] font-mono m-0">
                    Choose whether newly initialized pastes default to Unlisted (tokenized), Public, or Private.
                  </p>
                  <Select<Visibility>
                    id="default-visibility-select"
                    name="defaultVisibility"
                    ariaLabel="Default visibility"
                    value={pasteDefaults.defaultVisibility}
                    onChange={(val) => setPasteDefaults({ ...pasteDefaults, defaultVisibility: val })}
                    options={[
                      { value: 'UNLISTED', label: 'UNLISTED', description: 'Cryptographic share token required' },
                      { value: 'PUBLIC', label: 'PUBLIC', description: 'Listed in public feeds and search' },
                      { value: 'PRIVATE', label: 'PRIVATE', description: 'Visible exclusively to your authenticated account' },
                    ]}
                    menuWidth={320}
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <label htmlFor="default-expiration-select" className="text-xs font-bold text-[#17201d] font-mono block">
                    Default Expiration
                  </label>
                  <p className="text-[11px] text-[#74786f] font-mono m-0">
                    Default retention period applied when opening a new paste creation workstation.
                  </p>
                  <Select<ExpirationPolicy>
                    id="default-expiration-select"
                    name="defaultExpiration"
                    ariaLabel="Default expiration"
                    value={pasteDefaults.defaultExpiration}
                    onChange={(val) => setPasteDefaults({ ...pasteDefaults, defaultExpiration: val })}
                    options={[
                      { value: 'TEN_MINUTES', label: '10 Minutes', hint: '10m' },
                      { value: 'ONE_HOUR', label: '1 Hour', hint: '1h' },
                      { value: 'ONE_DAY', label: '1 Day', hint: '1d' },
                      { value: 'ONE_WEEK', label: '1 Week', hint: '7d' },
                      { value: 'ONE_MONTH', label: '1 Month', hint: '30d' },
                      { value: 'SIX_MONTHS', label: '6 Months', hint: '180d' },
                      { value: 'ONE_YEAR', label: '1 Year', hint: '365d' },
                      { value: 'NEVER', label: 'Never (Permanent)', hint: '∞' },
                    ]}
                    menuWidth={280}
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <label htmlFor="default-language-select" className="text-xs font-bold text-[#17201d] font-mono block">
                    Default Syntax Language
                  </label>
                  <p className="text-[11px] text-[#74786f] font-mono m-0">
                    Syntax highlighting language applied when no file extension is detected.
                  </p>
                  <Select
                    id="default-language-select"
                    name="defaultLanguage"
                    ariaLabel="Default syntax language"
                    value={pasteDefaults.defaultLanguage}
                    onChange={(val) => setPasteDefaults({ ...pasteDefaults, defaultLanguage: val })}
                    searchable
                    menuWidth={280}
                    options={[
                      { value: 'plaintext', label: 'Plain Text' },
                      { value: 'javascript', label: 'JavaScript (.js)', hint: '.js' },
                      { value: 'typescript', label: 'TypeScript (.ts)', hint: '.ts' },
                      { value: 'python', label: 'Python (.py)', hint: '.py' },
                      { value: 'java', label: 'Java (.java)', hint: '.java' },
                      { value: 'go', label: 'Go (.go)', hint: '.go' },
                      { value: 'rust', label: 'Rust (.rs)', hint: '.rs' },
                      { value: 'sql', label: 'SQL (.sql)', hint: '.sql' },
                      { value: 'json', label: 'JSON (.json)', hint: '.json' },
                      { value: 'yaml', label: 'YAML (.yaml)', hint: '.yaml' },
                      { value: 'markdown', label: 'Markdown (.md)', hint: '.md' },
                      { value: 'bash', label: 'Bash / Shell (.sh)', hint: '.sh' },
                    ]}
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="default-burn-checkbox" className="text-xs font-bold text-[#17201d] font-mono block cursor-pointer">
                      Default Auto-delete on First View
                    </label>
                    <p className="text-[11px] text-[#74786f] font-mono m-0">
                      When enabled, new pastes initialize with Burn-After-Reading active (purged immediately upon first recipient access).
                    </p>
                  </div>
                  <input
                    id="default-burn-checkbox"
                    type="checkbox"
                    aria-label="Default auto-delete on first view"
                    checked={pasteDefaults.defaultBurnAfterReading}
                    onChange={(e) => setPasteDefaults({ ...pasteDefaults, defaultBurnAfterReading: e.target.checked })}
                    className="w-4 h-4 rounded border-[#d5d0c5] text-[#ff5c3d] focus:ring-0 cursor-pointer accent-[#ff5c3d]"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-lg bg-[#ff5c3d] text-[#17201d] text-xs font-bold font-mono shadow-[2px_2px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#17201d] transition-all"
                  >
                    Save Paste Defaults
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Panel 4: Privacy & Sharing */}
          {activeTab === 'privacy' && (
            <div role="tabpanel" id="panel-privacy" aria-labelledby="tab-privacy" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Privacy &amp; Sharing Architecture</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">Cryptographic models, bearer token rules, and link security contracts.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#17201d] font-mono">
                    <Icon name="key" size={14} className="text-[#ff5c3d]" />
                    <span>Unlisted Bearer Tokens (`?token=shr_...`)</span>
                  </div>
                  <p className="text-xs text-[#74786f] font-mono leading-relaxed m-0">
                    Unlisted pastes are governed by 256-bit CSPRNG bearer tokens. Possession of the token grants read and reply permissions. To protect against enumeration or leakage, revoked or missing tokens produce indistinguishable 404 responses.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#17201d] font-mono">
                    <Icon name="lock" size={14} className="text-[#16a34a]" />
                    <span>Zero-Knowledge Client-Side Encryption (`#key=...`)</span>
                  </div>
                  <p className="text-xs text-[#74786f] font-mono leading-relaxed m-0">
                    When end-to-end encryption is enabled, content is encrypted in the browser with AES-256-GCM before upload. The secret key is placed in the URL fragment (`#key=...`), which is never sent to the ExtraBin backend servers.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#f0fdf4] border border-[#86efac] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#15803d] font-mono">
                    <Icon name="lock" size={14} />
                    <span>Strict Referrer-Policy Enforcement</span>
                  </div>
                  <p className="text-xs text-[#166534] font-mono leading-relaxed m-0">
                    Both backend Spring Security headers and frontend HTML meta tags enforce <code>no-referrer</code>, ensuring outbound HTTP links never leak query tokens to third-party endpoints.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Panel 5: Appearance & Editor */}
          {activeTab === 'editor' && (
            <div role="tabpanel" id="panel-editor" aria-labelledby="tab-editor" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Appearance &amp; Editor Preferences</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">Configure code editor typography, tab indentation, soft wrapping, and gutter lines.</p>
              </div>

              {editorSavedMsg && (
                <div className="p-3 rounded-lg bg-[#f0fdf4] text-[#166534] border border-[#86efac] text-xs font-mono font-semibold">
                  {editorSavedMsg}
                </div>
              )}

              {editorErrorMsg && (
                <div className="p-3 rounded-lg bg-[#fef2f2] text-[#991b1b] border border-[#fca5a5] text-xs font-mono font-semibold">
                  {editorErrorMsg}
                </div>
              )}

              <form onSubmit={handleSaveEditorPrefs} className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <label htmlFor="editor-font-size-select" className="text-xs font-bold text-[#17201d] font-mono block">
                    Editor Font Size
                  </label>
                  <p className="text-[11px] text-[#74786f] font-mono m-0">
                    Text size applied to both the editor textarea layer and syntax overlay.
                  </p>
                  <Select
                    id="editor-font-size-select"
                    name="fontSize"
                    ariaLabel="Editor font size"
                    value={editorPrefs.fontSize}
                    onChange={(val) => setEditorPrefs({ ...editorPrefs, fontSize: val as any })}
                    options={[
                      { value: '12px', label: '12px — Compact' },
                      { value: '14px', label: '14px — Standard Default' },
                      { value: '16px', label: '16px — High Readability' },
                    ]}
                    menuWidth={260}
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <label htmlFor="editor-tab-size-select" className="text-xs font-bold text-[#17201d] font-mono block">
                    Editor Tab Indentation
                  </label>
                  <p className="text-[11px] text-[#74786f] font-mono m-0">
                    Number of spaces inserted into the code editor when pressing the Tab key.
                  </p>
                  <Select
                    id="editor-tab-size-select"
                    name="tabSize"
                    ariaLabel="Editor tab indentation"
                    value={String(editorPrefs.tabSize)}
                    onChange={(val) => setEditorPrefs({ ...editorPrefs, tabSize: Number(val) as 2 | 4 })}
                    options={[
                      { value: '2', label: '2 Spaces' },
                      { value: '4', label: '4 Spaces' },
                    ]}
                    menuWidth={200}
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="editor-wrapping-checkbox" className="text-xs font-bold text-[#17201d] font-mono block cursor-pointer">
                      Soft Line Wrapping
                    </label>
                    <p className="text-[11px] text-[#74786f] font-mono m-0">
                      Wrap long lines automatically inside the editor without horizontal scrolling.
                    </p>
                  </div>
                  <input
                    id="editor-wrapping-checkbox"
                    type="checkbox"
                    aria-label="Soft line wrapping"
                    checked={editorPrefs.lineWrapping}
                    onChange={(e) => setEditorPrefs({ ...editorPrefs, lineWrapping: e.target.checked })}
                    className="w-4 h-4 rounded border-[#d5d0c5] text-[#ff5c3d] focus:ring-0 cursor-pointer accent-[#ff5c3d]"
                  />
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="editor-gutter-checkbox" className="text-xs font-bold text-[#17201d] font-mono block cursor-pointer">
                      Show Line Numbers
                    </label>
                    <p className="text-[11px] text-[#74786f] font-mono m-0">
                      Display line number gutter alongside code and text lines.
                    </p>
                  </div>
                  <input
                    id="editor-gutter-checkbox"
                    type="checkbox"
                    aria-label="Show line numbers"
                    checked={editorPrefs.showLineNumbers}
                    onChange={(e) => setEditorPrefs({ ...editorPrefs, showLineNumbers: e.target.checked })}
                    className="w-4 h-4 rounded border-[#d5d0c5] text-[#ff5c3d] focus:ring-0 cursor-pointer accent-[#ff5c3d]"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-lg bg-[#ff5c3d] text-[#17201d] text-xs font-bold font-mono shadow-[2px_2px_0px_#17201d] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#17201d] transition-all"
                  >
                    Save Editor Preferences
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Panel 6: Data & Account */}
          {activeTab === 'data' && (
            <div role="tabpanel" id="panel-data" aria-labelledby="tab-data" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">Data Management &amp; Safeguards</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">Export owned metadata and review account data policies.</p>
              </div>

              {exportFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-mono font-semibold ${
                    exportFeedback.type === 'success'
                      ? 'bg-[#f0fdf4] text-[#166534] border border-[#86efac]'
                      : 'bg-[#fef2f2] text-[#991b1b] border border-[#fca5a5]'
                  }`}
                >
                  {exportFeedback.message}
                </div>
              )}

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#17201d] font-mono m-0">Export Metadata</h3>
                    <p className="text-xs text-[#74786f] font-mono mt-0.5">
                      Download a JSON file containing metadata (IDs, titles, syntax languages, creation dates, views) for all pastes owned by your account.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportMetadata}
                    className="py-2 px-4 rounded-lg bg-[#17201d] text-white text-xs font-bold font-mono shadow-[2px_2px_0px_#ff5c3d] hover:bg-[#2b3531] disabled:opacity-50 transition-all shrink-0"
                  >
                    {isExporting ? 'Exporting...' : 'Export Metadata as JSON'}
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-[#fef2f2] border border-[#fca5a5] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#991b1b] font-mono">
                    <Icon name="trash" size={14} />
                    <span>Account Deletion Safeguards</span>
                  </div>
                  <p className="text-xs text-[#b91c1c] font-mono leading-relaxed m-0">
                    Self-service account deletion is currently unavailable. To maintain data integrity across encrypted records, audit logs, and orphan paste policies, account deletions must be handled through administrative request. Individual pastes can be deleted at any time from your Pastes &amp; Folders workspace.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Panel 7: About ExtraBin */}
          {activeTab === 'about' && (
            <div role="tabpanel" id="panel-about" aria-labelledby="tab-about" className="paper-card p-6 space-y-6">
              <div className="border-b border-[#d5d0c5] pb-4">
                <h2 className="text-xl font-bold text-[#17201d] font-mono m-0">About ExtraBin</h2>
                <p className="text-xs text-[#74786f] font-mono mt-1">Verified application specifications, API contracts, and documentation.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <div className="font-mono text-sm font-bold text-[#17201d]">ExtraBin Core Specifications</div>
                  <div className="space-y-1.5 text-xs font-mono text-[#74786f]">
                    <div>Application Version: v0.1.0</div>
                    <div>API Specification: v1.0.0</div>
                    <div>License: Apache 2.0</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-[#d5d0c5] space-y-2">
                  <div className="font-mono text-sm font-bold text-[#17201d]">Developer &amp; API Documentation</div>
                  <p className="text-xs text-[#74786f] font-mono leading-relaxed m-0">
                    Explore OpenAPI 3.0 schema definitions, endpoints, DTOs, and error Problem Details specifications directly through the interactive Swagger UI.
                  </p>
                  <div className="pt-2">
                    <a
                      href="/swagger-ui.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 py-2 px-3.5 border border-[#d5d0c5] rounded-lg bg-white text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc] transition-all no-underline shadow-[2px_2px_0px_#d5d0c5]"
                    >
                      <Icon name="code" size={13} />
                      <span>Interactive OpenAPI Documentation</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
