import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EmbedPastePage from '../features/pastes/pages/EmbedPastePage';
import EmbedModal from '../features/pastes/components/EmbedModal';
import { pasteApi } from '../features/pastes/api/pasteApi';

vi.mock('../features/pastes/api/pasteApi');

describe('Feature 4: Secure Paste Embeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EmbedPastePage', () => {
    const mockEmbedData = {
      publicId: 'embed-test-123',
      title: 'Config Snippet',
      language: 'yaml',
      createdAt: '2026-10-17T00:00:00Z',
      files: [
        {
          filename: 'application.yml',
          content: 'server:\n  port: 8080\n',
          language: 'yaml',
          sortOrder: 0,
          sizeBytes: 25,
          lineCount: 2,
        },
        {
          filename: 'banner.txt',
          content: 'EXTRA BIN EMBED\n',
          language: 'plaintext',
          sortOrder: 1,
          sizeBytes: 16,
          lineCount: 1,
        },
      ],
    };

    it('renders embed header, line numbers, and file tabs for eligible paste', async () => {
      (pasteApi.getEmbedPaste as any).mockResolvedValue(mockEmbedData);

      render(
        <MemoryRouter initialEntries={['/embed/embed-test-123']}>
          <Routes>
            <Route path="/embed/:id" element={<EmbedPastePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('EXTRABIN')).toBeInTheDocument();
        expect(screen.getByText('Config Snippet')).toBeInTheDocument();
        expect(screen.getByText('application.yml')).toBeInTheDocument();
        expect(screen.getByText('banner.txt')).toBeInTheDocument();
      });

      // Switch tab to banner.txt
      fireEvent.click(screen.getByText('banner.txt'));
      expect(screen.getByText('EXTRA BIN EMBED')).toBeInTheDocument();
    });

    it('renders safe fallback when paste is unavailable or unauthorized', async () => {
      (pasteApi.getEmbedPaste as any).mockRejectedValue({
        response: {
          data: {
            detail: 'Only public pastes can be embedded.',
          },
        },
      });

      render(
        <MemoryRouter initialEntries={['/embed/private-paste']}>
          <Routes>
            <Route path="/embed/:id" element={<EmbedPastePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Snippet Unavailable')).toBeInTheDocument();
        expect(screen.getByText('Only public pastes can be embedded.')).toBeInTheDocument();
        expect(screen.getByText('Visit ExtraBin')).toBeInTheDocument();
      });
    });
  });

  describe('EmbedModal Component', () => {
    it('generates copyable HTML snippet with sandbox and correct origin', () => {
      const handleClose = vi.fn();
      render(
        <EmbedModal
          isOpen={true}
          onClose={handleClose}
          pasteId="sample-paste-id"
          pasteTitle="Spring Boot Config"
        />
      );

      expect(screen.getByText('Embed Snippet')).toBeInTheDocument();
      expect(screen.getByText(/"Spring Boot Config"/)).toBeInTheDocument();

      const textarea = screen.getByLabelText('HTML Embed Code:') as HTMLTextAreaElement;
      expect(textarea.value).toContain('<iframe src="');
      expect(textarea.value).toContain('/embed/sample-paste-id"');
      expect(textarea.value).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');

      // Test changing height
      const select = screen.getByLabelText('Frame Height:') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '600' } });
      expect(textarea.value).toContain('height="600"');
    });

    it('copies embed code to clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(
        <EmbedModal
          isOpen={true}
          onClose={vi.fn()}
          pasteId="copy-test-id"
        />
      );

      const copyBtn = screen.getByRole('button', { name: /Copy Code/i });
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalled();
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });
});
