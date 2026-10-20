import { diffArrays, type ArrayChange } from 'diff';
import type { PasteView } from '../types/paste';
import type { PasteRevision } from '../../dashboard/api/accountApi';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

export interface VersionEntry {
  /** The version number (0, 1, 2, ...) */
  version: number;
  /** The content snapshot for this version */
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

  const liveEntry: VersionEntry = {
    version: paste.version,
    content: paste.content,
    title: paste.title,
    language: paste.language || 'plaintext',
    createdAt: paste.updatedAt || paste.createdAt,
    isCurrent: true,
    source: 'live',
    inconsistent: hasInconsistency ? true : undefined,
  };

  const revisionEntries: VersionEntry[] = sortedRevisions.map((rev) => ({
    version: rev.version,
    content: rev.content ?? '',
    title: rev.title,
    language: rev.language || 'plaintext',
    createdAt: rev.createdAt,
    isCurrent: false,
    source: 'revision',
    inconsistent: hasInconsistency ? true : undefined,
  }));

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
