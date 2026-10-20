import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { CreatePastePage } from '../features/pastes/pages/CreatePastePage';
import { DocsPage } from '../features/docs/pages/DocsPage';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';

vi.mock('../lib/confetti', () => ({
  triggerSuccessBurst: vi.fn(),
  triggerConfetti: vi.fn(),
}));

vi.mock('../features/discovery/api/discoveryApi', () => ({
  discoveryApi: {
    getDiscovery: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getPublicPastes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

vi.mock('../features/pastes/api/folderApi', () => ({
  folderApi: {
    getFolders: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    movePaste: vi.fn(),
  },
}));

describe('ExtraBin Docs Restructure & Inline Discoverability (AGENTS.md Phase 2 Red Phase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // D1. docsHub_exists_and_linksToAllFeaturePages
  it('D1. docsHub_exists_and_linksToAllFeaturePages', () => {
    const docsDir = path.resolve(__dirname, '../../../docs');
    const hubFile = path.join(docsDir, 'README.md');
    expect(fs.existsSync(hubFile), 'docs/README.md hub file must exist').toBe(true);

    const hubContent = fs.readFileSync(hubFile, 'utf-8');
    const requiredFeatures = [
      'encrypted-pastes',
      'paste-as-api',
      'burn-after-read',
      'password-protected',
      'multi-file',
      'folders',
      'revision-history',
      'responsive-embeds',
      'comments-and-replies',
      'qr-codes',
    ];

    for (const feat of requiredFeatures) {
      expect(
        hubContent.includes(`features/${feat}.md`) || hubContent.includes(`/docs/features/${feat}`),
        `Hub must link to features/${feat}.md`
      ).toBe(true);
    }
  });

  // D2. encryptedPastesDoc_followsFiveSectionLayout
  it('D2. encryptedPastesDoc_followsFiveSectionLayout', () => {
    const docPath = path.resolve(__dirname, '../../../docs/features/encrypted-pastes.md');
    expect(fs.existsSync(docPath), 'encrypted-pastes.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');

    // Five-section layout:
    // 1. What this is
    // 2. Live demo
    // 3. When to use it / When not to use it
    // 4. Step-by-step: how to create, how to open
    // 5. Learn more
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  // D3. encryptedPastesDoc_hasLiveDemo
  it('D3. encryptedPastesDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/encrypted-pastes']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('encrypted-pastes-demo');
    expect(demo).toBeInTheDocument();
    expect(within(demo).getByRole('button', { name: /Link Key/i })).toBeInTheDocument();
    expect(within(demo).getByRole('button', { name: /Simulate encryption/i })).toBeInTheDocument();
  });

  // D4. pasteAsApiDoc_followsFiveSectionLayout
  it('D4. pasteAsApiDoc_followsFiveSectionLayout', () => {
    const docPath = path.resolve(__dirname, '../../../docs/features/paste-as-api.md');
    expect(fs.existsSync(docPath), 'paste-as-api.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');

    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  // D5. pasteAsApiDoc_hasLiveDemo
  it('D5. pasteAsApiDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/paste-as-api']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('paste-as-api-demo');
    expect(demo).toBeInTheDocument();
    expect(within(demo).getByRole('button', { name: /\.json/i })).toBeInTheDocument();
    expect(within(demo).getByRole('button', { name: /\.yaml/i })).toBeInTheDocument();
  });

  // D6. burnAfterReadDoc_hasLiveDemo
  it('D6. burnAfterReadDoc_hasLiveDemo', () => {
    const docPath = path.resolve(__dirname, '../../../docs/features/burn-after-read.md');
    expect(fs.existsSync(docPath), 'burn-after-read.md must exist').toBe(true);

    render(
      <MemoryRouter initialEntries={['/docs/features/burn-after-read']}>
        <DocsPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('burn-after-read-demo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View once/i })).toBeInTheDocument();
  });

  // D7. everyInternalDocsLink_resolves (the link checker)
  it('D7. everyInternalDocsLink_resolves', () => {
    const docsDir = path.resolve(__dirname, '../../../docs');
    const featuresDir = path.join(docsDir, 'features');
    const filesToCheck = [
      path.join(docsDir, 'README.md'),
      path.join(featuresDir, 'encrypted-pastes.md'),
      path.join(featuresDir, 'paste-as-api.md'),
      path.join(featuresDir, 'burn-after-read.md'),
      path.join(featuresDir, 'password-protected.md'),
      path.join(featuresDir, 'multi-file.md'),
      path.join(featuresDir, 'folders.md'),
      path.join(featuresDir, 'revision-history.md'),
      path.join(featuresDir, 'responsive-embeds.md'),
      path.join(featuresDir, 'comments-and-replies.md'),
      path.join(featuresDir, 'qr-codes.md'),
    ];

    for (const filePath of filesToCheck) {
      expect(fs.existsSync(filePath), `File must exist for link checking: ${filePath}`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      const markdownLinkRegex = /\[([^\]]+)\]\((?!http|mailto|#)([^)]+)\)/g;
      let match;
      while ((match = markdownLinkRegex.exec(content)) !== null) {
        const linkTarget = match[2].split('#')[0];
        if (!linkTarget) continue;
        const resolvedPath = path.resolve(path.dirname(filePath), linkTarget);
        expect(
          fs.existsSync(resolvedPath),
          `Link target "${linkTarget}" in ${path.basename(filePath)} must resolve to an existing file`
        ).toBe(true);
      }
    }
  });

  // FAQ1. editorPage_hasFaqBelowSubmit
  it('FAQ1. editorPage_hasFaqBelowSubmit', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <CreatePastePage />
        </MemoryRouter>
      </AuthProvider>
    );

    const submitBtn = screen.getByRole('button', { name: /create paste/i });
    const faqContainer = screen.getByTestId('editor-faq');
    expect(faqContainer).toBeInTheDocument();

    const comparison = submitBtn.compareDocumentPosition(faqContainer);
    expect(
      Boolean(comparison & Node.DOCUMENT_POSITION_FOLLOWING),
      'FAQ section must be placed below the submit button'
    ).toBe(true);
  });

  // FAQ2. faq_hasFiveQuestions
  it('FAQ2. faq_hasFiveQuestions', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <CreatePastePage />
        </MemoryRouter>
      </AuthProvider>
    );

    const questions = [
      'Should I encrypt this paste?',
      'What happens if I lose the link or passphrase?',
      'Can I fetch this paste from a script?',
      'What does burn-after-reading do?',
      'Is this paste public?',
    ];

    for (const q of questions) {
      expect(screen.getByText(q), `FAQ must contain question: "${q}"`).toBeInTheDocument();
    }
  });

  // FAQ3. faq_expandAndReadMore_navigatesToDoc
  it('FAQ3. faq_expandAndReadMore_navigatesToDoc', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <CreatePastePage />
        </MemoryRouter>
      </AuthProvider>
    );

    const readMoreLinks = screen.getAllByRole('link', { name: /read more →/i });
    expect(readMoreLinks.length).toBe(5);

    const targets = readMoreLinks.map((link) => link.getAttribute('href'));
    expect(targets[0]).toContain('/docs/features/encrypted-pastes');
    expect(targets[1]).toContain('/docs/features/encrypted-pastes');
    expect(targets[2]).toContain('/docs/features/paste-as-api');
    expect(targets[3]).toContain('/docs/features/burn-after-read');
  });

  // FAQ4. faq_includesNoRecoverySentence (verbatim match)
  it('FAQ4. faq_includesNoRecoverySentence', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <CreatePastePage />
        </MemoryRouter>
      </AuthProvider>
    );

    const verbatimSentence =
      'If you lose the link key or forget the passphrase, the paste cannot be recovered by anyone, including ExtraBin administrators; the data is permanently lost.';
    expect(screen.getByText(new RegExp(verbatimSentence, 'i'))).toBeInTheDocument();
  });

  // P1. platformDirectory_everyListedFeatureHasDocOrIsMarkedNoGuide
  it('P1. platformDirectory_everyListedFeatureHasDocOrIsMarkedNoGuide', () => {
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsPage />
      </MemoryRouter>
    );

    const noGuideBadges = screen.queryAllByText(/Included in platform — no separate guide/i);
    expect(noGuideBadges.length).toBe(0);

    const dedicatedGuideLinks = screen.getAllByRole('link', { name: /view guide/i });
    expect(dedicatedGuideLinks.length).toBe(13);
  });

  // P2. modeComparisonTable_appearsOnce_canonical
  it('P2. modeComparisonTable_appearsOnce_canonical', () => {
    const encPath = path.resolve(__dirname, '../../../docs/features/encrypted-pastes.md');
    const apiPath = path.resolve(__dirname, '../../../docs/features/paste-as-api.md');
    const hubPath = path.resolve(__dirname, '../../../docs/README.md');

    const encContent = fs.readFileSync(encPath, 'utf-8');
    const apiContent = fs.readFileSync(apiPath, 'utf-8');
    const hubContent = fs.existsSync(hubPath) ? fs.readFileSync(hubPath, 'utf-8') : '';

    const modeTableMarker = '| Mode | Secret Location | Decryption Invariant |';
    expect(encContent.includes(modeTableMarker), 'encrypted-pastes.md must contain the canonical table').toBe(true);
    expect(apiContent.includes(modeTableMarker), 'paste-as-api.md must not duplicate mode comparison table').toBe(false);
    expect(hubContent.includes(modeTableMarker), 'docs/README.md must not duplicate mode comparison table').toBe(false);
  });

  // P3. liveDemos_doNotCallTheServer
  it('P3. liveDemos_doNotCallTheServer', async () => {
    const apiSpy = vi.spyOn(pasteApi, 'getPaste');
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <MemoryRouter initialEntries={['/docs/features/encrypted-pastes']}>
        <DocsPage />
      </MemoryRouter>
    );

    const simulateBtn = screen.getByRole('button', { name: /Simulate encryption/i });
    fireEvent.click(simulateBtn);

    expect(apiSpy).not.toHaveBeenCalled();
    expect(globalFetchSpy).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Simulation only — runs entirely in your browser and does not call or persist data to the server\./i)
    ).toBeInTheDocument();
  });
});
