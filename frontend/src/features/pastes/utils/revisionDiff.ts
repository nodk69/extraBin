import { diffArrays, type ArrayChange } from 'diff';
import type { PasteView } from '../types/paste';
import type { PasteRevision } from '../../dashboard/api/accountApi';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export interface VersionEntry {
  /** The version number (0, 1, 2, ...) */
  version: number;
  /** The primary content snapshot for this version */
  content: string;
  /** The title at this version */
  title?: string;
  /** The language at this version */
  language: string;
  /** Timestamp of this version */
  createdAt: string;
  /** Whether this is the current live version */
  isCurrent: boolean;
  /** Where this entry's data comes from */
  source: 'live' | 'revision';
  /** True if the version chain is inconsistent (stale fetch detected) */
  inconsistent?: boolean;
  /** Complete workspace files for this version */
  files: WorkspaceFileSnapshot[];
}

export interface LineDiffChange {
  /** 'add' for addition, 'remove' for deletion, 'equal' for unchanged context */
  type: 'add' | 'remove' | 'equal';
  /** The line content */
  content: string;
  /** Line number in the base (only for 'remove' and 'equal') */
  baseLine?: number;
  /** Line number in the target (only for 'add' and 'equal') */
  targetLine?: number;
}

export const DIFF_LIMITS = {
  MAX_BYTES: 250 * 1024, // 250 KB
  MAX_LINES: 3000,       // 3,000 lines
} as const;

export interface LineDiffResult {
  /** Total lines added in target */
  additions: number;
  /** Total lines deleted from base */
  deletions: number;
  /** Whether EOF newline presence differs between base and target */
  hasEofNewlineDifference: boolean;
  /** Whether base has CRLF vs target LF or vice versa */
  hasLineEndingDifference: boolean;
  /** Ordered list of diff changes */
  changes: LineDiffChange[];
  /** True if diff was rejected/bypassed due to exceeding performance limits */
  isExceededLimit?: boolean;
  /** Limit error details if isExceededLimit is true */
  limitExceededReason?: string;
}

export type FileDiffStatus = 'added' | 'deleted' | 'modified' | 'unchanged';

export interface WorkspaceFileSnapshot {
  id?: number;
  filename: string;
  content: string;
  language: string;
  sortOrder?: number;
}

export interface WorkspaceFileDiff {
  filename: string;
  status: FileDiffStatus;
  baseFile?: WorkspaceFileSnapshot;
  targetFile?: WorkspaceFileSnapshot;
  diffResult: LineDiffResult;
}

export interface WorkspaceSummaryDiff {
  files: WorkspaceFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  addedCount: number;
  deletedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}

// ---------------------------------------------------------------------------
// Canonical Version List Builder
// ---------------------------------------------------------------------------

/**
 * Builds a canonical, descending-ordered list of version entries from the
 * live paste and stored revision snapshots.
 */
export function buildCanonicalVersionList(
  paste: PasteView,
  revisions: PasteRevision[],
): VersionEntry[] {
  // Sort revisions descending by version
  const sortedRevisions = [...revisions].sort((a, b) => b.version - a.version);

  // Check for inconsistent state: revision version >= paste version
  const hasInconsistency = sortedRevisions.some((r) => r.version >= paste.version);

  const liveFiles: WorkspaceFileSnapshot[] =
    paste.files && paste.files.length > 0
      ? paste.files.map((f, idx) => ({
          id: f.id,
          filename: f.filename,
          content: f.content,
          language: f.language || 'plaintext',
          sortOrder: f.sortOrder ?? idx,
        }))
      : [
          {
            filename: paste.title ? `${paste.title}.txt` : 'paste.txt',
            content: paste.content,
            language: paste.language || 'plaintext',
            sortOrder: 0,
          },
        ];

  const liveEntry: VersionEntry = {
    version: paste.version,
    content: paste.content,
    title: paste.title,
    language: paste.language || 'plaintext',
    createdAt: paste.updatedAt || paste.createdAt,
    isCurrent: true,
    source: 'live',
    inconsistent: hasInconsistency ? true : undefined,
    files: liveFiles,
  };

  const revisionEntries: VersionEntry[] = sortedRevisions.map((rev) => {
    const revFiles: WorkspaceFileSnapshot[] =
      rev.files && rev.files.length > 0
        ? rev.files.map((f, idx) => ({
            id: f.id,
            filename: f.filename,
            content: f.content,
            language: f.language || 'plaintext',
            sortOrder: f.sortOrder ?? idx,
          }))
        : [
            {
              filename: rev.title ? `${rev.title}.txt` : 'paste.txt',
              content: rev.content ?? '',
              language: rev.language || 'plaintext',
              sortOrder: 0,
            },
          ];

    return {
      version: rev.version,
      content: rev.content ?? '',
      title: rev.title,
      language: rev.language || 'plaintext',
      createdAt: rev.createdAt,
      isCurrent: false,
      source: 'revision',
      inconsistent: hasInconsistency ? true : undefined,
      files: revFiles,
    };
  });

  return [liveEntry, ...revisionEntries];
}

