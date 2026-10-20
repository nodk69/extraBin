import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CreatePasteForm } from '../features/pastes/components/CreatePasteForm';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { pasteApi } from '../features/pastes/api/pasteApi';

vi.mock('../lib/confetti', () => ({
  triggerSuccessBurst: vi.fn(),
}));

describe('CreatePasteForm', () => {
  it('renders inputs, language selector, and submit button', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CreatePasteForm />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByPlaceholderText(/e\.g\. database-migration\.sql/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste or write your text or source code here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument();
  });

  it('calculates byte count and lines dynamically', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CreatePasteForm />
        </AuthProvider>
      </BrowserRouter>
    );

    const textarea = screen.getByPlaceholderText(/Paste or write your text or source code here/i);
    fireEvent.change(textarea, { target: { value: 'line 1\nline 2' } });

    expect(screen.getByText(/2 lines/i)).toBeInTheDocument();
  });

  it('blocks submission when password toggle is active but password is empty', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CreatePasteForm />
        </AuthProvider>
      </BrowserRouter>
    );

    const textarea = screen.getByPlaceholderText(/Paste or write your text or source code here/i);
    fireEvent.change(textarea, { target: { value: 'secret code' } });

    // Toggle password protection ON
    const passwordToggle = screen.getByText('Password Protection');
    fireEvent.click(passwordToggle);

    // Click submit without entering a password
    const submitBtn = screen.getByRole('button', { name: /publish/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/password protection is enabled\. please enter an unlock passcode/i)
    ).toBeInTheDocument();
  });

  it('dispatches submission when Ctrl+Enter is pressed', async () => {
    const createPasteSpy = vi.spyOn(pasteApi, 'createPaste').mockResolvedValueOnce({
      id: 'test-paste-123',
      title: 'test',
      language: 'plaintext',
      visibility: 'PUBLIC',
      createdAt: '2026-01-01T00:00:00Z',
      contentSizeBytes: 14,
      lineCount: 1,
      deletionCapability: 'del-tok-123',
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <CreatePasteForm />
        </AuthProvider>
      </BrowserRouter>
    );

    const textarea = screen.getByPlaceholderText(/Paste or write your text or source code here/i);
    fireEvent.change(textarea, { target: { value: 'echo "hello"' } });

    // Press Ctrl+Enter on textarea
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(createPasteSpy).toHaveBeenCalledTimes(1);
    });

    createPasteSpy.mockRestore();
  });
});
