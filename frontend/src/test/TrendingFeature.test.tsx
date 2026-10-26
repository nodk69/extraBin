import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DiscoveryPage } from '../features/discovery/pages/DiscoveryPage';
import { discoveryApi } from '../features/discovery/api/discoveryApi';
import { AuthProvider } from '../features/auth/context/AuthContext';
import type { PasteSummary } from '../features/dashboard/api/accountApi';

vi.mock('../features/discovery/api/discoveryApi', () => ({
  discoveryApi: {
    getDiscovery: vi.fn(),
    getPublicTags: vi.fn(),
    getMostSaved: vi.fn(),
    getTrending: vi.fn(),
  },
}));

const mockTrendingItems: PasteSummary[] = [
  {
    id: 'trending-1',
    title: 'High Velocity Paste',
    language: 'python',
    visibility: 'PUBLIC',
    views: 120,
    starsCount: 15,
    version: 1,
    createdAt: new Date().toISOString(),
    contentSizeBytes: 1024,
    lineCount: 45,
  },
  {
    id: 'trending-2',
    title: 'Popular Go Algorithm',
    language: 'go',
    visibility: 'PUBLIC',
    views: 85,
    starsCount: 9,
    version: 1,
    createdAt: new Date().toISOString(),
    contentSizeBytes: 512,
    lineCount: 20,
  },
];

describe('Trending Feature UI & Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(discoveryApi.getPublicTags).mockResolvedValue([
      { name: 'algorithms', pasteCount: 10 },
    ]);
    vi.mocked(discoveryApi.getDiscovery).mockResolvedValue({
      items: [],
      page: 0,
      size: 18,
      totalElements: 0,
      totalPages: 0,
      isFirst: true,
      isLast: true,
    });
    vi.mocked(discoveryApi.getTrending).mockResolvedValue({
      items: mockTrendingItems,
      page: 0,
      size: 18,
      totalElements: 2,
      totalPages: 1,
      isFirst: true,
      isLast: true,
    });
    vi.mocked(discoveryApi.getMostSaved).mockResolvedValue({
      items: [],
      page: 0,
      size: 18,
      totalElements: 0,
      totalPages: 0,
      isFirst: true,
      isLast: true,
    });
  });

  it('renders Trending tab alongside Explore and Most saved', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <DiscoveryPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const trendingTab = screen.getByRole('button', { name: /trending/i });
    expect(trendingTab).toBeInTheDocument();
    expect(trendingTab).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to Trending view and requests trending data with default 24h window', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <DiscoveryPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const trendingTab = screen.getByRole('button', { name: /trending/i });
    fireEvent.click(trendingTab);

    expect(trendingTab).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => {
      expect(discoveryApi.getTrending).toHaveBeenCalledWith(
        0,
        18,
        '24h',
        undefined,
        expect.any(AbortSignal)
      );
    });

    expect(screen.getByText('High Velocity Paste')).toBeInTheDocument();
    expect(screen.getByText('Popular Go Algorithm')).toBeInTheDocument();
    expect(screen.getByText('Trending pastes')).toBeInTheDocument();
  });

  it('allows changing the trending time window', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <DiscoveryPage />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /trending/i }));

    await waitFor(() => {
      expect(screen.getByText('Trending window')).toBeInTheDocument();
    });

    const windowTrigger = screen.getByRole('combobox', { name: /filter trending time window/i });
    expect(windowTrigger).toBeInTheDocument();
  });

  it('handles aborted requests cleanly when rapidly switching tabs', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(discoveryApi.getTrending).mockImplementation((_page, _size, _win, _lang, signal) => {
      capturedSignal = signal;
      return new Promise((resolve) => setTimeout(() => resolve({
        items: mockTrendingItems,
        page: 0,
        size: 18,
        totalElements: 2,
        totalPages: 1,
        isFirst: true,
        isLast: true,
      }), 200));
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <DiscoveryPage />
        </AuthProvider>
      </BrowserRouter>
    );

    const trendingTab = screen.getByRole('button', { name: /trending/i });
    const exploreTab = screen.getByRole('button', { name: /explore/i });

    // Click trending then immediately switch back to explore
    fireEvent.click(trendingTab);
    fireEvent.click(exploreTab);

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('displays clean error state when trending API rejects', async () => {
    vi.mocked(discoveryApi.getTrending).mockRejectedValueOnce(new Error('Network error'));

    render(
      <BrowserRouter>
        <AuthProvider>
          <DiscoveryPage />
        </AuthProvider>
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /trending/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /could not load trending snippets/i })
      ).toBeInTheDocument();
    });
  });
});
