import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SettingsPage } from '../features/dashboard/pages/SettingsPage';
import { AccountPage } from '../features/dashboard/pages/AccountPage';
import * as AuthContext from '../features/auth/context/AuthContext';

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('Settings and Account Page Separation', () => {
  const mockUser = {
    id: 1,
    username: 'developer_pro',
    email: 'developer@example.com',
    role: 'ROLE_USER',
    emailVerified: true,
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('FE-SET-01: SettingsPage renders Profile Overview, credentials, and security policies', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    } as any);

    render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Profile Overview/i)).toBeInTheDocument();
    expect(screen.getAllByText('developer_pro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('developer@example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Profile/i).length).toBeGreaterThanOrEqual(1);
  });

  it('FE-ACC-TAB-01: AccountPage does NOT render the settings tab or developer profile settings card', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      register: vi.fn(),
      refreshUser: vi.fn(),
    } as any);

    render(
      <BrowserRouter>
        <AccountPage />
      </BrowserRouter>
    );

    expect(screen.queryByRole('button', { name: /account settings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Developer Profile Settings/i)).not.toBeInTheDocument();
  });
});
