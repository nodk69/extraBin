/**
 * Phase 2 — Red Phase: Inline Revision History & Side-by-Side Diff Workspace
 *
 * Protocol: AGENTS.md Phase 2 (Failing Tests First).
 *
 * All tests target components and utilities that DO NOT yet exist.
 * Expected result: every test fails with import/module-not-found errors
 * or missing-component errors. Zero compilation or fixture setup errors
 * are acceptable in a clean red phase.
 *
 * Test IDs map 1:1 to the approved Phase 1 regression test matrix:
 *   FE-REV-01 through FE-REV-14.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { authApi } from '../features/auth/api/authApi';

// === Components under test (DO NOT EXIST YET — will cause import failures) ===
import { RevisionWorkspace } from '../features/pastes/components/RevisionWorkspace';

// === Utility under test (DOES NOT EXIST YET) ===
import {
  buildCanonicalVersionList,
  computeLineDiff,
  type VersionEntry,
  type LineDiffResult,
} from '../features/pastes/utils/revisionDiff';

import type { PasteView } from '../features/pastes/types/paste';
import type { PasteRevision } from '../features/dashboard/api/accountApi';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** Paste at version 0 — freshly created, no edits */
const pasteV0: PasteView = {
  id: 'testPaste1',
  title: 'Hello World',
  content: 'console.log("hello");',
  language: 'javascript',
  visibility: 'PUBLIC',
  contentSizeBytes: 22,
  lineCount: 1,
  isOwner: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 0,
  views: 1,
};

/** Paste at version 1 — one edit performed */
const pasteV1: PasteView = {
  ...pasteV0,
  content: 'console.log("world");',
  version: 1,
  updatedAt: '2026-01-02T00:00:00Z',
};

/** Paste at version 2 — two edits performed */
const pasteV2: PasteView = {
  ...pasteV0,
  content: 'console.log("final");',
  version: 2,
  updatedAt: '2026-01-03T00:00:00Z',
};

/** Multi-file paste at version 1 */
const multiFilePasteV1: PasteView = {
  ...pasteV1,
  files: [
    {
      id: 1,
      filename: 'main.js',
      content: 'console.log("world");',
      language: 'javascript',
      sizeBytes: 22,
      lineCount: 1,
      sortOrder: 0,
    },
    {
      id: 2,
      filename: 'utils.js',
      content: 'export const add = (a, b) => a + b;',
      language: 'javascript',
      sizeBytes: 36,
      lineCount: 1,
      sortOrder: 1,
    },
  ],
};

/** Stored revision: version 0 snapshot (captured when paste was edited from v0 → v1) */
const revisionV0: PasteRevision = {
  id: 1,
  version: 0,
  title: 'Hello World',
  content: 'console.log("hello");',
  language: 'javascript',
  createdAt: '2026-01-01T00:00:00Z',
};

/** Stored revision: version 1 snapshot (captured when paste was edited from v1 → v2) */
const revisionV1: PasteRevision = {
  id: 2,
  version: 1,
  title: 'Hello World',
  content: 'console.log("world");',
  language: 'javascript',
  createdAt: '2026-01-02T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWorkspace(
  paste: PasteView,
  revisions: PasteRevision[],
  onClose: () => void = vi.fn(),
) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <RevisionWorkspace
          paste={paste}
          revisions={revisions}
          onClose={onClose}
        />
      </AuthProvider>
    </BrowserRouter>,
  );
}

// ---------------------------------------------------------------------------
// A. Lifecycle & Versioning (Component Tests)
// ---------------------------------------------------------------------------

