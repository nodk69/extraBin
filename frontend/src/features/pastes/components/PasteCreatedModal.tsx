import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Eye,
  FileCode,
  Flame,
  KeyRound,
  Lock,
  ShieldAlert,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { pasteApi } from '../api/pasteApi';
import { ApiError } from '../../../lib/api-client/client';
import { buildCanonicalShareUrl, resolvePublicBaseUrl } from '../lib/shareUrl';

interface PasteCreatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  pasteId: string;
  shareToken?: string | null;
  deletionCapability?: string | null;
  isBurnAfterReading?: boolean;
  isViewOnce?: boolean;
  isPasswordProtected?: boolean;
  encryptionMode?: 'LINK' | 'PASSPHRASE' | null;
  linkKey?: string | null;
  isPassphraseProtected?: boolean;
}

type ShareMode = 'one-link' | 'split';

export const PasteCreatedModal: React.FC<PasteCreatedModalProps> = ({
  isOpen,
  onClose,
  pasteId,
  shareToken,
  deletionCapability,
  isBurnAfterReading,
  isViewOnce,
  isPasswordProtected,
  encryptionMode,
  linkKey,
  isPassphraseProtected: _isPassphraseProtected,
}) => {
  const [currentPasteId, setCurrentPasteId] = useState(pasteId);
  const [shareMode, setShareMode] = useState<ShareMode>('one-link');
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isCleanLinkCopied, setIsCleanLinkCopied] = useState(false);
  const [isKeyCopied, setIsKeyCopied] = useState(false);
  const [isSecretCopied, setIsSecretCopied] = useState(false);
  const [isJsonUrlCopied, setIsJsonUrlCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [customSlugInput, setCustomSlugInput] = useState('');
  const [isSavingSlug, setIsSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const timerRefs = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const addTimer = (callback: () => void, ms: number) => {
    timerRefs.current.push(setTimeout(callback, ms));
  };

  useEffect(() => {
    return () => {
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, []);

  useEffect(() => {
    setCurrentPasteId(pasteId);
    setCustomSlugInput(pasteId);
    setIsEditingUrl(false);
    setSlugError(null);
    setSlugSuccess(null);
    setCopyError(null);
    setIsLinkCopied(false);
    setIsCleanLinkCopied(false);
    setIsKeyCopied(false);
    setIsSecretCopied(false);
    setIsJsonUrlCopied(false);
    setShareMode('one-link');
  }, [pasteId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const viewOnceActive = isViewOnce || isBurnAfterReading;
  if (!isOpen) return null;

  const publicBase = resolvePublicBaseUrl();
  const keyFragment = encryptionMode === 'LINK' && linkKey ? `#key=${encodeURIComponent(linkKey)}` : '';
  const tokenQuery = shareToken ? `?token=${encodeURIComponent(shareToken)}` : '';
  const cleanShareUrl = buildCanonicalShareUrl({
    baseUrl: publicBase,
    pasteId: currentPasteId,
    token: shareToken,
  });
  const shareUrl = buildCanonicalShareUrl({
    baseUrl: publicBase,
    pasteId: currentPasteId,
    token: shareToken,
    keyFragment: encryptionMode === 'LINK' ? linkKey : null,
  });
  const rawUrl = currentPasteId ? pasteApi.getRawUrl(currentPasteId, shareToken || undefined) : '';
  const jsonUrl = `${window.location.origin}/api/v1/pastes/${currentPasteId}.json`;

  const showSplitMode = encryptionMode === 'LINK' && !!linkKey;

  const flashCopied = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setter(true);
    addTimer(() => setter(false), 1600);
  };

  const handleCopy = async (text: string, setter: React.Dispatch<React.SetStateAction<boolean>>, fallbackMsg: string) => {
    try {
      setCopyError(null);
      await navigator.clipboard.writeText(text);
      flashCopied(setter);
    } catch {
      setCopyError(fallbackMsg);
    }
  };

  const handleStartEditingUrl = () => {
    setCustomSlugInput(currentPasteId);
    setSlugError(null);
    setSlugSuccess(null);
    setIsEditingUrl(true);
  };

  const handleCancelEditingUrl = () => {
    setCustomSlugInput(currentPasteId);
    setSlugError(null);
    setIsEditingUrl(false);
  };

  const handleSaveCustomSlug = async () => {
    const clean = customSlugInput.trim();
    if (!clean) { setSlugError('Link name cannot be blank.'); return; }
    if (clean === currentPasteId) { setIsEditingUrl(false); return; }
    if (clean.length < 3 || clean.length > 50) { setSlugError('Link name must be between 3 and 50 characters.'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) { setSlugError('Only letters, numbers, hyphens, and underscores.'); return; }

    setIsSavingSlug(true);
    setSlugError(null);
    try {
      const res = await pasteApi.updatePasteSlug(currentPasteId, clean, deletionCapability || undefined);
      setCurrentPasteId(res.id);
      setIsEditingUrl(false);
      setSlugSuccess(`URL updated to /p/${res.id}!`);
      addTimer(() => setSlugSuccess(null), 4000);
    } catch (err) {
      setSlugError(err instanceof ApiError ? err.detail : 'Failed to update URL link name.');
    } finally {
      setIsSavingSlug(false);
    }
  };

  const handleOpenPaste = () => {
    if (viewOnceActive) {
      if (!window.confirm(
        'WARNING: This paste is set to BURN ON READ.\n\nOpening it right now counts as the single allowed view, meaning it will immediately self-destruct before your intended recipient can read it.\n\nAre you sure you want to open and destroy it now?'
      )) return;
    }
    if (deletionCapability) {
      try { localStorage.setItem(`extrabin_del_${currentPasteId}`, deletionCapability); } catch { /* ignore */ }
    }
    window.location.href = `/p/${currentPasteId}${tokenQuery}${keyFragment}`;
  };

  const shareTwitter = () => {
    const target = encryptionMode === 'LINK' ? cleanShareUrl : shareUrl;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this paste on extraBin: ${target}`)}`, '_blank', 'noopener,noreferrer');
  };

  const shareWhatsApp = () => {
    const target = encryptionMode === 'LINK' ? cleanShareUrl : shareUrl;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this paste: ${target}`)}`, '_blank', 'noopener,noreferrer');
  };

  // Determine header content based on paste type
  const headerIcon = viewOnceActive
    ? <Flame className="w-5 h-5 text-white" />
    : encryptionMode || isPasswordProtected
      ? <Lock className="w-5 h-5 text-white" />
      : <Check className="w-5 h-5 text-white" />;

  const headerBg = viewOnceActive
    ? 'bg-[#ff5c3d]'
    : encryptionMode
      ? 'bg-[#1f9d63]'
      : isPasswordProtected
        ? 'bg-[#4f46e5]'
        : 'bg-[#1f9d63]';

  const headerTitle = viewOnceActive
    ? 'View-once paste armed'
    : encryptionMode
      ? 'Encrypted paste ready'
      : isPasswordProtected
        ? 'Password-protected paste ready'
        : 'Your paste is ready';

  const headerSub = viewOnceActive
    ? 'Opens once, then self-destructs. Do not open it yourself.'
    : encryptionMode
      ? 'Encrypted in your browser. We never see the contents.'
      : isPasswordProtected
        ? 'Recipients need the password to unlock this paste.'
        : 'Share the link below with anyone who needs access.';

  // Determine security note content
  const noteIcon = viewOnceActive
    ? <ShieldAlert className="w-[18px] h-[18px] shrink-0 mt-px" />
    : encryptionMode
      ? <Lock className="w-[18px] h-[18px] shrink-0 mt-px" />
      : <ShieldAlert className="w-[18px] h-[18px] shrink-0 mt-px" />;

  const noteText = viewOnceActive
    ? 'Opening this link yourself will consume the single view. Send it directly to your recipient.'
    : encryptionMode === 'LINK'
      ? 'The decryption key lives in the URL fragment (#key=...). Your server never sees it.'
      : encryptionMode === 'PASSPHRASE'
        ? 'Share the passphrase over a separate channel. The link alone cannot decrypt.'
        : shareToken
          ? 'This link contains a secret access token. Anyone with it can read the paste.'
          : 'Anyone with this link can read your paste. Send it only to people you trust.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#17201d]/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-created-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-[480px] bg-[#faf8f2] border-2 border-[#17201d] rounded-[20px] shadow-[8px_8px_0px_#17201d] overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-[#74786f] hover:text-[#17201d] hover:bg-[#efece3] transition-all cursor-pointer"
          title="Close"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ── Header ── */}
        <div className="flex items-center gap-3.5 px-[22px] pt-[22px] pb-2">
          <div className={`w-11 h-11 shrink-0 rounded-full border-2 border-[#17201d] grid place-items-center ${headerBg}`}>
            {headerIcon}
          </div>
          <div className="pr-6">
            <h2 id="paste-created-title" className="m-0 text-[22px] leading-[1.15] font-bold text-[#17201d] font-['Space_Grotesk',system-ui,sans-serif]">
              {headerTitle}
            </h2>
            <p className="m-0 mt-0.5 text-[13px] text-[#5d6863] font-['Space_Grotesk',system-ui,sans-serif]">
              {headerSub}
            </p>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-[22px] pb-5 overflow-y-auto flex-1">

          {/* Segmented share-mode control (only for E2EE LINK mode with split option) */}
          {showSplitMode && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#efece3] rounded-xl mb-3.5" role="group" aria-label="How to share">
              <button
                type="button"
                aria-pressed={shareMode === 'one-link'}
                onClick={() => setShareMode('one-link')}
                className={`font-['Space_Grotesk',sans-serif] text-[13px] font-bold py-[9px] px-2 border-0 rounded-[9px] cursor-pointer transition-all ${
                  shareMode === 'one-link'
                    ? 'bg-white text-[#17201d] shadow-[0_0_0_2px_#17201d]'
                    : 'bg-transparent text-[#5d6863] hover:text-[#17201d]'
                }`}
              >
                One link
              </button>
              <button
                type="button"
                aria-pressed={shareMode === 'split'}
                onClick={() => setShareMode('split')}
                className={`font-['Space_Grotesk',sans-serif] text-[13px] font-bold py-[9px] px-2 border-0 rounded-[9px] cursor-pointer transition-all ${
                  shareMode === 'split'
                    ? 'bg-white text-[#17201d] shadow-[0_0_0_2px_#17201d]'
                    : 'bg-transparent text-[#5d6863] hover:text-[#17201d]'
                }`}
              >
                Link and key apart
              </button>
            </div>
          )}

          {/* ── Mode 1: One link ── */}
          {(!showSplitMode || shareMode === 'one-link') && (
            <div className="space-y-3">
              {/* URL field */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#5d6863] font-['JetBrains_Mono',monospace] font-medium">
                    {showSplitMode ? 'Share this link' : 'Share this link'}
                  </span>
                  <button
                    type="button"
                    onClick={isEditingUrl ? handleCancelEditingUrl : handleStartEditingUrl}
                    className="bg-none border-0 p-0 text-xs font-['Space_Grotesk',sans-serif] text-[#17201d] underline cursor-pointer hover:text-[#ff5c3d] transition-colors"
                  >
                    {isEditingUrl ? 'Cancel' : 'Rename link'}
                  </button>
                </div>

                {!isEditingUrl ? (
                  <div className="flex items-stretch bg-white border-2 border-[#17201d] rounded-[14px] overflow-hidden">
                    <div
                      className="flex-1 min-w-0 px-3.5 py-[18px] font-['JetBrains_Mono',ui-monospace,monospace] text-[13px] font-medium text-[#17201d] whitespace-nowrap overflow-hidden text-ellipsis self-center"
                      role="textbox"
                      aria-readonly="true"
                      aria-label="Shareable paste URL"
                    >
                      {shareMode === 'one-link' && showSplitMode
                        ? <>{cleanShareUrl.split('/p/')[1] ? <>{publicBase.replace(/^https?:\/\//, '')}/p/{currentPasteId}<span className="text-[#5d6863]">#key={linkKey?.slice(0, 4)}&hellip;</span></> : shareUrl}</>
                        : <>{shareUrl.length > 48 ? `${shareUrl.slice(0, 48)}...` : shareUrl}</>
                      }
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(shareUrl, setIsLinkCopied, 'Could not copy. Press Ctrl+C.')}
                      className={`shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-sm px-5 border-0 border-l-2 border-l-[#17201d] cursor-pointer min-w-[92px] transition-all ${
                        isLinkCopied
                          ? 'bg-[#1f9d63] text-white'
                          : 'bg-[#ff5c3d] text-[#17201d] hover:brightness-105'
                      }`}
                    >
                      {isLinkCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  /* Inline URL rename form */
                  <div className="p-3 rounded-[14px] border-2 border-[#ff5c3d] bg-white shadow-[2px_2px_0px_#17201d] space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[#17201d]">
                      <span className="flex items-center gap-1">
                        <Edit3 className="w-3.5 h-3.5 text-[#ff5c3d]" />
                        <span>Custom URL name:</span>
                      </span>
                      <span className="text-[11px] text-[#74786f] font-normal">{customSlugInput.length}/50</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1.5 text-xs font-mono font-bold text-[#74786f] bg-[#efece3] border border-[#d5d0c5] rounded-lg select-none shrink-0">
                        /p/
                      </span>
                      <input
                        type="text"
                        value={customSlugInput}
                        onChange={(e) => {
                          setCustomSlugInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''));
                          setSlugError(null);
                        }}
                        maxLength={50}
                        placeholder="your-custom-name"
                        className="flex-1 bg-[#fbfaf8] border-2 border-[#17201d] px-2.5 py-1.5 rounded-lg font-mono text-xs text-[#17201d] font-bold focus:outline-none focus:ring-2 focus:ring-[#ff5c3d]"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={isSavingSlug || !customSlugInput.trim() || customSlugInput.trim() === currentPasteId}
                        onClick={handleSaveCustomSlug}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#1f9d63] disabled:opacity-40 text-white font-mono text-xs font-bold border-2 border-[#17201d] shadow-[2px_2px_0px_#17201d] hover:bg-[#15803d] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingSlug ? 'Saving...' : 'Save'}</span>
                      </button>
                    </div>
                    {slugError && (
                      <p className="m-0 text-xs font-mono font-bold text-[#dc2626]">{slugError}</p>
                    )}
                  </div>
                )}

                {slugSuccess && (
                  <div className="mt-1.5 p-2 rounded-lg bg-[#f0fdf4] border border-[#86efac] text-[#166534] text-xs font-mono font-bold flex items-center gap-1.5 animate-in fade-in duration-150">
                    <Check className="w-3.5 h-3.5 text-[#15803d]" />
                    <span>{slugSuccess}</span>
                  </div>
                )}

                {copyError && (
                  <p role="status" aria-live="polite" className="m-0 mt-1.5 text-xs font-mono font-bold text-red-600">
                    {copyError}
                  </p>
                )}
              </div>

              {/* Security note */}
              <div className="flex gap-2.5 items-start p-3 bg-[#efece3] rounded-xl text-[13px] text-[#17201d] font-['Space_Grotesk',sans-serif]">
                {noteIcon}
                <span>{noteText}</span>
              </div>

              {/* Passphrase guidance (PASSPHRASE mode only) */}
              {encryptionMode === 'PASSPHRASE' && (
                <div className="flex gap-2.5 items-start p-3 bg-[#fef9c3] border border-[#fde047] rounded-xl text-[13px] text-[#854d0e] font-['Space_Grotesk',sans-serif]">
                  <KeyRound className="w-[18px] h-[18px] shrink-0 mt-px text-[#ca8a04]" />
                  <span>Share the <strong>passphrase</strong> separately. The link alone cannot decrypt the paste.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Mode 2: Link and key apart ── */}
          {showSplitMode && shareMode === 'split' && (
            <div className="space-y-3">
              {/* Link field (without key fragment) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#5d6863] font-['JetBrains_Mono',monospace] font-medium">
                    1. Send the link
                  </span>
                  <button
                    type="button"
                    onClick={isEditingUrl ? handleCancelEditingUrl : handleStartEditingUrl}
                    className="bg-none border-0 p-0 text-xs font-['Space_Grotesk',sans-serif] text-[#17201d] underline cursor-pointer hover:text-[#ff5c3d] transition-colors"
                  >
                    {isEditingUrl ? 'Cancel' : 'Rename link'}
                  </button>
                </div>

                {!isEditingUrl ? (
                  <div className="flex items-stretch bg-white border-2 border-[#17201d] rounded-[14px] overflow-hidden">
                    <div className="flex-1 min-w-0 px-3.5 py-[13px] font-['JetBrains_Mono',ui-monospace,monospace] text-[13px] font-medium text-[#17201d] whitespace-nowrap overflow-hidden text-ellipsis self-center">
                      {cleanShareUrl.replace(/^https?:\/\//, '')}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(cleanShareUrl, setIsCleanLinkCopied, 'Could not copy. Press Ctrl+C.')}
                      className={`shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-sm px-5 border-0 border-l-2 border-l-[#17201d] cursor-pointer min-w-[92px] transition-all ${
                        isCleanLinkCopied ? 'bg-[#1f9d63] text-white' : 'bg-[#ff5c3d] text-[#17201d] hover:brightness-105'
                      }`}
                    >
                      {isCleanLinkCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-[14px] border-2 border-[#ff5c3d] bg-white shadow-[2px_2px_0px_#17201d] space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[#17201d]">
                      <span className="flex items-center gap-1"><Edit3 className="w-3.5 h-3.5 text-[#ff5c3d]" /><span>Custom URL name:</span></span>
                      <span className="text-[11px] text-[#74786f] font-normal">{customSlugInput.length}/50</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1.5 text-xs font-mono font-bold text-[#74786f] bg-[#efece3] border border-[#d5d0c5] rounded-lg select-none shrink-0">/p/</span>
                      <input
                        type="text"
                        value={customSlugInput}
                        onChange={(e) => { setCustomSlugInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '')); setSlugError(null); }}
                        maxLength={50}
                        placeholder="your-custom-name"
                        className="flex-1 bg-[#fbfaf8] border-2 border-[#17201d] px-2.5 py-1.5 rounded-lg font-mono text-xs text-[#17201d] font-bold focus:outline-none focus:ring-2 focus:ring-[#ff5c3d]"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={isSavingSlug || !customSlugInput.trim() || customSlugInput.trim() === currentPasteId}
                        onClick={handleSaveCustomSlug}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-[#1f9d63] disabled:opacity-40 text-white font-mono text-xs font-bold border-2 border-[#17201d] shadow-[2px_2px_0px_#17201d] hover:bg-[#15803d] active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /><span>{isSavingSlug ? 'Saving...' : 'Save'}</span>
                      </button>
                    </div>
                    {slugError && <p className="m-0 text-xs font-mono font-bold text-[#dc2626]">{slugError}</p>}
                  </div>
                )}
              </div>

              {/* Key field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#5d6863] font-['JetBrains_Mono',monospace] font-medium">
                    2. Send the key by another route
                  </span>
                </div>
                <div className="flex items-stretch bg-white border-2 border-[#17201d] rounded-[14px] overflow-hidden">
                  <div className="flex-1 min-w-0 px-3.5 py-[13px] font-['JetBrains_Mono',ui-monospace,monospace] text-[13px] font-medium text-[#17201d] whitespace-nowrap overflow-hidden text-ellipsis self-center select-all">
                    {linkKey}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(linkKey!, setIsKeyCopied, 'Could not copy key. Select and copy manually.')}
                    className={`shrink-0 font-['Space_Grotesk',sans-serif] font-bold text-sm px-5 border-0 border-l-2 border-l-[#17201d] cursor-pointer min-w-[92px] transition-all ${
                      isKeyCopied ? 'bg-[#1f9d63] text-white' : 'bg-[#ff5c3d] text-[#17201d] hover:brightness-105'
                    }`}
                  >
                    {isKeyCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Security note for split mode */}
              <div className="flex gap-2.5 items-start p-3 bg-[#efece3] rounded-xl text-[13px] text-[#17201d] font-['Space_Grotesk',sans-serif]">
                <Lock className="w-[18px] h-[18px] shrink-0 mt-px" />
                <span>Use two channels — email for the link, Signal for the key. If one leaks, the paste stays locked.</span>
              </div>

              {copyError && (
                <p role="status" aria-live="polite" className="m-0 text-xs font-mono font-bold text-red-600">{copyError}</p>
              )}
              {slugSuccess && (
                <div className="p-2 rounded-lg bg-[#f0fdf4] border border-[#86efac] text-[#166534] text-xs font-mono font-bold flex items-center gap-1.5 animate-in fade-in duration-150">
                  <Check className="w-3.5 h-3.5 text-[#15803d]" /><span>{slugSuccess}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Advanced accordion ── */}
          <div className="mt-4 pt-3 border-t-2 border-dashed border-[#d9d5c8]">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between py-1 text-xs font-['JetBrains_Mono',monospace] text-[#5d6863] hover:text-[#17201d] transition-colors cursor-pointer select-none"
            >
              <span className="font-bold flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5" />
                <span>Advanced</span>
              </span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="mt-2.5 space-y-2.5 animate-in fade-in duration-150">
                {/* Deletion secret */}
                {deletionCapability && (
                  <div className="p-3 rounded-xl border border-[#d5d0c5] bg-white space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[#17201d]">
                      <span>Anonymous Deletion Secret</span>
                      <span className="text-[10px] text-[#74786f] font-normal">Shown once</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#efece3] border border-[#d5d0c5] font-mono text-xs text-[#17201d] truncate select-all">
                        {deletionCapability}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(deletionCapability!, setIsSecretCopied, 'Could not copy secret.')}
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg border border-[#17201d] font-mono text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
                          isSecretCopied
                            ? 'bg-[#1f9d63] text-white'
                            : 'bg-[#efece3] hover:bg-[#ddd7ca] text-[#17201d]'
                        }`}
                      >
                        {isSecretCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{isSecretCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* API endpoint */}
                {!encryptionMode && (
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono">
                    <span className="text-[#5d6863] truncate">GET /api/v1/pastes/{currentPasteId}.json</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(jsonUrl, setIsJsonUrlCopied, 'Could not copy JSON URL.')}
                      className={`shrink-0 px-2.5 py-1 rounded-md border border-[#17201d] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                        isJsonUrlCopied
                          ? 'bg-[#1f9d63] text-white'
                          : 'bg-[#efece3] hover:bg-[#ddd7ca] text-[#17201d]'
                      }`}
                    >
                      {isJsonUrlCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{isJsonUrlCopied ? 'Copied' : 'JSON'}</span>
                    </button>
                  </div>
                )}

                {/* Raw endpoint link */}
                <div className="flex items-center gap-2 p-2.5 rounded-xl border border-[#d5d0c5] bg-white text-xs font-mono">
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-0.5 rounded bg-[#efece3] hover:bg-[#ddd7ca] border border-[#d5d0c5] text-[#17201d] flex items-center gap-1 font-bold no-underline"
                  >
                    <span>{encryptionMode ? 'Raw (ciphertext)' : 'Raw content'}</span>
                    <ExternalLink className="w-3 h-3 text-[#74786f]" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-2 px-[22px] py-4 border-t-2 border-dashed border-[#d9d5c8]">
          <button
            type="button"
            onClick={shareTwitter}
            className="w-10 h-10 grid place-items-center border-2 border-[#17201d] rounded-[11px] bg-white text-[#17201d] cursor-pointer font-bold text-[13px] font-['JetBrains_Mono',monospace] hover:bg-[#efece3] transition-colors no-underline"
            title="Share on X"
            aria-label="Share on X"
          >
            X
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            className="w-10 h-10 grid place-items-center border-2 border-[#17201d] rounded-[11px] bg-white text-[#17201d] cursor-pointer font-bold text-[11px] font-['JetBrains_Mono',monospace] hover:bg-[#efece3] transition-colors no-underline"
            title="Share on WhatsApp"
            aria-label="Share on WhatsApp"
          >
            WA
          </button>
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 grid place-items-center border-2 border-[#17201d] rounded-[11px] bg-white text-[#17201d] cursor-pointer font-bold text-[11px] font-['JetBrains_Mono',monospace] hover:bg-[#efece3] transition-colors no-underline"
            title="View raw content"
            aria-label="View raw content"
          >
            &lt;/&gt;
          </a>

          <span className="flex-1" />

          {viewOnceActive ? (
            <button
              type="button"
              onClick={handleOpenPaste}
              className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] px-6 py-2.5 border-2 border-[#dc2626] rounded-xl bg-white text-[#b91c1c] cursor-pointer shadow-[3px_3px_0px_#dc2626] hover:bg-red-50 active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5"
              title="Warning: opening will permanently delete this paste"
            >
              <Eye className="w-4 h-4" />
              <span>Open & Burn</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenPaste}
              className="font-['Space_Grotesk',sans-serif] font-bold text-[15px] px-6 py-2.5 border-2 border-[#17201d] rounded-xl bg-[#17201d] text-[#faf8f2] cursor-pointer shadow-[3px_3px_0px_#ff5c3d] hover:bg-[#2a3633] active:translate-y-[1px] active:shadow-none transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