// ---------------------------------------------------------------------------
// Content Diffing Engine
// ---------------------------------------------------------------------------

/**
 * Normalizes CRLF and CR to LF for logical line comparison while checking
 * if line endings differ between base and target.
 */
function checkLineEndings(base: string, target: string): boolean {
  const baseHasCrlf = base.includes('\r\n');
  const targetHasCrlf = target.includes('\r\n');
  return baseHasCrlf !== targetHasCrlf;
}

/**
 * Split text into logical lines, preserving exact empty lines including trailing ones.
 * A single trailing newline is part of standard text files and does NOT constitute an empty line,
 * while multiple trailing newlines represent real empty lines.
 */
function splitLogicalLines(text: string): string[] {
  if (text.length === 0) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // If text ends with a trailing newline, strip the single EOF newline delimiter
  const stripped = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return stripped.split('\n');
}

/**
 * Computes a line-level diff between two content strings using Myers O(ND) algorithm.
 */
export function computeLineDiff(
  baseContent: string,
  targetContent: string,
): LineDiffResult {
  // 1. Guard against limits before computing
  const baseBytes = new TextEncoder().encode(baseContent).length;
  const targetBytes = new TextEncoder().encode(targetContent).length;
  const totalBytes = Math.max(baseBytes, targetBytes);

  const baseLinesCount = baseContent.length === 0 ? 0 : baseContent.split(/\r?\n/).length;
  const targetLinesCount = targetContent.length === 0 ? 0 : targetContent.split(/\r?\n/).length;
  const totalLines = Math.max(baseLinesCount, targetLinesCount);

  if (totalBytes > DIFF_LIMITS.MAX_BYTES || totalLines > DIFF_LIMITS.MAX_LINES) {
    return {
      additions: 0,
      deletions: 0,
      hasEofNewlineDifference: false,
      hasLineEndingDifference: false,
      changes: [],
      isExceededLimit: true,
      limitExceededReason: `Content exceeds maximum diff limit (${DIFF_LIMITS.MAX_LINES} lines / ${DIFF_LIMITS.MAX_BYTES / 1024} KB).`,
    };
  }

  // 2. Check line ending difference
  const hasLineEndingDifference = checkLineEndings(baseContent, targetContent);

  // 3. Check EOF trailing newline difference
  const baseHasTrailingNewline = baseContent.endsWith('\n') || baseContent.endsWith('\r');
  const targetHasTrailingNewline = targetContent.endsWith('\n') || targetContent.endsWith('\r');
  const hasEofNewlineDifference =
    baseContent.length > 0 &&
    targetContent.length > 0 &&
    baseHasTrailingNewline !== targetHasTrailingNewline;

  // 4. Handle empty string base / target edge cases explicitly
  if (baseContent === '' && targetContent === '') {
    return {
      additions: 0,
      deletions: 0,
      hasEofNewlineDifference: false,
      hasLineEndingDifference: false,
      changes: [],
    };
  }

  if (baseContent === '') {
    const targetLines = splitLogicalLines(targetContent);
    const changes: LineDiffChange[] = targetLines.map((line, idx) => ({
      type: 'add',
      content: line,
      targetLine: idx + 1,
    }));
    return {
      additions: targetLines.length,
      deletions: 0,
      hasEofNewlineDifference: false,
      hasLineEndingDifference,
      changes,
    };
  }

  if (targetContent === '') {
    const baseLines = splitLogicalLines(baseContent);
    const changes: LineDiffChange[] = baseLines.map((line, idx) => ({
      type: 'remove',
      content: line,
      baseLine: idx + 1,
    }));
    return {
      additions: 0,
      deletions: baseLines.length,
      hasEofNewlineDifference: false,
      hasLineEndingDifference,
      changes,
    };
  }

  // 5. Split both into logical line arrays
  const baseLines = splitLogicalLines(baseContent);
  const targetLines = splitLogicalLines(targetContent);

  // 6. Use diffArrays from 'diff' package for reliable line-by-line diffing
  const diffParts: ArrayChange<string>[] = diffArrays(baseLines, targetLines);

  let currentBaseLine = 1;
  let currentTargetLine = 1;
  let additions = 0;
  let deletions = 0;
  const changes: LineDiffChange[] = [];

  for (const part of diffParts) {
    if (part.added) {
      additions += part.value.length;
      for (const line of part.value) {
        changes.push({
          type: 'add',
          content: line,
          targetLine: currentTargetLine++,
        });
      }
    } else if (part.removed) {
      deletions += part.value.length;
      for (const line of part.value) {
        changes.push({
          type: 'remove',
          content: line,
          baseLine: currentBaseLine++,
        });
      }
    } else {
      for (const line of part.value) {
        changes.push({
          type: 'equal',
          content: line,
          baseLine: currentBaseLine++,
          targetLine: currentTargetLine++,
        });
      }
    }
  }

  return {
    additions,
    deletions,
    hasEofNewlineDifference,
    hasLineEndingDifference,
    changes,
  };
}

