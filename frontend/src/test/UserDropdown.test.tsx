import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { UserAvatar } from '../components/ui/UserAvatar';
import { UserDropdown } from '../features/auth/components/UserDropdown';
import { UserResponse } from '../features/auth/types/auth';

const mockUser: UserResponse = {
  id: 42,
  username: 'antigravity_dev',
  email: 'dev@example.com',
  role: 'ROLE_USER',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  avatarUrl: null,
};

describe('UserAvatar', () => {
  it('renders clean initials when no external image is provided', () => {
    render(<UserAvatar user={mockUser} size="md" />);
    // antigravity_dev splits into ['antigravity', 'dev'] -> 'AD'
    expect(screen.getByText('AD')).toBeInTheDocument();
  });

  it('renders initials from email when username is absent', () => {
    render(<UserAvatar email="alice.wonderland@example.com" size="md" />);
    // alice.wonderland splits into ['alice', 'wonderland'] -> 'AW'
    expect(screen.getByText('AW')).toBeInTheDocument();
  });

  it('renders status dot when showStatus or status is provided', () => {
    const { container } = render(<UserAvatar user={mockUser} size="lg" showStatus={true} status="online" />);
    const dot = container.querySelector('.bg-\\[\\#10b981\\]');
    expect(dot).toBeInTheDocument();
  });

  it('renders away status color properly', () => {
    const { container } = render(<UserAvatar user={mockUser} size="lg" status="away" />);
    const dot = container.querySelector('.bg-\\[\\#f59e0b\\]');
    expect(dot).toBeInTheDocument();
  });
});

describe('UserDropdown', () => {
  it('renders the trigger button with avatar and username', () => {
    const onLogout = vi.fn();
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={onLogout} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('antigravity_dev')).toBeInTheDocument();
  });

  it('opens menu upon click and shows profile details and sign out', async () => {
    const onLogout = vi.fn().mockResolvedValue(undefined);
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={onLogout} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Click trigger to open
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Check menu contents
    expect(screen.getByText('dev@example.com')).toBeInTheDocument();
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('Account & Pastes')).toBeInTheDocument();
    expect(screen.getByText('New Paste')).toBeInTheDocument();
    expect(screen.getByText('Explore Discovery')).toBeInTheDocument();

    // Verify misleading shortcut label ⌘Q is NOT present
    expect(screen.queryByText('⌘Q')).not.toBeInTheDocument();

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    expect(signOutBtn).toBeInTheDocument();

    // Click sign out
    fireEvent.click(signOutBtn);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('closes and restores focus when Escape key is pressed', () => {
    const onLogout = vi.fn();
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={onLogout} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(trigger);
    expect(screen.getByText('dev@example.com')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('dev@example.com')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports arrow key navigation within the menu', () => {
    const onLogout = vi.fn();
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={onLogout} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(trigger);

    const links = screen.getAllByRole('link');
    // First link should be focused on open
    expect(links[0]).toBeInTheDocument();

    // Navigate down
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(links[1]);

    // Navigate up
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(links[0]);
  });

  it('displays error message when logout fails', async () => {
    const onLogout = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <BrowserRouter>
        <UserDropdown user={mockUser} onLogout={onLogout} />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /user account menu/i });
    fireEvent.click(trigger);

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    const errorMsg = await screen.findByText(/failed to sign out/i);
    expect(errorMsg).toBeInTheDocument();
  });
});
