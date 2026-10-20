import React, { useState } from 'react';
import { Flame, Eye, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

export const BurnAfterReadDemo: React.FC = () => {
  const [viewCount, setViewCount] = useState<number>(0);
  const [isBurning, setIsBurning] = useState<boolean>(false);

  const handleView = () => {
    if (viewCount === 0) {
      setIsBurning(true);
      setTimeout(() => {
        setIsBurning(false);
        setViewCount(1);
      }, 700);
    } else {
      setViewCount(viewCount + 1);
    }
  };

  const handleReset = () => {
    setViewCount(0);
    setIsBurning(false);
  };

  return (
    <div
      data-testid="burn-after-read-demo"
      className="rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-5 sm:p-6 shadow-[4px_4px_0px_#17201d] space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#d8d4ca]">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[#fee2e2] border border-[#ef4444] text-[#b91c1c]">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold font-mono text-[#17201d] m-0">Atomic Burn-After-Reading Simulator</h3>
            <p className="text-xs font-mono text-[#74786f] m-0">Inspect single-read delivery and permanent database destruction</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="px-2.5 py-1 rounded-lg border border-[#d5d0c5] bg-white text-xs font-mono text-[#525a54] hover:text-[#17201d] flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo</span>
        </button>
      </div>

      <div className="p-2.5 rounded-lg bg-[#ebe7dc]/70 border border-[#d5d0c5] text-[11px] font-mono text-[#525a54] flex items-center justify-between">
        <span>Simulation only — runs entirely in your browser and does not call or persist data to the server.</span>
        <span className="text-[10px] bg-[#fee2e2] text-[#b91c1c] px-1.5 py-0.5 rounded border border-[#ef4444] font-bold shrink-0">
          VIEW-ONCE
        </span>
      </div>

      <div className="p-4 rounded-xl border border-[#d5d0c5] bg-white space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#17201d]">Sample Paste: #burn-demo-404</span>
          <span className="text-[11px] text-[#74786f]">Status: {viewCount === 0 ? 'Active in DB' : 'Purged from DB'}</span>
        </div>

        {viewCount === 0 && !isBurning && (
          <div className="p-4 rounded-lg bg-[#fff7ed] border border-[#ffedd5] text-[#9a3412] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-xs">Single-View Secret Ready</div>
              <div className="text-[11px] text-[#c2410c]">Clicking view will retrieve content and permanently purge the record.</div>
            </div>
            <button
              type="button"
              onClick={handleView}
              className="px-4 py-2 rounded-lg bg-[#ef4444] text-white font-mono text-xs font-bold hover:bg-[#dc2626] transition-all cursor-pointer flex items-center gap-2 shrink-0 shadow-[2px_2px_0px_#17201d]"
            >
              <Eye className="w-4 h-4" />
              <span>View once</span>
            </button>
          </div>
        )}

        {isBurning && (
          <div className="p-6 rounded-lg bg-[#fee2e2] border-2 border-[#ef4444] text-[#b91c1c] flex items-center justify-center gap-2 animate-pulse">
            <Flame className="w-5 h-5 animate-bounce" />
            <span className="font-bold">Streaming payload &amp; executing atomic database purge...</span>
          </div>
        )}

        {viewCount === 1 && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16a34a] shrink-0" />
              <span>
                <strong>First View Delivered:</strong> &quot;PROD_DB_REPLICATION_SECRET=92bc8041&quot;
              </span>
            </div>
            <div className="p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] flex items-center justify-between gap-2">
              <span className="text-[11px]">Database record was deleted. Test what happens if the link is clicked again:</span>
              <button
                type="button"
                onClick={handleView}
                className="px-3 py-1.5 rounded-lg bg-[#17201d] text-white text-[11px] font-bold hover:bg-[#2f3833] cursor-pointer shrink-0"
              >
                Simulate 2nd Visit
              </button>
            </div>
          </div>
        )}

        {viewCount >= 2 && (
          <div className="p-4 rounded-lg bg-[#17201d] text-white border-2 border-[#ef4444] space-y-2">
            <div className="flex items-center gap-2 text-[#f87171] font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>404 Not Found (as it would in a real paste)</span>
            </div>
            <p className="text-xs text-[#d8d4ca] m-0">
              HTTP/1.1 404 Problem Details: The requested record has already been consumed and destroyed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
