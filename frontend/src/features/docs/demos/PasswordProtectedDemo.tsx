import React, { useState } from 'react';
import { KeyRound, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export const PasswordProtectedDemo: React.FC = () => {
  const [enteredPass, setEnteredPass] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'fail'>('idle');

  const correctPass = 'ExtraBinTeam2026';

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPass === correctPass) {
      setStatus('success');
    } else {
      setStatus('fail');
    }
  };

  return (
    <div
      data-testid="password-protected-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#fef9c3] border border-[#ca8a04] text-[#854d0e]">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Password Protection Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Inspect server passcode verification and access gating</p>
          </div>
        </div>
        <span className="text-xs font-mono text-[#74786f]">
          Demo Passcode: <code className="bg-[#ebe7dc] px-1.5 py-0.5 rounded text-[#17201d]">{correctPass}</code>
        </span>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#fef9c3] text-[#854d0e] px-1.5 py-0.5 rounded border border-[#ca8a04] font-bold shrink-0">
          BCRYPT HASHING
        </span>
      </div>

      <form onSubmit={handleUnlock} className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-3 font-mono text-xs">
        <label className="font-bold text-[#17201d] block">Enter Passcode to Unlock Paste</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={enteredPass}
            onChange={(e) => {
              setEnteredPass(e.target.value);
              setStatus('idle');
            }}
            placeholder="Type passcode..."
            className="flex-1 px-3 py-2 rounded-lg border border-[#d5d0c5] text-[#17201d] outline-none focus:border-[#17201d]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#17201d] text-white font-bold hover:bg-[#2f3833] cursor-pointer flex items-center justify-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Unlock</span>
          </button>
        </div>

        {status === 'fail' && (
          <div className="p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>HTTP 401 Unauthorized: Invalid passcode. Try entering &quot;{correctPass}&quot;.</span>
          </div>
        )}

        {status === 'success' && (
          <div className="p-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-[#16a34a] shrink-0" />
              <span>Authentication Successful (200 OK)</span>
            </div>
            <pre className="p-2 rounded bg-white border border-[#bbf7d0] text-[11px] m-0">
              # Protected Internal Script{'\n'}export AWS_PROFILE=staging-deploy{'\n'}terraform apply -auto-approve
            </pre>
          </div>
        )}
      </form>
    </div>
  );
};
