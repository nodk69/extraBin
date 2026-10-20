import React, { useState, useEffect } from 'react';
import { RefreshCw, Slash, Copy, Check, AlertTriangle, X, Shield } from 'lucide-react';
import { pasteApi } from '../api/pasteApi';
import { ApiError } from '../../../lib/api-client/client';
import { PasteView } from '../types/paste';

interface ShareManagementModalProps {
  paste: PasteView;
  isOpen: boolean;
  onClose: () => void;
  onStatusChanged: (status: 'ACTIVE' | 'REVOKED', newShareToken?: string) => void;
  storedCapability?: string | null;
}

export const ShareManagementModal: React.FC<ShareManagementModalProps> = ({
  paste,
  isOpen,
  onClose,
  onStatusChanged,
  storedCapability,
}) => {
  const [capabilityInput, setCapabilityInput] = useState(storedCapability || '');
  const [isRotating, setIsRotating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentShareToken, setCurrentShareToken] = useState<string | null>(paste.shareToken || null);
  const [currentStatus, setCurrentStatus] = useState<'ACTIVE' | 'REVOKED'>(paste.shareStatus || 'ACTIVE');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (storedCapability) {
        setCapabilityInput(storedCapability);
      }
      setCurrentStatus(paste.shareStatus || 'ACTIVE');
      setCurrentShareToken(paste.shareToken || null);
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowRevokeConfirm(false);
    }
  }, [isOpen, storedCapability, paste.shareStatus, paste.shareToken]);

  if (!isOpen) return null;

  const rawKeyFragment = window.location.hash ? window.location.hash.replace(/^#key=/, '') : null;
  const isEncrypted = Boolean(paste.encryptionMode);

  const publicUrl = pasteApi.buildShareableUrl(
    window.location.origin,
    paste.id,
    currentStatus === 'ACTIVE' ? currentShareToken : null,
    null
  );

  const encryptedAccessUrl = pasteApi.buildShareableUrl(
    window.location.origin,
    paste.id,
    currentStatus === 'ACTIVE' ? currentShareToken : null,
    rawKeyFragment
  );

  const currentUrl = isEncrypted && rawKeyFragment ? encryptedAccessUrl : publicUrl;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy shareable link:', currentUrl);
    }
  };

  const handleCopyPublicLinkOnly = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy public link:', publicUrl);
    }
  };

  const effectiveCapability = capabilityInput.trim() || undefined;

  const handleRotate = async () => {
    if (isRotating || isRevoking) return;
    setIsRotating(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    // Stale link protection: clear active token immediately during rotation
    setCurrentShareToken(null);

    try {
      const res = await pasteApi.rotateLink(paste.id, effectiveCapability);
      setCurrentShareToken(res.shareToken);
      setCurrentStatus('ACTIVE');
      setSuccessMessage('Share link successfully rotated! Old links have been permanently invalidated.');
      onStatusChanged('ACTIVE', res.shareToken);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Failed to rotate link. Check your permissions and try again.');
      }
    } finally {
      setIsRotating(false);
    }
  };

  const handleRevoke = async () => {
    if (isRotating || isRevoking) return;
    setIsRevoking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await pasteApi.revokeLink(paste.id, effectiveCapability);
      setCurrentStatus('REVOKED');
      setCurrentShareToken(null);
      setShowRevokeConfirm(false);
      setSuccessMessage('Share link has been revoked. All access to this unlisted paste via share links is now blocked.');
      onStatusChanged('REVOKED', undefined);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail);
      } else {
        setErrorMessage('Failed to revoke link. Check your permissions and try again.');
      }
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-management-title"
    >
      <div className="w-full max-w-lg paper-card p-6 shadow-2xl space-y-5 bg-[#faf8f2] border-2 border-[#17201d] rounded-xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#74786f] hover:text-[#17201d] hover:bg-[#ebe7dc] transition-all"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl border-2 border-[#17201d] bg-[#dcfce7] text-[#16a34a] shadow-[2px_2px_0px_#17201d]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 id="share-management-title" className="text-lg font-bold text-[#17201d] font-mono">
              Share Link Management
            </h2>
            <p className="text-xs text-[#74786f] font-mono">
              Control access to your unlisted paste.
            </p>
          </div>
        </div>

        {/* Current status display */}
        <div className="p-3.5 rounded-xl border border-[#d5d0c5] bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#74786f] uppercase font-mono">Status</span>
            {currentStatus === 'ACTIVE' ? (
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#dcfce7] text-[#15803d] border border-[#16a34a]">
                ACTIVE
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-red-100 text-red-700 border border-red-300">
                REVOKED
              </span>
            )}
          </div>

          {currentStatus === 'ACTIVE' ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentUrl}
                  className="flex-1 bg-[#f4f1e9] border border-[#d5d0c5] px-2.5 py-1.5 rounded-lg font-mono text-xs text-[#17201d] select-all truncate"
                  aria-label="Current shareable URL"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[#ff5c3d] text-white border border-[#17201d] font-mono text-xs font-bold shadow-[2px_2px_0px_#17201d] flex items-center gap-1 cursor-pointer"
                  title={isEncrypted && rawKeyFragment ? "Copy link including client-side decryption key" : "Copy shareable link"}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              {isEncrypted && rawKeyFragment && (
                <div className="flex items-center justify-between pt-1 border-t border-[#e5e0d3]">
                  <span className="text-[11px] font-mono text-[#74786f]">
                    Key attached in link. Need link without key?
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPublicLinkOnly}
                    className="text-[11px] font-mono text-[#17201d] hover:text-[#ff5c3d] underline flex items-center gap-1 cursor-pointer"
                  >
                    Copy Without Key
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs font-mono text-red-600 m-0">
              This link is revoked. Anyone attempting to visit this paste will receive a 404 Not Found error.
            </p>
          )}
        </div>

        {/* Anonymous capability input if not author */}
        {!paste.isOwner && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#17201d] font-mono uppercase tracking-wider block">
              Deletion / Management Secret:
            </label>
            <input
              type="text"
              value={capabilityInput}
              onChange={(e) => setCapabilityInput(e.target.value)}
              placeholder="del_..."
              className="w-full font-mono text-xs px-3 py-2 bg-white border border-[#aaa89f] rounded-lg text-[#17201d] focus:border-[#17201d] outline-none"
            />
            <p className="text-[11px] font-mono text-[#74786f]">
              Required for anonymous creators who hold the secret deletion capability.
            </p>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-lg bg-red-100 border border-red-800 text-xs text-red-900 font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-[#f0fdf4] border border-[#86efac] text-[#166534] text-xs font-mono font-bold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-[#15803d]" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Confirmation prompt for revoke */}
        {showRevokeConfirm ? (
          <div className="p-4 rounded-xl border-2 border-red-500 bg-red-50 text-red-950 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-sm text-red-700">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Revocation</span>
            </div>
            <p className="text-xs font-mono leading-relaxed m-0">
              Revoking the link will immediately render the current URL inaccessible to everyone. Are you sure you want to proceed?
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(false)}
                disabled={isRevoking}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#d5d0c5] font-mono text-xs font-semibold text-[#17201d] hover:bg-[#ebe7dc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white border border-red-800 font-mono text-xs font-bold shadow-[2px_2px_0px_#7f1d1d] hover:bg-red-700"
              >
                {isRevoking ? 'Revoking...' : 'Yes, Revoke Link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#d5d0c5]">
            <button
              type="button"
              disabled={isRotating || isRevoking}
              onClick={handleRotate}
              className="px-4 py-2 rounded-lg bg-[#f4f1e9] hover:bg-[#ebe7dc] border border-[#17201d] font-mono text-xs font-bold text-[#17201d] shadow-[2px_2px_0px_#17201d] flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
              <span>{isRotating ? 'Rotating...' : 'Rotate Token'}</span>
            </button>

            {currentStatus === 'ACTIVE' && (
              <button
                type="button"
                disabled={isRotating || isRevoking}
                onClick={() => setShowRevokeConfirm(true)}
                className="px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-mono text-xs font-bold shadow-[2px_2px_0px_#fca5a5] flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Slash className="w-3.5 h-3.5" />
                <span>Revoke Access</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
