import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import { DocsPage } from '../features/docs/pages/DocsPage';
import { pasteApi } from '../features/pastes/api/pasteApi';

vi.mock('../features/pastes/api/folderApi', () => ({
  folderApi: {
    getFolders: vi.fn().mockResolvedValue([]),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    movePaste: vi.fn(),
  },
}));

vi.mock('../features/discovery/api/discoveryApi', () => ({
  discoveryApi: {
    getDiscovery: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getPublicPastes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

const DOCS_DIR = path.resolve(__dirname, '../../../docs');
const FEATURES_DIR = path.join(DOCS_DIR, 'features');

describe('ExtraBin Documentation Expansion — 5 New Feature Guides & Demos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Five-section layout tests ---

  it('ND1. foldersDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'folders.md');
    expect(fs.existsSync(docPath), 'folders.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND2. revisionHistoryDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'revision-history.md');
    expect(fs.existsSync(docPath), 'revision-history.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND3. responsiveEmbedsDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'responsive-embeds.md');
    expect(fs.existsSync(docPath), 'responsive-embeds.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND4. commentsDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'comments-and-replies.md');
    expect(fs.existsSync(docPath), 'comments-and-replies.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND5. qrCodesDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'qr-codes.md');
    expect(fs.existsSync(docPath), 'qr-codes.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  // --- Demo component rendering tests ---

  it('ND6. foldersDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/folders']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('folders-demo');
    expect(demo).toBeInTheDocument();
  });

  it('ND7. revisionHistoryDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/revision-history']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('revision-history-demo');
    expect(demo).toBeInTheDocument();
  });

  it('ND8. responsiveEmbedsDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/responsive-embeds']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('responsive-embeds-demo');
    expect(demo).toBeInTheDocument();
  });

  it('ND9. commentsDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/comments-and-replies']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('comments-demo');
    expect(demo).toBeInTheDocument();
  });

  it('ND10. qrCodesDoc_hasLiveDemo', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/qr-codes']}>
        <DocsPage />
      </MemoryRouter>
    );
    const demo = screen.getByTestId('qr-code-demo');
    expect(demo).toBeInTheDocument();
  });

  // --- Cross-cutting quality tests ---

  it('ND11. allNewDemos_showSimulationDisclaimer', () => {
    const demoRoutes = [
      '/docs/features/folders',
      '/docs/features/revision-history',
      '/docs/features/responsive-embeds',
      '/docs/features/comments-and-replies',
      '/docs/features/qr-codes',
    ];

    for (const route of demoRoutes) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[route]}>
          <DocsPage />
        </MemoryRouter>
      );

      expect(
        screen.getByText(/Simulation only/i),
        `Demo at ${route} must display a "Simulation only" disclaimer`
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('ND12. allNewDemos_haveResetMechanism', () => {
    const demoRoutes = [
      '/docs/features/folders',
      '/docs/features/revision-history',
      '/docs/features/responsive-embeds',
      '/docs/features/comments-and-replies',
      '/docs/features/qr-codes',
    ];

    for (const route of demoRoutes) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[route]}>
          <DocsPage />
        </MemoryRouter>
      );

      const resetButtons = screen.queryAllByRole('button', { name: /reset/i });
      expect(
        resetButtons.length,
        `Demo at ${route} must have at least one reset button`
      ).toBeGreaterThanOrEqual(1);

      unmount();
    }
  });

  it('ND13. catalog_allThirteenFeaturesHaveGuideRoutes', () => {
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <DocsPage />
      </MemoryRouter>
    );

    const dedicatedGuideLinks = screen.getAllByRole('link', { name: /view guide/i });
    expect(dedicatedGuideLinks.length).toBe(13);

    const noGuideBadges = screen.queryAllByText(/Included in platform/i);
    expect(noGuideBadges.length).toBe(0);
  });

  it('ND14. demoManifest_existsAndReferencesAllFeatures', () => {
    const manifestPath = path.join(DOCS_DIR, 'DEMO_MANIFEST.md');
    expect(fs.existsSync(manifestPath), 'DEMO_MANIFEST.md must exist').toBe(true);

    const content = fs.readFileSync(manifestPath, 'utf-8');
    const requiredFeatureIds = [
      'encrypted',
      'api-suffixes',
      'burn',
      'passcode',
      'multifile',
      'folders',
      'diffs',
      'embed',
      'comments',
      'qrcode',
    ];

    for (const id of requiredFeatureIds) {
      expect(
        content.includes(id),
        `Demo manifest must reference feature ID: ${id}`
      ).toBe(true);
    }
  });

  it('ND15. docsHub_linksToAllFeaturePages', () => {
    const hubFile = path.join(DOCS_DIR, 'README.md');
    expect(fs.existsSync(hubFile), 'docs/README.md hub file must exist').toBe(true);

    const content = fs.readFileSync(hubFile, 'utf-8');
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
      'discovery',
    ];

    for (const feat of requiredFeatures) {
      expect(
        content.includes(`features/${feat}.md`) || content.includes(`/docs/features/${feat}`),
        `Hub must link to features/${feat}.md`
      ).toBe(true);
    }
  });

  it('ND16. newDemoComponents_doNotCallServer', async () => {
    const apiSpy = vi.spyOn(pasteApi, 'getPaste');
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <MemoryRouter initialEntries={['/docs/features/folders']}>
        <DocsPage />
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button');
    if (buttons.length > 0) {
      fireEvent.click(buttons[0]);
    }

    expect(apiSpy).not.toHaveBeenCalled();
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  it('ND17. discoveryDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'discovery.md');
    expect(fs.existsSync(docPath), 'discovery.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND18. tagsAndLibraryDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'tags-and-library.md');
    expect(fs.existsSync(docPath), 'tags-and-library.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND19. tagsAndLibraryGuide_isRouted', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/tags-and-library']}>
        <DocsPage />
      </MemoryRouter>
    );

    // The guide itself must render (not the hub fallback).
    expect(
      screen.getByRole('heading', { level: 1, name: /Tags & Personal Library Search/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/\/api\/v1\/account\/recently-edited/i)).toBeInTheDocument();
    expect(screen.getByText(/Feature Guide: 12 of 13/i)).toBeInTheDocument();
    expect(screen.queryByText(/EXTRABIN PLATFORM DOCUMENTATION HUB/i)).not.toBeInTheDocument();
  });

  it('ND20. authorProfilesDoc_followsFiveSectionLayout', () => {
    const docPath = path.join(FEATURES_DIR, 'author-profiles.md');
    expect(fs.existsSync(docPath), 'author-profiles.md must exist').toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toMatch(/## 1\.\s*What this is/i);
    expect(content).toMatch(/## 2\.\s*Live demo/i);
    expect(content).toMatch(/## 3\.\s*When to use it/i);
    expect(content).toMatch(/## 4\.\s*Step-by-step/i);
    expect(content).toMatch(/## 5\.\s*Learn more/i);
  });

  it('ND21. authorProfilesGuide_isRouted', () => {
    render(
      <MemoryRouter initialEntries={['/docs/features/author-profiles']}>
        <DocsPage />
      </MemoryRouter>
    );

    // The guide itself must render (not the hub fallback).
    expect(
      screen.getByRole('heading', { level: 1, name: /Public Author Profiles/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Feature Guide: 13 of 13/i)).toBeInTheDocument();
    expect(screen.queryByText(/EXTRABIN PLATFORM DOCUMENTATION HUB/i)).not.toBeInTheDocument();
  });
});
