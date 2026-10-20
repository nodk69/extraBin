import React, { useState } from 'react';
import { Shield, Lock, Copy, Check, RefreshCw } from 'lucide-react';

export const EncryptedPastesDemo: React.FC = () => {
  const [plaintext, setPlaintext] = useState('DATABASE_URL="postgres://admin:topsecret@db.internal:5432"');
  const [mode, setMode] = useState<'LINK' | 'PASSPHRASE' | 'DUAL'>('LINK');
  const [passphrase, setPassphrase] = useState('alpha-bravo-99');
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sampleKey = 'k8Z_91xM4T7qL0vW3sP6yA2eR5tU8o';
  const sampleCiphertext = '7c9a8f10b2d3e4...[AES-256-GCM Encrypted Payload (Zero-Knowledge)]';

  const handleSimulate = () => {
    setIsEncrypted(true);
    setDecryptedText(null);
  };

  const handleDecrypt = () => {
    setDecryptedText(plaintext);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://bin.extrabin.dev/p/demo123#key=${sampleKey}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      data-testid="encrypted-pastes-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#dcfce7] border border-[#16a34a] text-[#166534]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Zero-Knowledge Encryption Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Live interactive browser encryption &amp; blind server storage</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-[#ebe7dc] rounded-lg border border-[#d5d0c5] text-xs font-mono">
          {(['LINK', 'PASSPHRASE', 'DUAL'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setIsEncrypted(false);
                setDecryptedText(null);
              }}
              className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                mode === m ? 'bg-[#17201d] text-white shadow-sm' : 'text-[#74786f] hover:text-[#17201d]'
              }`}
            >
              {m === 'LINK' ? 'Link Key' : m === 'PASSPHRASE' ? 'Passphrase' : 'Dual-Access'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#dcfce7] text-[#166534] px-1.5 py-0.5 rounded border border-[#16a34a] font-bold shrink-0">
          CLIENT CRYPTO
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-mono font-bold text-[#17201d] block mb-1">
            Plaintext Input (Simulated Secret)
          </label>
          <textarea
            value={plaintext}
            onChange={(e) => {
              setPlaintext(e.target.value);
              setIsEncrypted(false);
              setDecryptedText(null);
            }}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[#d5d0c5] bg-white font-mono text-xs text-[#17201d] focus:border-[#17201d] outline-none"
          />
        </div>

        {mode !== 'LINK' && (
          <div>
            <label className="text-xs font-mono font-bold text-[#17201d] block mb-1">
              Secret Passphrase
            </label>
            <input
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full sm:w-80 px-3 py-1.5 rounded-lg border border-[#d5d0c5] bg-white font-mono text-xs text-[#17201d]"
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSimulate}
            className="px-4 py-2 rounded-lg bg-[#16a34a] text-white font-mono text-xs font-bold hover:bg-[#15803d] transition-all cursor-pointer flex items-center gap-2 shadow-[2px_2px_0px_#17201d]"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Simulate encryption</span>
          </button>
          {isEncrypted && (
            <button
              type="button"
              onClick={handleDecrypt}
              className="px-4 py-2 rounded-lg bg-[#17201d] text-white font-mono text-xs font-bold hover:bg-[#2f3833] transition-all cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Decrypt on client</span>
            </button>
          )}
        </div>
      </div>

      {isEncrypted && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          <div className="p-3 rounded-xl border border-[#16a34a] bg-white space-y-2">
            <span className="text-[11px] font-mono font-bold text-[#166534] block">
              1. What You Share (Client URL)
            </span>
            <div className="p-2 rounded bg-[#f0fdf4] font-mono text-[11px] text-[#166534] break-all border border-[#bbf7d0] flex items-center justify-between gap-2">
              <span>
                {mode === 'PASSPHRASE'
                  ? 'https://bin.extrabin.dev/p/demo123 (Passphrase sent out-of-band)'
                  : `https://bin.extrabin.dev/p/demo123#key=${sampleKey}`}
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="p-1 rounded hover:bg-[#dcfce7] text-[#166534] shrink-0"
                title="Copy share link"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-[#74786f] bg-white space-y-2">
            <span className="text-[11px] font-mono font-bold text-[#17201d] block">
              2. What the Server Sees (Blind Ciphertext)
            </span>
            <div className="p-2 rounded bg-[#ebe7dc] font-mono text-[11px] text-[#525a54] break-all border border-[#d5d0c5]">
              {sampleCiphertext}
            </div>
          </div>
        </div>
      )}

      {decryptedText && (
        <div className="p-3 rounded-xl border-2 border-[#16a34a] bg-[#f0fdf4] text-xs font-mono text-[#166534]">
          <strong>Client Decryption Success:</strong> {decryptedText}
        </div>
      )}
    </div>
  );
};
