import React from 'react';
import { Clock, Eye, Globe, Lock, Share2 } from 'lucide-react';
import type { PasteView, PasteFileItem } from '../../types/paste';
import { TechnologyIcon } from '../../../../components/ui/TechnologyIcon';

interface PasteHeaderProps {
  paste: PasteView;
  files: PasteFileItem[];
  statusMessage: string | null;
}

export const PasteHeader: React.FC<PasteHeaderProps> = ({ paste, files, statusMessage }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 mb-5 border-b border-[#d8d4ca]">
      <div className="space-y-2">
        <div className="eyebrow">
          <span></span> SHARED RECORD
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#17201d] tracking-tight m-0 break-words">
            {paste.title || 'Untitled Paste'}
          </h1>

          <span className="paper-badge inline-flex items-center gap-1.5">
            <TechnologyIcon language={paste.language} title={paste.title} size={13} />
            {paste.language}
          </span>

          {paste.encryptionMode && (
            <span className="paper-badge bg-[#dcfce7] border-[#16a34a] text-[#166534]">
              <Lock className="w-3 h-3 mr-0.5" /> End-to-End Encrypted
            </span>
          )}

          {paste.visibility === 'PUBLIC' && (
            <span className="paper-badge highlight">
              <Globe className="w-3 h-3 mr-0.5" /> Public
            </span>
          )}
          {paste.visibility === 'UNLISTED' && (
            <span className="paper-badge blue">
              <Share2 className="w-3 h-3 mr-0.5" /> Unlisted
            </span>
          )}
          {paste.visibility === 'PRIVATE' && (
            <span className="paper-badge coral">
              <Lock className="w-3 h-3 mr-0.5" /> Private
            </span>
          )}

          {(paste.viewOnce || paste.burnAfterReading) && (
            <span className="paper-badge coral animate-pulse">
              <Eye className="w-3 h-3 mr-0.5" /> View Once
            </span>
          )}

          {paste.passwordProtected && (
            <span className="paper-badge highlight">
              <Lock className="w-3 h-3 mr-0.5" /> Passcode Protected
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[#74776f]">
          <span>
            ID: <code className="text-[#17201d] font-bold">{paste.id}</code>
          </span>
          <span>•</span>
          <span>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
          <span>•</span>
          <span>{(paste.contentSizeBytes / 1024).toFixed(1)} KB</span>
          <span>•</span>
          <span>{paste.lineCount} total lines</span>
          <span>•</span>
          <span>Created {new Date(paste.createdAt).toLocaleDateString()}</span>
          <span>•</span>
          <span className="flex items-center gap-1 font-semibold text-[#17201d]">
            <Eye className="w-3.5 h-3.5 text-[#74776f]" />
            <span>{(paste.views ?? 0).toLocaleString()} {(paste.views ?? 0) === 1 ? 'view' : 'views'}</span>
          </span>
          {paste.expiresAt && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-[#ff5c3d] font-semibold">
                <Clock className="w-3 h-3" />
                <span>Expires {new Date(paste.expiresAt).toLocaleDateString()}</span>
              </span>
            </>
          )}
        </div>

        {/* Visibility Explanation */}
        <div className="text-xs text-[#555a53] font-mono">
          {paste.visibility === 'PUBLIC' && (
            <span>Public paste: discoverable by the community in live feeds and search.</span>
          )}
          {paste.visibility === 'UNLISTED' && (
            <span>Unlisted paste: hidden from discovery; accessible only to anyone with the link.</span>
          )}
          {paste.visibility === 'PRIVATE' && (
            <span>Private paste: restricted strictly to your account; only you can view this.</span>
          )}
        </div>

        {/* Single live region for clipboard / download feedback */}
        {statusMessage && (
          <div
            role="status"
            aria-live="polite"
            className="text-xs font-mono font-semibold text-[#17201d]"
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};
