import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, Copy, ExternalLink, KeyRound } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface DeletionCapabilityModalProps {
  pasteId: string;
  capability: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeletionCapabilityModal: React.FC<DeletionCapabilityModalProps> = ({
  pasteId,
  capability,
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(capability);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleGoToPaste = () => {
    onClose();
    navigate(`/p/${pasteId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-slate-900 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              Save Anonymous Deletion Capability
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Your anonymous paste <span className="font-mono text-slate-200 font-semibold">{pasteId}</span> has been published!
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Warning:</strong> This deletion token will <strong>never be shown again</strong>. Store it securely if you ever wish to delete this paste before it expires.
          </span>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            One-Time Secret Capability
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={capability}
              className="w-full font-mono text-xs px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400 select-all focus:outline-none"
            />
            <Button
              type="button"
              variant={copied ? 'primary' : 'secondary'}
              size="sm"
              onClick={handleCopy}
              leftIcon={copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
          <Button
            type="button"
            variant="primary"
            onClick={handleGoToPaste}
            rightIcon={<ExternalLink className="w-4 h-4" />}
          >
            Go to Paste
          </Button>
        </div>
      </div>
    </div>
  );
};
