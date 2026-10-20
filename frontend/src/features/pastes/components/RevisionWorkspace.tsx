import React, { useState, useEffect, useMemo } from 'react';
import type { PasteView } from '../types/paste';
import type { PasteRevision } from '../../dashboard/api/accountApi';
import {
  buildCanonicalVersionList,
  computeLineDiff,
  type VersionEntry,
  type LineDiffResult,
} from '../utils/revisionDiff';

export interface RevisionWorkspaceProps {
  paste: PasteView;
  revisions: PasteRevision[];
  onClose: () => void;
  error?: string | null;
  onRetry?: () => void;
}

export const RevisionWorkspace: React.FC<RevisionWorkspaceProps> = ({
  paste,
  revisions,
  onClose,
  error,
  onRetry,
}) => {
  // 1. Build canonical version list (descending: live version first, then stored revisions)
  const versions: VersionEntry[] = useMemo(
    () => buildCanonicalVersionList(paste, revisions),
    [paste, revisions],
  );

  const isInconsistent = versions.some((v) => v.inconsistent);

  // 2. Target version selection state (defaults to current live version, or latest entry)
  const [targetVersionNum, setTargetVersionNum] = useState<number>(() => {
    return versions.length > 0 ? versions[0].version : paste.version;
  });

  // Keep target synchronized if versions change
  useEffect(() => {
    if (versions.length > 0 && !versions.some((v) => v.version === targetVersionNum)) {
      setTargetVersionNum(versions[0].version);
    }
  }, [versions, targetVersionNum]);

  // Selected target version entry
  const selectedTargetEntry = useMemo(() => {
    return (
      versions.find((v) => v.version === targetVersionNum) ||
      versions[0] || {
        version: paste.version,
        content: paste.content,
        language: paste.language || 'plaintext',
        createdAt: paste.updatedAt || paste.createdAt,
        isCurrent: true,
        source: 'live' as const,
      }
    );
  }, [versions, targetVersionNum, paste]);

  // 3. Natural default predecessor for the selected target:
  // In descending order, predecessor is the entry immediately after selected target
  const defaultPredecessorVersionNum = useMemo(() => {
    const targetIdx = versions.findIndex((v) => v.version === targetVersionNum);
    if (targetIdx !== -1 && targetIdx + 1 < versions.length) {
      return versions[targetIdx + 1].version;
    }
    // If no predecessor exists (e.g. at v0), return target itself
    return targetVersionNum;
  }, [versions, targetVersionNum]);

  // 4. Custom base selection override state
  const [customBaseVersionNum, setCustomBaseVersionNum] = useState<number | null>(null);

  // When target changes, auto-switch base back to default predecessor
  const effectiveBaseVersionNum =
    customBaseVersionNum !== null ? customBaseVersionNum : defaultPredecessorVersionNum;

  const isCustomBase =
    customBaseVersionNum !== null && customBaseVersionNum !== defaultPredecessorVersionNum;

  const selectedBaseEntry = useMemo(() => {
    return (
      versions.find((v) => v.version === effectiveBaseVersionNum) ||
      selectedTargetEntry
    );
  }, [versions, effectiveBaseVersionNum, selectedTargetEntry]);

  // 5. Diff calculation
  const diffResult: LineDiffResult = useMemo(() => {
    return computeLineDiff(selectedBaseEntry.content, selectedTargetEntry.content);
  }, [selectedBaseEntry.content, selectedTargetEntry.content]);

  // 6. Responsive viewport tracking (< 768px triggers mobile mode)
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 7. Keyboard navigation: Escape key closes workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Check if paste is multi-file
  const isMultiFile = Array.isArray(paste.files) && paste.files.length > 1;

  // Single version initial paste banner condition
  const isInitialVersionOnly = paste.version === 0 && revisions.length === 0;

  const isSelfComparison =
    effectiveBaseVersionNum === selectedTargetEntry.version;

  return (
    <div
      role="region"
      aria-label="Inline revision history workspace"
      className="w-full rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] shadow-[6px_8px_0px_#17201d] overflow-hidden my-4"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#17201d] bg-[#f2ede0]">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#17201d]" />
          <h2 className="font-mono text-sm font-bold text-[#17201d] m-0">
            Revision History &amp; Diff Workspace
          </h2>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5] text-[#5a645f]">
            {paste.id}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close revision workspace"
          className="px-3 py-1 font-mono text-xs font-semibold rounded-lg border border-[#17201d] bg-white text-[#17201d] hover:bg-[#17201d] hover:text-white transition-all shadow-[2px_2px_0_#17201d]"
        >
          Close &times;
        </button>
      </div>

      {/* Network / Inaccessible History Error Banner */}
      {error && (
        <div
          role="alert"
          className="mx-5 my-4 p-4 rounded-xl border border-[#ff5c3d] bg-[#fff3f0] text-[#ff5c3d] flex items-center justify-between"
        >
          <div className="text-xs font-mono font-semibold">
            {error}
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry loading revisions"
              className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-[#ff5c3d] text-white hover:bg-[#e04a2d] transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Inconsistent Version Chain Banner */}
      {isInconsistent && (
        <div
          role="alert"
          className="mx-5 my-4 p-4 rounded-xl border border-[#f59e0b] bg-[#fef3c7] text-[#92400e] flex items-center justify-between"
        >
          <div className="text-xs font-mono">
            <strong>Warning:</strong> Revision data is out of sync with current paste state.
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              aria-label="Refresh and sync revisions"
              className="px-3 py-1 text-xs font-mono font-bold rounded-lg border border-[#92400e] bg-white text-[#92400e] hover:bg-[#92400e] hover:text-white transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      )}

      {/* Multi-file Primary File Scope Notice */}
      {isMultiFile && (
        <div className="mx-5 mt-4 p-3 rounded-xl border border-[#d5d0c5] bg-[#fff] text-[#5a645f] text-xs font-mono">
          ℹ️ Revisions track the workspace primary file. Secondary files are not versioned in this diff.
        </div>
      )}

      {/* Initial Version (v0, empty revisions) Banner */}
      {isInitialVersionOnly ? (
        <div className="p-12 text-center">
          <div className="font-mono text-sm font-semibold text-[#17201d] mb-1">
            Current version (v0) is the initial revision.
          </div>
          <p className="font-mono text-xs text-[#74786f] max-w-md mx-auto">
            Edits made to this paste will generate historical snapshots that appear in this workspace.
          </p>
        </div>
      ) : (
        /* Main Workspace: Navigation Rail + Diff Panel */
        <div className="p-5 flex flex-col md:flex-row gap-5">
          {/* Revision Navigation: Rail (Desktop) or Compact Select (Mobile) */}
          <div className="w-full md:w-64 shrink-0">
            {isMobile ? (
              <div className="space-y-1.5 mb-4">
                <label
                  htmlFor="mobile-revision-selector"
                  className="block font-mono text-xs font-bold text-[#17201d]"
                >
                  Select revision to inspect
                </label>
                <select
                  id="mobile-revision-selector"
                  value={targetVersionNum}
                  onChange={(e) => {
                    setTargetVersionNum(Number(e.target.value));
                    setCustomBaseVersionNum(null);
                  }}
                  className="w-full font-mono text-xs p-2 rounded-xl border border-[#17201d] bg-white text-[#17201d] shadow-[2px_2px_0_#17201d]"
                >
                  {versions.map((ver) => (
                    <option key={ver.version} value={ver.version}>
                      Version {ver.version} {ver.isCurrent ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <nav aria-label="Revision history" className="space-y-2">
                <div className="font-mono text-xs font-bold text-[#74786f] uppercase tracking-wider mb-2">
                  Revisions ({versions.length})
                </div>
                {versions.map((ver) => {
                  const isSelected = ver.version === targetVersionNum;
                  return (
                    <button
                      key={ver.version}
                      type="button"
                      onClick={() => {
                        setTargetVersionNum(ver.version);
                        setCustomBaseVersionNum(null);
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1 ${
                        isSelected
                          ? 'border-[#17201d] bg-[#17201d] text-white shadow-[3px_4px_0_#d5d0c5]'
                          : 'border-[#d5d0c5] bg-white text-[#5a645f] hover:border-[#17201d] hover:text-[#17201d]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold">Version {ver.version}</span>
                        {ver.isCurrent && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                              isSelected
                                ? 'bg-[#c6f05b] text-[#17201d] border-transparent'
                                : 'bg-[#e7f8be] text-[#3f6212] border-[#bef264]'
                            }`}
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] opacity-75 font-mono truncate">
                        {new Date(ver.createdAt).toLocaleString()}
                      </div>
                    </button>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Diff View Panel */}
          <div
            data-testid="diff-panel"
            className="flex-1 min-w-0 border-2 border-[#17201d] rounded-xl bg-white overflow-hidden shadow-[4px_5px_0_#17201d]"
          >
            {/* Diff Comparison Controls Header */}
            <div className="p-3 border-b-2 border-[#17201d] bg-[#f9f8f5] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="base-version-selector"
                    className="font-mono text-xs font-bold text-[#5a645f]"
                  >
                    Compare against base version:
                  </label>
                  <select
                    id="base-version-selector"
                    aria-label="Compare against base version"
                    value={effectiveBaseVersionNum.toString()}
                    onChange={(e) => setCustomBaseVersionNum(Number(e.target.value))}
                    className="font-mono text-xs px-2 py-1 rounded-lg border border-[#17201d] bg-white text-[#17201d]"
                  >
                    {versions.map((ver) => (
                      <option key={ver.version} value={ver.version.toString()}>
                        Version {ver.version} {ver.isCurrent ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div data-testid="diff-target-label" className="font-mono text-xs font-semibold text-[#17201d]">
                  &rarr; Target: Version {selectedTargetEntry.version} {selectedTargetEntry.isCurrent ? '(Current)' : ''}
                </div>

                {isCustomBase && (
                  <button
                    type="button"
                    onClick={() => setCustomBaseVersionNum(null)}
                    aria-label="Reset comparison"
                    className="font-mono text-[11px] px-2 py-0.5 rounded border border-[#17201d] bg-[#ebe7dc] text-[#17201d] hover:bg-[#17201d] hover:text-white transition-colors"
                  >
                    Reset comparison
                  </button>
                )}
              </div>

              {/* Statistics & Badges */}
              <div className="flex items-center gap-2 font-mono text-xs">
                {diffResult.hasLineEndingDifference && (
                  <span className="px-2 py-0.5 rounded bg-[#fef3c7] text-[#92400e] border border-[#f59e0b] text-[10px] font-bold">
                    Line endings differ: CRLF ↔ LF
                  </span>
                )}
                {diffResult.hasEofNewlineDifference && (
                  <span className="px-2 py-0.5 rounded bg-[#e0e7ff] text-[#3730a3] border border-[#a5b4fc] text-[10px] font-bold">
                    EOF newline differs
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-[#dcfce7] text-[#166534] font-bold">
                  +{diffResult.additions}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#fee2e2] text-[#991b1b] font-bold">
                  -{diffResult.deletions}
                </span>
              </div>
            </div>

            {/* Performance Limit Notice */}
            {diffResult.isExceededLimit ? (
              <div
                role="alert"
                className="p-8 text-center font-mono text-xs text-[#ff5c3d] space-y-2"
              >
                <div className="font-bold text-sm">Diff limit exceeded</div>
                <p>{diffResult.limitExceededReason}</p>
                <p className="text-[#74786f]">
                  Direct comparison is disabled to protect browser performance.
                </p>
              </div>
            ) : isSelfComparison ? (
              <div className="p-8 text-center font-mono text-xs text-[#74786f]">
                Comparing identical versions. No differences to display.
              </div>
            ) : (
              /* Diff Output Display: Unified (Mobile) or Side-by-Side (Desktop) */
              <div className="overflow-x-auto">
                {isMobile ? (
                  <div data-testid="unified-diff" className="font-mono text-xs">
                    <table className="w-full border-collapse">
                      <tbody>
                        {diffResult.changes.map((change, idx) => {
                          const isAdd = change.type === 'add';
                          const isRemove = change.type === 'remove';
                          const rowBg = isAdd
                            ? 'bg-[#ecfdf5] text-[#065f46]'
                            : isRemove
                            ? 'bg-[#fef2f2] text-[#991b1b]'
                            : 'text-[#17201d]';
                          const sign = isAdd ? '+' : isRemove ? '-' : ' ';
                          const testId = isAdd
                            ? 'diff-row-add'
                            : isRemove
                            ? 'diff-row-remove'
                            : undefined;

                          return (
                            <tr
                              key={idx}
                              data-testid={testId}
                              className={`border-b border-[#f0eee6] ${rowBg}`}
                            >
                              <td className="w-12 px-2 py-0.5 text-right text-[11px] opacity-50 select-none border-r border-[#e5e2d9]">
                                {change.baseLine || ''}
                              </td>
                              <td className="w-12 px-2 py-0.5 text-right text-[11px] opacity-50 select-none border-r border-[#e5e2d9]">
                                {change.targetLine || ''}
                              </td>
                              <td className="w-6 px-1 py-0.5 text-center select-none font-bold">
                                {sign}
                              </td>
                              <td className="px-2 py-0.5 whitespace-pre">
                                {change.content}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div data-testid="side-by-side-diff" className="font-mono text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#f0eee6] border-b border-[#d5d0c5] text-[11px] text-[#5a645f]">
                          <th className="w-1/2 p-2 text-left font-bold border-r border-[#d5d0c5]">
                            Base: Version {selectedBaseEntry.version}
                          </th>
                          <th className="w-1/2 p-2 text-left font-bold">
                            Target: Version {selectedTargetEntry.version}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffResult.changes.map((change, idx) => {
                          const isAdd = change.type === 'add';
                          const isRemove = change.type === 'remove';
                          const testId = isAdd
                            ? 'diff-row-add'
                            : isRemove
                            ? 'diff-row-remove'
                            : undefined;

                          return (
                            <tr
                              key={idx}
                              data-testid={testId}
                              className="border-b border-[#f0eee6]"
                            >
                              {/* Left column (Base) */}
                              <td
                                className={`w-1/2 p-0 border-r border-[#e5e2d9] align-top ${
                                  isRemove ? 'bg-[#fef2f2] text-[#991b1b]' : ''
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-10 px-2 py-0.5 text-right text-[11px] opacity-50 select-none border-r border-[#e5e2d9] shrink-0">
                                    {change.baseLine || ''}
                                  </span>
                                  <span className="px-2 py-0.5 whitespace-pre">
                                    {!isAdd ? change.content : ''}
                                  </span>
                                </div>
                              </td>

                              {/* Right column (Target) */}
                              <td
                                className={`w-1/2 p-0 align-top ${
                                  isAdd ? 'bg-[#ecfdf5] text-[#065f46]' : ''
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-10 px-2 py-0.5 text-right text-[11px] opacity-50 select-none border-r border-[#e5e2d9] shrink-0">
                                    {change.targetLine || ''}
                                  </span>
                                  <span className="px-2 py-0.5 whitespace-pre">
                                    {!isRemove ? change.content : ''}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