/**
 * Computes a workspace-wide diff between base and target file collections.
 * Detects added, deleted, modified, and unchanged files.
 */
export function computeWorkspaceDiff(
  baseFiles: WorkspaceFileSnapshot[],
  targetFiles: WorkspaceFileSnapshot[],
): WorkspaceSummaryDiff {
  const baseMap = new Map<string, WorkspaceFileSnapshot>();
  for (const f of baseFiles) {
    baseMap.set(f.filename.toLowerCase(), f);
  }

  const targetMap = new Map<string, WorkspaceFileSnapshot>();
  for (const f of targetFiles) {
    targetMap.set(f.filename.toLowerCase(), f);
  }

  // Collect all unique filenames preserving order: target files first (in sort order), then deleted base files
  const orderedFilenames: string[] = [];
  const seen = new Set<string>();

  for (const f of targetFiles) {
    const key = f.filename.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      orderedFilenames.push(f.filename);
    }
  }

  for (const f of baseFiles) {
    const key = f.filename.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      orderedFilenames.push(f.filename);
    }
  }

  const fileDiffs: WorkspaceFileDiff[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  let addedCount = 0;
  let deletedCount = 0;
  let modifiedCount = 0;
  let unchangedCount = 0;

  for (const filename of orderedFilenames) {
    const key = filename.toLowerCase();
    const baseFile = baseMap.get(key);
    const targetFile = targetMap.get(key);

    if (baseFile && targetFile) {
      const diff = computeLineDiff(baseFile.content, targetFile.content);
      const isModified = diff.additions > 0 || diff.deletions > 0 || baseFile.content !== targetFile.content;
      const status: FileDiffStatus = isModified ? 'modified' : 'unchanged';

      if (isModified) {
        modifiedCount++;
      } else {
        unchangedCount++;
      }
      totalAdditions += diff.additions;
      totalDeletions += diff.deletions;

      fileDiffs.push({
        filename: targetFile.filename,
        status,
        baseFile,
        targetFile,
        diffResult: diff,
      });
    } else if (targetFile && !baseFile) {
      // Added in target
      const diff = computeLineDiff('', targetFile.content);
      addedCount++;
      totalAdditions += diff.additions;

      fileDiffs.push({
        filename: targetFile.filename,
        status: 'added',
        baseFile: undefined,
        targetFile,
        diffResult: diff,
      });
    } else if (baseFile && !targetFile) {
      // Deleted from target
      const diff = computeLineDiff(baseFile.content, '');
      deletedCount++;
      totalDeletions += diff.deletions;

      fileDiffs.push({
        filename: baseFile.filename,
        status: 'deleted',
        baseFile,
        targetFile: undefined,
        diffResult: diff,
      });
    }
  }

  return {
    files: fileDiffs,
    totalAdditions,
    totalDeletions,
    addedCount,
    deletedCount,
    modifiedCount,
    unchangedCount,
  };
}