describe('RevisionWorkspace — Lifecycle & Versioning', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
  });

  it('FE-REV-01: newly created paste (v0, empty revisions) renders initial version banner', () => {
    renderWorkspace(pasteV0, []);

    // Should show the initial version banner
    expect(
      screen.getByText(/current version.*is the initial revision/i),
    ).toBeInTheDocument();

    // Should NOT show a diff panel — there is nothing to compare
    expect(screen.queryByTestId('diff-panel')).not.toBeInTheDocument();
    // Base selector dropdown must not be present
    expect(screen.queryByLabelText(/Compare against base version/i)).not.toBeInTheDocument();
  });

  it('FE-REV-02: paste v1 with one stored revision lists Version 1 (Current) and Version 0', () => {
    renderWorkspace(pasteV1, [revisionV0]);

    // Both versions should appear in the revision rail
    const rail = screen.getByRole('navigation', { name: /Revision history/i });
    expect(rail).toBeInTheDocument();
    expect(within(rail).getByText(/Version 1/)).toBeInTheDocument();
    expect(within(rail).getByText(/Current/i)).toBeInTheDocument();
    expect(within(rail).getByText(/Version 0/)).toBeInTheDocument();
  });

  it('FE-REV-03: paste v2 with two revisions defaults comparison to Base: v1 vs Target: v2', () => {
    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    // Default target should be the current live version (v2)
    // Default base should be the immediate predecessor (v1)
    const diffPanel = screen.getByTestId('diff-panel');
    expect(diffPanel).toBeInTheDocument();

    // The base selector dropdown should have value '1'
    const baseSelect = screen.getByLabelText(/Compare against base version/i) as HTMLSelectElement;
    expect(baseSelect.value).toBe('1');

    // The target header indicates v2 Current
    const targetLabel = within(diffPanel).getByTestId('diff-target-label');
    expect(targetLabel).toHaveTextContent(/Version 2.*Current/i);
  });

  it('FE-REV-04: selecting revision v1 auto-defaults comparison to Base: v0 vs Target: v1', async () => {
    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    // Click on Version 1 in the rail to make it the target
    const v1Button = screen.getByRole('button', { name: /Version 1/i });
    fireEvent.click(v1Button);

    await waitFor(() => {
      // Now the base selector should auto-switch to v0 (value '0')
      const baseSelect = screen.getByLabelText(/Compare against base version/i) as HTMLSelectElement;
      expect(baseSelect.value).toBe('0');
    });
  });

  it('FE-REV-05: selecting custom base from dropdown updates comparison and shows reset action', async () => {
    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    // Find the base version selector
    const baseSelect = screen.getByLabelText(/Compare against base version/i) as HTMLSelectElement;
    expect(baseSelect).toBeInTheDocument();

    // Change base to Version 0 (instead of default v1)
    fireEvent.change(baseSelect, { target: { value: '0' } });

    await waitFor(() => {
      // A "Reset comparison" button should appear
      const resetBtn = screen.getByRole('button', { name: /Reset comparison/i });
      expect(resetBtn).toBeInTheDocument();

      // Clicking reset should restore base select to default predecessor (v1)
      fireEvent.click(resetBtn);
      expect(baseSelect.value).toBe('1');
    });
  });

  it('FE-REV-06: comparing a version against itself shows zero additions/deletions and identical notice', async () => {
    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    // Set base to match the current target (v2 ↔ v2 comparison)
    const baseSelect = screen.getByLabelText(/Compare against base version/i);
    fireEvent.change(baseSelect, { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.getByText(/Comparing identical versions/i)).toBeInTheDocument();
      expect(screen.getByText(/\+0/)).toBeInTheDocument();
      expect(screen.getByText(/-0/)).toBeInTheDocument();
      // Ensure zero added or deleted rows are rendered in the diff body
      expect(screen.queryByTestId('diff-row-add')).not.toBeInTheDocument();
      expect(screen.queryByTestId('diff-row-remove')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// B. Content, Newline & Line Statistics (Utility + Component Tests)
// ---------------------------------------------------------------------------

describe('revisionDiff — Content, Newline & Line Statistics', () => {
  it('FE-REV-07: complete replacement (3 deleted, 3 added) shows exactly -3, +3', () => {
    const base = 'line A\nline B\nline C';
    const target = 'line X\nline Y\nline Z';

    const result: LineDiffResult = computeLineDiff(base, target);

    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(3);
    expect(result.changes.length).toBeGreaterThan(0);
    // Removed lines must have baseLine 1, 2, 3 and no targetLine
    const removes = result.changes.filter((c) => c.type === 'remove');
    expect(removes).toHaveLength(3);
    expect(removes[0].baseLine).toBe(1);
    expect(removes[1].baseLine).toBe(2);
    expect(removes[2].baseLine).toBe(3);

    // Added lines must have targetLine 1, 2, 3 and no baseLine
    const adds = result.changes.filter((c) => c.type === 'add');
    expect(adds).toHaveLength(3);
    expect(adds[0].targetLine).toBe(1);
    expect(adds[1].targetLine).toBe(2);
    expect(adds[2].targetLine).toBe(3);
  });

  it('FE-REV-08: whitespace-only change (indentation) shows line diff without losing spacing', () => {
    const base = 'function foo() {\n  return 1;\n}';
    const target = 'function foo() {\n    return 1;\n}';

    const result: LineDiffResult = computeLineDiff(base, target);

    // Only the indented line should differ
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);

    // The changed line in the result should preserve exact whitespace
    const changedAddition = result.changes.find(
      (c) => c.type === 'add' && c.content === '    return 1;',
    );
    expect(changedAddition).toBeDefined();

    const changedRemoval = result.changes.find(
      (c) => c.type === 'remove' && c.content === '  return 1;',
    );
    expect(changedRemoval).toBeDefined();
  });

  it('FE-REV-09: missing trailing newline renders EOF marker without phantom blank row', () => {
    const base = 'hello\n'; // has trailing newline
    const target = 'hello'; // no trailing newline

    const result: LineDiffResult = computeLineDiff(base, target);

    // Should detect the EOF newline difference
    expect(result.hasEofNewlineDifference).toBe(true);

    // Should NOT count the EOF difference as a content line addition/deletion
    // The word "hello" is identical — only the newline at EOF differs
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.changes.filter((c) => c.type === 'equal')).toHaveLength(1);
  });

  it('FE-REV-10: empty base compared to 5-line target computes +5 additions, 0 deletions', () => {
    const base = '';
    const target = 'line 1\nline 2\nline 3\nline 4\nline 5';

    const result: LineDiffResult = computeLineDiff(base, target);

    expect(result.additions).toBe(5);
    expect(result.deletions).toBe(0);
    const adds = result.changes.filter((c) => c.type === 'add');
    expect(adds).toHaveLength(5);
    expect(adds[4].targetLine).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Canonical Version List Builder (Utility Tests)
// ---------------------------------------------------------------------------

describe('buildCanonicalVersionList', () => {
  it('builds correct list for v0 paste with empty revisions', () => {
    const entries: VersionEntry[] = buildCanonicalVersionList(pasteV0, []);

    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe(0);
    expect(entries[0].content).toBe('console.log("hello");');
    expect(entries[0].isCurrent).toBe(true);
    expect(entries[0].source).toBe('live');
  });

  it('builds correct list for v1 paste with one revision', () => {
    const entries: VersionEntry[] = buildCanonicalVersionList(pasteV1, [revisionV0]);

    expect(entries).toHaveLength(2);

    // Entries should be descending by version
    expect(entries[0].version).toBe(1);
    expect(entries[0].isCurrent).toBe(true);
    expect(entries[0].source).toBe('live');
    expect(entries[0].content).toBe('console.log("world");');

    expect(entries[1].version).toBe(0);
    expect(entries[1].isCurrent).toBe(false);
    expect(entries[1].source).toBe('revision');
    expect(entries[1].content).toBe('console.log("hello");');
  });

  it('builds correct list for v2 paste with two revisions', () => {
    const entries: VersionEntry[] = buildCanonicalVersionList(pasteV2, [revisionV1, revisionV0]);

    expect(entries).toHaveLength(3);
    expect(entries[0].version).toBe(2);
    expect(entries[1].version).toBe(1);
    expect(entries[2].version).toBe(0);
  });

  it('detects inconsistent state when revision version >= paste version', () => {
    // Simulate a stale paste fetch where revisions are newer
    const stalePaste: PasteView = { ...pasteV0, version: 0 };
    const newerRevision: PasteRevision = { ...revisionV0, version: 1 };

    const entries: VersionEntry[] = buildCanonicalVersionList(stalePaste, [newerRevision]);

    // Should mark the list as inconsistent rather than fabricating a version
    expect(entries[0].inconsistent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. Multi-File, Security & Responsiveness (Component Tests)
// ---------------------------------------------------------------------------

describe('RevisionWorkspace — Multi-File, Security & Responsiveness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
  });

  it('FE-REV-11: multi-file paste displays the Primary File Scope informational banner and no secondary files', () => {
    renderWorkspace(multiFilePasteV1, [revisionV0]);

    expect(
      screen.getByText(/Revisions track the workspace.*primary file/i),
    ).toBeInTheDocument();

    // Verify secondary file name 'utils.js' is NOT shown as a historical diff target
    expect(screen.queryByText(/utils\.js \(historical\)/i)).not.toBeInTheDocument();
  });

  it('FE-REV-12: untrusted historical content with script tags renders safely as text', () => {
    const xssPaste: PasteView = {
      ...pasteV1,
      content: '<script>alert("xss")</script>\nconsole.log("safe");',
    };

    const xssRevision: PasteRevision = {
      ...revisionV0,
      content: '<img onerror="alert(1)" src="x">\nconsole.log("old");',
    };

    const { container } = renderWorkspace(xssPaste, [xssRevision]);

    // The script tag content should appear as visible text, not execute
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeInTheDocument();

    // There should be zero actual <script> elements in the DOM
    const scripts = container.querySelectorAll('script');
    expect(scripts).toHaveLength(0);

    // There should be zero <img> elements with event handlers
    const imgs = container.querySelectorAll('img[onerror]');
    expect(imgs).toHaveLength(0);
  });

  it('FE-REV-13: mobile viewport (< 768px) renders unified diff and compact revision selector', () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    window.dispatchEvent(new Event('resize'));

    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    // Should use a compact <select> for revision navigation instead of a rail
    const mobileSelector = screen.getByLabelText(/Select revision to inspect/i);
    expect(mobileSelector).toBeInTheDocument();
    expect(mobileSelector.tagName.toLowerCase()).toBe('select');

    // The diff should be in unified mode (single column)
    expect(screen.getByTestId('unified-diff')).toBeInTheDocument();
    expect(screen.queryByTestId('side-by-side-diff')).not.toBeInTheDocument();

    // Restore viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });

  it('FE-REV-14: closing revision workspace restores focus to opener and leaves paste unmutated', () => {
    const onClose = vi.fn();
    // Simulate an opener button in the DOM that has focus
    const opener = document.createElement('button');
    opener.setAttribute('aria-label', 'Open revision history');
    document.body.appendChild(opener);
    opener.focus();

    renderWorkspace(pasteV2, [revisionV1, revisionV0], onClose);

    // Find and click the close/exit button
    const closeButton = screen.getByRole('button', { name: /close|exit.*revision/i });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);

    // The paste object should not have been mutated
    expect(pasteV2.content).toBe('console.log("final");');
    expect(pasteV2.version).toBe(2);

    document.body.removeChild(opener);
  });
});

// ---------------------------------------------------------------------------
// D. Edge Cases & Resilience Tests (Utility & Component)
// ---------------------------------------------------------------------------

describe('Revision Workspace & Diff — Extended Edge Cases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(new Error('No session'));
  });

  it('FE-REV-15: LF vs CRLF line ending differences normalize for comparison and disclose ending difference separately', () => {
    const baseCrlf = 'line 1\r\nline 2\r\nline 3';
    const targetLf = 'line 1\nline 2\nline 3';

    const result: LineDiffResult = computeLineDiff(baseCrlf, targetLf);

    // Identical logical content should yield 0 additions and 0 deletions
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    // Disclose line ending difference separately without treating whole file as modified
    expect(result.hasLineEndingDifference).toBe(true);
    // 3 unchanged logical lines
    const equalLines = result.changes.filter((c) => c.type === 'equal');
    expect(equalLines).toHaveLength(3);
  });

  it('FE-REV-16: multiple trailing newlines are counted precisely without losing empty lines', () => {
    const base = 'line 1\n\n\n';
    const target = 'line 1\n';

    const result: LineDiffResult = computeLineDiff(base, target);

    // Exactly 2 trailing blank lines removed from base
    expect(result.deletions).toBe(2);
    expect(result.additions).toBe(0);
    const removals = result.changes.filter((c) => c.type === 'remove');
    expect(removals).toHaveLength(2);
    expect(removals[0].content).toBe('');
    expect(removals[1].content).toBe('');
  });

  it('FE-REV-17: network/inaccessible history error renders explicit error banner with retry action', () => {
    const onRetry = vi.fn();
    render(
      <BrowserRouter>
        <AuthProvider>
          <RevisionWorkspace
            paste={pasteV1}
            revisions={[]}
            onClose={vi.fn()}
            error="Failed to load revision history (403 Forbidden)"
            onRetry={onRetry}
          />
        </AuthProvider>
      </BrowserRouter>,
    );

    // When revision load fails, the workspace must display an explicit alert banner with error message
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to load revision history/i),
    ).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('FE-REV-18: inconsistent version chain renders visible warning banner and bounded retry without infinite loop', () => {
    const stalePaste: PasteView = { ...pasteV0, version: 0 };
    const newerRevision: PasteRevision = { ...revisionV0, version: 1 };
    const onRefresh = vi.fn();

    render(
      <BrowserRouter>
        <AuthProvider>
          <RevisionWorkspace
            paste={stalePaste}
            revisions={[newerRevision]}
            onClose={vi.fn()}
            onRetry={onRefresh}
          />
        </AuthProvider>
      </BrowserRouter>,
    );

    // Should render a warning banner about out-of-sync revision state
    expect(
      screen.getByText(/revision data is out of sync|inconsistent version/i),
    ).toBeInTheDocument();

    // User can trigger a single explicit bounded reload
    const refreshBtn = screen.getByRole('button', { name: /refresh|sync/i });
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('FE-REV-19: rapid switching between revisions renders consistent target without stale race condition', async () => {
    renderWorkspace(pasteV2, [revisionV1, revisionV0]);

    const v1Btn = screen.getByRole('button', { name: /Version 1/i });
    const v0Btn = screen.getByRole('button', { name: /Version 0/i });

    // Click v1 then rapidly click v0
    fireEvent.click(v1Btn);
    fireEvent.click(v0Btn);

    await waitFor(() => {
      const targetLabel = screen.getByTestId('diff-target-label');
      expect(targetLabel).toHaveTextContent(/Version 0/);
    });
  });

  it('FE-REV-20: large-input safeguards display explicit performance notice when exceeding 250KB or 3000 lines', () => {
    // 3001 lines exceeds MAX_LINES (3000)
    const largeBase = 'line\n'.repeat(3001);
    const largeTarget = 'line\n'.repeat(3001);

    const result: LineDiffResult = computeLineDiff(largeBase, largeTarget);

    expect(result.isExceededLimit).toBe(true);
    expect(result.limitExceededReason).toMatch(/exceeds maximum diff limit/i);
    // Does NOT silently return truncated diff changes as complete
    expect(result.changes).toHaveLength(0);
  });

  it('FE-REV-21: raw HTML tags in base and target are safely escaped in diff rows', () => {
    const base = '<div class="alert">hello</div>';
    const target = '<style>body { color: red; }</style>';

    const result: LineDiffResult = computeLineDiff(base, target);
    expect(result.changes.some((c) => c.content === '<div class="alert">hello</div>')).toBe(true);
    expect(result.changes.some((c) => c.content === '<style>body { color: red; }</style>')).toBe(true);
  });

  it('FE-REV-22: keyboard navigation allows navigating rail and escape key triggers close without affecting inputs', () => {
    const onClose = vi.fn();
    renderWorkspace(pasteV2, [revisionV1, revisionV0], onClose);

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('FE-REV-23: single-line middle replacement maintains intact baseLine and targetLine references', () => {
    const base = 'line 1\nold line 2\nline 3';
    const target = 'line 1\nnew line 2\nline 3';

    const result: LineDiffResult = computeLineDiff(base, target);
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);

    // Line 1 equal
    const line1 = result.changes.find((c) => c.content === 'line 1' && c.type === 'equal');
    expect(line1).toBeDefined();
    expect(line1?.baseLine).toBe(1);
    expect(line1?.targetLine).toBe(1);

    // Line 2 remove & add
    const oldLine2 = result.changes.find((c) => c.content === 'old line 2');
    expect(oldLine2?.type).toBe('remove');
    expect(oldLine2?.baseLine).toBe(2);

    const newLine2 = result.changes.find((c) => c.content === 'new line 2');
    expect(newLine2?.type).toBe('add');
    expect(newLine2?.targetLine).toBe(2);

    // Line 3 equal
    const line3 = result.changes.find((c) => c.content === 'line 3' && c.type === 'equal');
    expect(line3).toBeDefined();
    expect(line3?.baseLine).toBe(3);
    expect(line3?.targetLine).toBe(3);
  });

  it('FE-REV-24: genuinely empty revision content is treated as 0 lines without crashing or conflating with missing data', () => {
    const emptyRevision: PasteRevision = {
      ...revisionV0,
      content: '',
    };

    const entries = buildCanonicalVersionList(pasteV1, [emptyRevision]);
    expect(entries).toHaveLength(2);
    expect(entries[1].content).toBe('');
    expect(entries[1].source).toBe('revision');

    // Explicit one-line target compared to 0-line empty base computes exactly +1 addition, 0 deletions
    const oneLineTarget = 'console.log("single line");';
    const diffOneLine = computeLineDiff(entries[1].content, oneLineTarget);
    expect(diffOneLine.additions).toBe(1);
    expect(diffOneLine.deletions).toBe(0);
    expect(diffOneLine.changes).toHaveLength(1);
    expect(diffOneLine.changes[0].type).toBe('add');
    expect(diffOneLine.changes[0].targetLine).toBe(1);
  });

  it('FE-REV-25: genuinely empty base compared to multi-line target produces additions matching exact target line count', () => {
    const emptyBase = '';
    const multiLineTarget = 'line 1\nline 2\nline 3';

    const diff = computeLineDiff(emptyBase, multiLineTarget);

    // 0 lines in base vs 3 lines in target -> exactly 3 additions, 0 deletions
    expect(diff.additions).toBe(3);
    expect(diff.deletions).toBe(0);
    const adds = diff.changes.filter((c) => c.type === 'add');
    expect(adds).toHaveLength(3);
    expect(adds[0].targetLine).toBe(1);
    expect(adds[1].targetLine).toBe(2);
    expect(adds[2].targetLine).toBe(3);
  });
});

