import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { PasteView } from '../types/paste';
import { accountApi, type PasteRevision } from '../../dashboard/api/accountApi';
import {
  buildCanonicalVersionList,
  computeLineDiff,
  computeWorkspaceDiff,
  type VersionEntry,
  type LineDiffResult,
  type WorkspaceSummaryDiff,
} from '../utils/revisionDiff';
import { NativeSelect } from '../../../components/ui/dropdown';
import {
  GitCommit,
  X,
  RotateCcw,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Columns,
  AlignJustify,
  Clock,
  ArrowRight,
  History,
  FileText,
  AlertCircle,
} from 'lucide-react';

export interface RevisionWorkspaceProps {
  paste: PasteView;
  revisions: PasteRevision[];
  onClose: () => void;
  error?: string | null;
  onRetry?: () => void;
  onRestoreSuccess?: (updated: PasteView) => void;
}

export const RevisionWorkspace: React.FC<RevisionWorkspaceProps> = ({
  paste,
  revisions,
  onClose,
  error,
  onRetry,
  onRestoreSuccess,
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
    // If no predecessor exists (e.g. at initial v0), return target itself
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

  // 5. Multi-file workspace diff calculation
  const workspaceDiff: WorkspaceSummaryDiff = useMemo(() => {
    return computeWorkspaceDiff(selectedBaseEntry.files, selectedTargetEntry.files);
  }, [selectedBaseEntry.files, selectedTargetEntry.files]);

  // Selected file within workspace diff
  const [selectedFilename, setSelectedFilename] = useState<string>('');

  // Keep selectedFilename valid as target changes
  useEffect(() => {
    if (workspaceDiff.files.length > 0) {
      const exists = workspaceDiff.files.some((f) => f.filename === selectedFilename);
      if (!exists) {
        setSelectedFilename(workspaceDiff.files[0].filename);
      }
    }
  }, [workspaceDiff, selectedFilename]);

  const activeFileDiff = useMemo(() => {
    return (
      workspaceDiff.files.find((f) => f.filename === selectedFilename) ||
      workspaceDiff.files[0]
    );
  }, [workspaceDiff, selectedFilename]);

  // Line diff result for the currently active file (or single file)
  const diffResult: LineDiffResult = useMemo(() => {
    if (activeFileDiff) {
      return activeFileDiff.diffResult;
    }
    return computeLineDiff(selectedBaseEntry.content, selectedTargetEntry.content);
  }, [activeFileDiff, selectedBaseEntry.content, selectedTargetEntry.content]);

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

  // 7. Desktop View Mode: 'split' (side-by-side) or 'unified'
  const [desktopViewMode, setDesktopViewMode] = useState<'split' | 'unified'>('split');

  // Effective view mode (phones always use unified diff for readability)
  const isUnifiedView = isMobile || desktopViewMode === 'unified';

  // 8. Clipboard state for copying selected revision content
  const [isCopied, setIsCopied] = useState(false);
  const handleCopyContent = async () => {
    if (!selectedTargetEntry?.content) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedTargetEntry.content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failures
    }
  };

  // 9. Restore revision flow (only available if user is owner and target is not already current)
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  const canRestore =
    Boolean(paste.isOwner) &&
    !selectedTargetEntry.isCurrent &&
    selectedTargetEntry.version !== paste.version;

  const handleConfirmRestore = async () => {
    if (!canRestore || isRestoring) return;
    setIsRestoring(true);
    setRestoreError(null);

    try {
      let updated: any;
      if (typeof accountApi.restoreRevision === 'function') {
        try {
          updated = await accountApi.restoreRevision(paste.id, selectedTargetEntry.version);
        } catch (restErr: any) {
          // If restoreRevision is not available or rejected in mock environment, fallback to editPaste
          if (typeof accountApi.editPaste === 'function') {
            const isMulti = paste.files && paste.files.length > 1;
            const payload: Parameters<typeof accountApi.editPaste>[1] = {
              title: paste.title,
              visibility: paste.visibility,
              version: paste.version,
            };

            if (isMulti) {
              payload.files = selectedTargetEntry.files.map((f) => ({
                id: f.id,
                filename: f.filename,
                content: f.content,
                language: f.language,
              }));
            } else {
              payload.content = selectedTargetEntry.content;
              payload.language = selectedTargetEntry.language;
              payload.files = [
                {
                  id: paste.files?.[0]?.id,
                  filename: paste.files?.[0]?.filename || 'paste.txt',
                  content: selectedTargetEntry.content,
                  language: selectedTargetEntry.language,
                },
              ];
            }
            updated = await accountApi.editPaste(paste.id, payload);
          } else {
            throw restErr;
          }
        }
      } else {
        const isMulti = paste.files && paste.files.length > 1;
        const payload: Parameters<typeof accountApi.editPaste>[1] = {
          title: paste.title,
          visibility: paste.visibility,
          version: paste.version,
        };

        if (isMulti) {
          payload.files = selectedTargetEntry.files.map((f) => ({
            id: f.id,
            filename: f.filename,
            content: f.content,
            language: f.language,
          }));
        } else {
          payload.content = selectedTargetEntry.content;
          payload.language = selectedTargetEntry.language;
          payload.files = [
            {
              id: paste.files?.[0]?.id,
              filename: paste.files?.[0]?.filename || 'paste.txt',
              content: selectedTargetEntry.content,
              language: selectedTargetEntry.language,
            },
          ];
        }
        updated = await accountApi.editPaste(paste.id, payload);
      }

      setRestoreSuccessMsg(`Successfully restored Revision v${selectedTargetEntry.version}!`);
      setShowRestoreModal(false);
      if (onRestoreSuccess) {
        onRestoreSuccess(updated as unknown as PasteView);
      }
      setTimeout(() => {
        setRestoreSuccessMsg(null);
      }, 3500);
    } catch (err: unknown) {
      let msg = 'Failed to restore revision. Please try again.';
      if (err && typeof err === 'object' && 'detail' in err) {
        msg = String((err as any).detail);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setRestoreError(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  // 10. Stepper navigation through revisions: Previous (older) and Next (newer)
  const currentTargetIdx = versions.findIndex((v) => v.version === targetVersionNum);
  const hasOlder = currentTargetIdx !== -1 && currentTargetIdx + 1 < versions.length;
  const hasNewer = currentTargetIdx !== -1 && currentTargetIdx > 0;

  const handleGoOlder = () => {
    if (hasOlder) {
      setTargetVersionNum(versions[currentTargetIdx + 1].version);
      setCustomBaseVersionNum(null);
    }
  };

  const handleGoNewer = () => {
    if (hasNewer) {
      setTargetVersionNum(versions[currentTargetIdx - 1].version);
      setCustomBaseVersionNum(null);
    }
  };

  // 11. Keyboard navigation: Escape key closes workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showRestoreModal) {
          setShowRestoreModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showRestoreModal]);

  // Lock body scroll when revision modal is open so the background editor does not scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Check if paste is multi-file
  const isMultiFile = Array.isArray(paste.files) && paste.files.length > 1;

  // Single version initial paste banner condition
  const isInitialVersionOnly = paste.version === 0 && revisions.length === 0;

  const isSelfComparison =
    effectiveBaseVersionNum === selectedTargetEntry.version;

  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <div
      role="region"
      aria-label="Inline revision history workspace"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !showRestoreModal) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-workspace-title"
        className="w-full max-w-7xl h-[94vh] sm:h-[90vh] rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] shadow-[8px_12px_0px_#17201d] flex flex-col overflow-hidden text-[#17201d]"
      >
        {/* Workspace Top Header */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b-2 border-[#17201d] bg-[#f2ede0] shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-3 h-3 rounded-full bg-[#ff5c3d] shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-4 h-4 text-[#17201d] shrink-0" />
              <h2
                id="revision-workspace-title"
                className="font-mono text-xs sm:text-sm font-bold text-[#17201d] truncate m-0"
              >
                Revision History &amp; Diff Workspace
              </h2>
            </div>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5] text-[#5a645f] shrink-0 hidden sm:inline-block">
              {paste.id}
            </span>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5] text-[#5a645f] shrink-0">
              {versions.length} {versions.length === 1 ? 'version' : 'versions'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close revision workspace"
              className="px-3 py-1 font-mono text-xs font-semibold rounded-lg border border-[#17201d] bg-white text-[#17201d] hover:bg-[#17201d] hover:text-white transition-all shadow-[2px_2px_0_#17201d] flex items-center gap-1.5"
            >
              <span>Close</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Restore Success Toast Banner */}
        {restoreSuccessMsg && (
          <div
            role="status"
            className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl border border-[#16a34a] bg-[#dcfce7] text-[#166534] font-mono text-xs font-bold flex items-center justify-between shadow-[2px_2px_0_#16a34a] shrink-0"
          >
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#166534]" />
              <span>{restoreSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setRestoreSuccessMsg(null)}
              className="p-1 text-[#166534] hover:opacity-75"
              aria-label="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Network / Inaccessible History Error Banner */}
        {error && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mt-3 p-3.5 rounded-xl border border-[#ff5c3d] bg-[#fff3f0] text-[#ff5c3d] flex items-center justify-between shrink-0"
          >
            <div className="text-xs font-mono font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Retry loading revisions"
                className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-[#ff5c3d] text-white hover:bg-[#e04a2d] transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {/* Inconsistent Version Chain Banner */}
        {isInconsistent && (
          <div
            role="alert"
            className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl border border-[#f59e0b] bg-[#fef3c7] text-[#92400e] flex items-center justify-between shrink-0"
          >
            <div className="text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Warning:</strong> Revision data is out of sync with current paste state.
              </span>
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

        {/* Multi-file Workspace Notice */}
        {isMultiFile && (
          <div className="mx-4 sm:mx-6 mt-3 p-2.5 rounded-xl border border-[#d5d0c5] bg-[#fff] text-[#5a645f] text-xs font-mono flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 shrink-0 text-[#74786f]" />
              <span>
                Revisions track the workspace and its primary file snapshot. Use the navigator to inspect full workspace file diffs.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[#17201d] bg-[#ebe7dc] px-2 py-0.5 rounded border border-[#d5d0c5]">
              {workspaceDiff.files.length} {workspaceDiff.files.length === 1 ? 'file' : 'files'}
            </span>
          </div>
        )}

        {/* Initial Version (v0, empty revisions) Notice */}
        {isInitialVersionOnly ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#ebe7dc] border-2 border-[#17201d] flex items-center justify-center mb-3 shadow-[3px_3px_0_#17201d]">
              <GitCommit className="w-6 h-6 text-[#17201d]" />
            </div>
            <div className="font-mono text-sm font-bold text-[#17201d] mb-1">
              Current version (v0) is the initial revision.
            </div>
            <p className="font-mono text-xs text-[#74786f] max-w-md mx-auto">
              Edits made to this paste will generate historical snapshots that appear in this workspace.
            </p>
          </div>
        ) : (
          /* Main Workspace Body: Navigation Rail (Desktop) / Select (Mobile) + Diff Panel */
          <div className="flex-1 min-h-0 flex flex-col md:flex-row p-3 sm:p-5 gap-4 overflow-hidden">
            {/* Revision Navigation Sidebar */}
            <aside
              aria-label="Revision history sidebar"
              className="w-full md:w-64 shrink-0 flex flex-col min-h-0"
            >
              {isMobile ? (
                /* Mobile Centralized Selector Card */
                <div className="p-2.5 rounded-xl border-2 border-[#17201d] bg-[#f9f8f5] shadow-[2px_3px_0_#17201d] shrink-0 space-y-1.5 w-full max-w-full">
                  <div className="flex items-center justify-between text-[#17201d]">
                    <label
                      htmlFor="mobile-revision-selector"
                      className="font-mono text-xs font-bold truncate"
                    >
                      Select revision to inspect
                    </label>
                    <span className="font-mono text-[10px] text-[#74786f] shrink-0 ml-2">
                      {versions.length} versions
                    </span>
                  </div>
                  <NativeSelect
                    id="mobile-revision-selector"
                    value={targetVersionNum}
                    onChange={(val) => {
                      setTargetVersionNum(Number(val));
                      setCustomBaseVersionNum(null);
                    }}
                    wrapperClassName="w-full max-w-full"
                    className="w-full max-w-full font-mono text-xs p-2 rounded-xl border border-[#17201d] bg-white text-[#17201d] shadow-[1px_1px_0_#17201d] truncate"
                  >
                    {versions.map((ver) => (
                      <option key={ver.version} value={ver.version}>
                        v{ver.version} {ver.isCurrent ? '(Current)' : ''} · {new Date(ver.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : (
                /* Desktop Revision Rail (Scrolls independently) */
                <nav
                  aria-label="Revision history"
                  className="flex-1 min-h-0 flex flex-col rounded-xl border-2 border-[#17201d] bg-[#f9f8f5] overflow-hidden shadow-[3px_4px_0_#17201d]"
                >
                  <div className="p-3 border-b border-[#d5d0c5] bg-[#f2ede0] flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#74786f] uppercase tracking-wider">
                      Revisions ({versions.length})
                    </span>
                    <span className="font-mono text-[11px] text-[#74786f]">
                      v{versions[versions.length - 1]?.version} → v{versions[0]?.version}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
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
                          className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs space-y-1 ${
                            isSelected
                              ? 'border-[#17201d] bg-[#17201d] text-white shadow-[2px_3px_0_#d5d0c5]'
                              : 'border-[#d5d0c5] bg-white text-[#5a645f] hover:border-[#17201d] hover:text-[#17201d]'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-bold flex items-center gap-1.5">
                              <GitCommit className="w-3.5 h-3.5 shrink-0" />
                              <span>Version {ver.version}</span>
                            </span>
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
                          <div className="flex items-center gap-1.5 text-[11px] opacity-80 font-mono truncate">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{new Date(ver.createdAt).toLocaleString()}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </nav>
              )}
            </aside>

            {/* Diff View Panel */}
            <main
              data-testid="diff-panel"
              className="flex-1 min-w-0 border-2 border-[#17201d] rounded-xl bg-white overflow-hidden shadow-[4px_5px_0_#17201d] flex flex-col min-h-0"
            >
              {/* GitHub-Style Diff Comparison Controls Header */}
              <div className="p-2.5 sm:p-3 border-b-2 border-[#17201d] bg-[#f9f8f5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shrink-0">
                {/* Left Controls: Base selector & target indicator */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 max-w-full">
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
                    <label
                      htmlFor="base-version-selector"
                      className="font-mono text-xs font-bold text-[#5a645f] whitespace-nowrap shrink-0"
                    >
                      Compare against base:
                    </label>
                    <NativeSelect
                      id="base-version-selector"
                      aria-label="Compare against base version"
                      value={effectiveBaseVersionNum.toString()}
                      onChange={(val) => setCustomBaseVersionNum(Number(val))}
                      selectSize="sm"
                      wrapperClassName="w-auto max-w-[180px] sm:max-w-none"
                      className="font-mono text-xs px-2.5 py-1 rounded-lg border border-[#17201d] bg-white text-[#17201d] font-semibold truncate"
                    >
                      {versions.map((ver) => (
                        <option key={ver.version} value={ver.version.toString()}>
                          v{ver.version} {ver.isCurrent ? '(Current)' : ''}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-xs text-[#17201d] font-bold shrink-0">
                    <ArrowRight className="w-3.5 h-3.5 text-[#74786f] shrink-0" />
                    <span
                      data-testid="diff-target-label"
                      className="px-2 py-0.5 rounded bg-[#ebe7dc] border border-[#d5d0c5] truncate"
                    >
                      Target: Version {selectedTargetEntry.version} {selectedTargetEntry.isCurrent ? '(Current)' : ''}
                    </span>
                  </div>

                  {isCustomBase && (
                    <button
                      type="button"
                      onClick={() => setCustomBaseVersionNum(null)}
                      aria-label="Reset comparison"
                      className="font-mono text-[11px] px-2 py-0.5 rounded border border-[#17201d] bg-[#ebe7dc] text-[#17201d] hover:bg-[#17201d] hover:text-white transition-colors shrink-0"
                    >
                      Reset comparison
                    </button>
                  )}
                </div>

                {/* Right Controls: Stepper, Split/Unified toggle, Copy, Restore, Diff Stats */}
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  {/* Revision Stepper (Previous / Next) */}
                  <div className="flex items-center border border-[#17201d] rounded-lg overflow-hidden bg-white shadow-[1px_1px_0_#17201d]">
                    <button
                      type="button"
                      onClick={handleGoOlder}
                      disabled={!hasOlder}
                      aria-label="Previous older revision"
                      title="Inspect older revision"
                      className="p-1 sm:px-2 sm:py-1 text-[#17201d] hover:bg-[#ebe7dc] disabled:opacity-30 disabled:hover:bg-white border-r border-[#17201d] transition-colors flex items-center gap-0.5"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Older</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGoNewer}
                      disabled={!hasNewer}
                      aria-label="Next newer revision"
                      title="Inspect newer revision"
                      className="p-1 sm:px-2 sm:py-1 text-[#17201d] hover:bg-[#ebe7dc] disabled:opacity-30 disabled:hover:bg-white transition-colors flex items-center gap-0.5"
                    >
                      <span className="hidden sm:inline text-[11px]">Newer</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Desktop Split vs Unified View Toggle */}
                  <div className="hidden md:flex items-center border border-[#17201d] rounded-lg overflow-hidden bg-white shadow-[1px_1px_0_#17201d]">
                    <button
                      type="button"
                      onClick={() => setDesktopViewMode('split')}
                      aria-label="Side-by-side split diff view"
                      title="Side-by-side view"
                      className={`px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                        !isUnifiedView
                          ? 'bg-[#17201d] text-white'
                          : 'bg-white text-[#17201d] hover:bg-[#ebe7dc]'
                      }`}
                    >
                      <Columns className="w-3 h-3" />
                      <span>Split</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesktopViewMode('unified')}
                      aria-label="Unified diff view"
                      title="Unified view"
                      className={`px-2 py-1 text-[11px] font-bold flex items-center gap-1 border-l border-[#17201d] transition-colors ${
                        isUnifiedView
                          ? 'bg-[#17201d] text-white'
                          : 'bg-white text-[#17201d] hover:bg-[#ebe7dc]'
                      }`}
                    >
                      <AlignJustify className="w-3 h-3" />
                      <span>Unified</span>
                    </button>
                  </div>

                  {/* Copy target version content */}
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    aria-label="Copy version content"
                    title="Copy this version's content to clipboard"
                    className="px-2.5 py-1 rounded-lg border border-[#17201d] bg-white text-[#17201d] hover:bg-[#ebe7dc] transition-colors flex items-center gap-1.5 shadow-[1px_1px_0_#17201d]"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-[#16a34a]" />
                        <span className="text-[11px] font-bold text-[#16a34a]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="text-[11px] hidden sm:inline">Copy</span>
                      </>
                    )}
                  </button>

                  {/* Restore this revision button (authorized owners only) */}
                  {canRestore && (
                    <button
                      type="button"
                      onClick={() => setShowRestoreModal(true)}
                      aria-label={`Restore Version ${selectedTargetEntry.version}`}
                      title={`Restore Version ${selectedTargetEntry.version} as the current paste`}
                      className="px-2.5 py-1 rounded-lg border border-[#17201d] bg-[#c6f05b] text-[#17201d] hover:bg-[#b4e048] transition-colors font-bold flex items-center gap-1.5 shadow-[1px_1px_0_#17201d]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="text-[11px]">Restore</span>
                    </button>
                  )}

                  {/* Diff Badges & Line Endings */}
                  {diffResult.hasLineEndingDifference && (
                    <span className="px-2 py-0.5 rounded bg-[#fef3c7] text-[#92400e] border border-[#f59e0b] text-[10px] font-bold">
                      CRLF ↔ LF
                    </span>
                  )}
                  {diffResult.hasEofNewlineDifference && (
                    <span className="px-2 py-0.5 rounded bg-[#e0e7ff] text-[#3730a3] border border-[#a5b4fc] text-[10px] font-bold">
                      EOF \n
                    </span>
                  )}
                  <span
                    aria-label={`${diffResult.additions} additions`}
                    className="px-2 py-0.5 rounded bg-[#dcfce7] text-[#166534] border border-[#86efac] font-bold"
                  >
                    +{diffResult.additions}
                  </span>
                  <span
                    aria-label={`${diffResult.deletions} deletions`}
                    className="px-2 py-0.5 rounded bg-[#fee2e2] text-[#991b1b] border border-[#fca5a5] font-bold"
                  >
                    -{diffResult.deletions}
                  </span>
                </div>
              </div>

              {/* Workspace Changed-Files Navigator Bar */}
              {workspaceDiff.files.length > 0 && (
                <div
                  data-testid="changed-files-navigator"
                  className="px-3 py-2 bg-[#f4f1ea] border-b border-[#d5d0c5] flex items-center gap-2 overflow-x-auto shrink-0 font-mono text-xs"
                >
                  <span className="text-[11px] font-bold text-[#74786f] uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Files ({workspaceDiff.files.length}):</span>
                  </span>
                  {workspaceDiff.files.map((f) => {
                    const isSelected = f.filename === activeFileDiff?.filename;
                    const statusColor =
                      f.status === 'added'
                        ? 'bg-[#dcfce7] text-[#166534] border-[#86efac]'
                        : f.status === 'deleted'
                        ? 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]'
                        : f.status === 'modified'
                        ? 'bg-[#fef3c7] text-[#92400e] border-[#f59e0b]'
                        : 'bg-[#f0eee6] text-[#5a645f] border-[#d5d0c5]';

                    const statusPill =
                      f.status === 'added'
                        ? '+A'
                        : f.status === 'deleted'
                        ? '-D'
                        : f.status === 'modified'
                        ? 'M'
                        : '=';

                    return (
                      <button
                        key={f.filename}
                        type="button"
                        onClick={() => setSelectedFilename(f.filename)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all ${
                          isSelected
                            ? 'bg-[#17201d] text-white border-[#17201d] shadow-[1px_2px_0_#d5d0c5]'
                            : 'bg-white text-[#17201d] border-[#d5d0c5] hover:border-[#17201d]'
                        }`}
                      >
                        <span className={`px-1 py-0.2 rounded text-[10px] font-mono font-bold border ${statusColor}`}>
                          {statusPill}
                        </span>
                        <span className="truncate max-w-[150px] sm:max-w-none">{f.filename}</span>
                        {f.diffResult.additions > 0 && (
                          <span className="text-[10px] text-[#16a34a]">+{f.diffResult.additions}</span>
                        )}
                        {f.diffResult.deletions > 0 && (
                          <span className="text-[10px] text-[#dc2626]">-{f.diffResult.deletions}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Diff Content Body Area */}
              <div className="flex-1 overflow-auto bg-[#faf8f2] min-h-0">
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
                  <div className="p-12 text-center font-mono text-xs text-[#74786f] space-y-2">
                    <div className="font-semibold text-sm text-[#17201d]">
                      Comparing identical versions. No differences to display.
                    </div>
                    <p>
                      Base Version {effectiveBaseVersionNum} and Target Version {selectedTargetEntry.version} contain the exact same content.
                    </p>
                  </div>
                ) : isUnifiedView ? (
                  /* GitHub-Style Unified Diff View */
                  <div data-testid="unified-diff" className="font-mono text-xs min-w-full inline-block">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#f0eee6] border-b border-[#d5d0c5] text-[11px] text-[#5a645f]">
                          <th className="w-12 px-2 py-1 text-right font-normal border-r border-[#e5e2d9] select-none">
                            Base
                          </th>
                          <th className="w-12 px-2 py-1 text-right font-normal border-r border-[#e5e2d9] select-none">
                            Target
                          </th>
                          <th className="w-6 px-1 py-1 text-center font-normal select-none">
                            &plusmn;
                          </th>
                          <th className="px-3 py-1 text-left font-bold">
                            Changes: Version {selectedBaseEntry.version} &rarr; Version {selectedTargetEntry.version}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffResult.changes.map((change, idx) => {
                          const isAdd = change.type === 'add';
                          const isRemove = change.type === 'remove';
                          const rowBg = isAdd
                            ? 'bg-[#e6ffed] text-[#166534]'
                            : isRemove
                            ? 'bg-[#ffeef0] text-[#b91c1c]'
                            : 'bg-white text-[#17201d]';
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
                              className={`border-b border-[#f0eee6] ${rowBg} hover:opacity-95`}
                            >
                              <td className="w-12 px-2 py-0.5 text-right text-[11px] opacity-40 select-none border-r border-[#e5e2d9] font-mono">
                                {change.baseLine || ''}
                              </td>
                              <td className="w-12 px-2 py-0.5 text-right text-[11px] opacity-40 select-none border-r border-[#e5e2d9] font-mono">
                                {change.targetLine || ''}
                              </td>
                              <td
                                className={`w-6 px-1 py-0.5 text-center select-none font-bold ${
                                  isAdd
                                    ? 'text-[#166534]'
                                    : isRemove
                                    ? 'text-[#b91c1c]'
                                    : 'text-transparent'
                                }`}
                              >
                                {sign}
                              </td>
                              <td className="px-2 py-0.5 whitespace-pre font-mono leading-relaxed">
                                {change.content}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* GitHub-Style Side-by-Side (Split) Diff View */
                  <div data-testid="side-by-side-diff" className="font-mono text-xs min-w-full inline-block">
                    <table className="w-full border-collapse table-fixed">
                      <thead>
                        <tr className="bg-[#f0eee6] border-b border-[#d5d0c5] text-[11px] text-[#5a645f]">
                          <th className="w-1/2 p-2 text-left font-bold border-r border-[#d5d0c5]">
                            Base: Version {selectedBaseEntry.version} {selectedBaseEntry.isCurrent ? '(Current)' : ''}
                          </th>
                          <th className="w-1/2 p-2 text-left font-bold">
                            Target: Version {selectedTargetEntry.version} {selectedTargetEntry.isCurrent ? '(Current)' : ''}
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
                                  isRemove ? 'bg-[#ffeef0] text-[#b91c1c]' : 'bg-white'
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-10 px-2 py-0.5 text-right text-[11px] opacity-40 select-none border-r border-[#e5e2d9] shrink-0 font-mono">
                                    {change.baseLine || ''}
                                  </span>
                                  <span className="w-5 px-1 py-0.5 text-center select-none font-bold shrink-0 text-[#b91c1c]">
                                    {isRemove ? '-' : ''}
                                  </span>
                                  <span className="px-2 py-0.5 whitespace-pre font-mono leading-relaxed overflow-x-hidden">
                                    {!isAdd ? change.content : ''}
                                  </span>
                                </div>
                              </td>

                              {/* Right column (Target) */}
                              <td
                                className={`w-1/2 p-0 align-top ${
                                  isAdd ? 'bg-[#e6ffed] text-[#166534]' : 'bg-white'
                                }`}
                              >
                                <div className="flex">
                                  <span className="w-10 px-2 py-0.5 text-right text-[11px] opacity-40 select-none border-r border-[#e5e2d9] shrink-0 font-mono">
                                    {change.targetLine || ''}
                                  </span>
                                  <span className="w-5 px-1 py-0.5 text-center select-none font-bold shrink-0 text-[#166534]">
                                    {isAdd ? '+' : ''}
                                  </span>
                                  <span className="px-2 py-0.5 whitespace-pre font-mono leading-relaxed overflow-x-hidden">
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

              {/* Diff Footer / Status Bar */}
              <div className="px-4 py-2 border-t border-[#d5d0c5] bg-[#f2ede0] flex items-center justify-between font-mono text-[11px] text-[#5a645f] shrink-0">
                <div className="flex items-center gap-3">
                  <span>Language: {selectedTargetEntry.language || paste.language || 'plaintext'}</span>
                  <span>•</span>
                  <span>{diffResult.changes.length} total comparison rows</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#17201d]">
                    Revision {selectedTargetEntry.version}
                  </span>
                  <span>({new Date(selectedTargetEntry.createdAt).toLocaleDateString()})</span>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog Modal */}
      {showRestoreModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-confirm-title"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRestoring) {
              setShowRestoreModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-[#17201d] bg-[#faf8f2] p-6 shadow-[8px_10px_0px_#17201d] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-[#17201d]">
              <div className="p-2.5 rounded-xl bg-[#c6f05b] border border-[#17201d] shadow-[2px_2px_0_#17201d]">
                <RotateCcw className="w-5 h-5 text-[#17201d]" />
              </div>
              <div>
                <h3 id="restore-confirm-title" className="font-mono text-sm font-bold text-[#17201d] m-0">
                  Restore Version {selectedTargetEntry.version}?
                </h3>
                <p className="font-mono text-xs text-[#74786f] m-0">
                  Created on {new Date(selectedTargetEntry.createdAt).toLocaleString()}
                </p>
              </div>
            </div>

            <p className="font-mono text-xs text-[#5a645f] leading-relaxed">
              Restoring will create a <strong>new revision</strong> containing the exact code from Version {selectedTargetEntry.version}. Your historical revisions will be preserved and not overwritten.
            </p>

            {restoreError && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-[#ff5c3d] bg-[#fff3f0] text-[#ff5c3d] font-mono text-xs font-semibold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{restoreError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#d5d0c5]">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-xl border border-[#d5d0c5] bg-white font-mono text-xs font-semibold text-[#5a645f] hover:text-[#17201d] hover:border-[#17201d] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                aria-label="Confirm restore revision"
                className="px-4 py-2 rounded-xl border-2 border-[#17201d] bg-[#c6f05b] text-[#17201d] font-mono text-xs font-bold hover:bg-[#b4e048] shadow-[2px_2px_0_#17201d] transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Restore this Version</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
