/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AcceptInvitation } from '../pages/auth/AcceptInvitation';
import { invitationApi } from '../features/auth/invitationApi';

vi.mock('../features/auth/invitationApi', () => ({
  invitationApi: {
    getInvitationDetails: vi.fn(),
    acceptInvitation: vi.fn(),
  },
}));

describe('AcceptInvitation Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders invalid state when no token is present in URL', async () => {
    render(
      <MemoryRouter initialEntries={['/accept-invitation']}>
        <Routes>
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Invitation Invalid or Expired')).toBeDefined();
      expect(screen.getByText('No invitation token was provided in the link.')).toBeDefined();
    });
  });

  it('renders invalid state when token validation fails (expired or revoked)', async () => {
    vi.mocked(invitationApi.getInvitationDetails).mockRejectedValueOnce({
      response: {
        data: {
          message: 'Invitation link has expired or is invalid. Please contact the administrator.',
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/accept-invitation?token=invalid_or_expired_token']}>
        <Routes>
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Invitation Invalid or Expired')).toBeDefined();
      expect(
        screen.getByText('Invitation link has expired or is invalid. Please contact the administrator.')
      ).toBeDefined();
    });
  });

  it('renders password setup form for valid token', async () => {
    vi.mocked(invitationApi.getInvitationDetails).mockResolvedValueOnce({
      name: 'Karan Mehra',
      email: 'karan@eventops.com',
      role: 'event_manager',
    });

    render(
      <MemoryRouter initialEntries={['/accept-invitation?token=valid_secure_token']}>
        <Routes>
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome, Karan Mehra!')).toBeDefined();
      expect(screen.getByText('Authorized Role: Event Manager')).toBeDefined();
      expect(screen.getByPlaceholderText('At least 6 characters')).toBeDefined();
      expect(screen.getByPlaceholderText('Re-enter your password')).toBeDefined();
    });
  });

  it('validates password matching and minimum length', async () => {
    vi.mocked(invitationApi.getInvitationDetails).mockResolvedValueOnce({
      name: 'Karan Mehra',
      email: 'karan@eventops.com',
      role: 'event_manager',
    });

    render(
      <MemoryRouter initialEntries={['/accept-invitation?token=valid_secure_token']}>
        <Routes>
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome, Karan Mehra!')).toBeDefined();
    });

    const passInput = screen.getByPlaceholderText('At least 6 characters');
    const confirmInput = screen.getByPlaceholderText('Re-enter your password');

    // Mismatched passwords
    fireEvent.change(passInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'mismatch456' } });

    expect(screen.getByText('Passwords do not match.')).toBeDefined();

    // Matching passwords
    fireEvent.change(confirmInput, { target: { value: 'password123' } });
    expect(screen.queryByText('Passwords do not match.')).toBeNull();
  });

  it('successfully sets password and shows activation success message', async () => {
    vi.mocked(invitationApi.getInvitationDetails).mockResolvedValueOnce({
      name: 'Karan Mehra',
      email: 'karan@eventops.com',
      role: 'event_manager',
    });
    vi.mocked(invitationApi.acceptInvitation).mockResolvedValueOnce({
      success: true,
      message: 'Account activated successfully. You can now log in.',
    });

    render(
      <MemoryRouter initialEntries={['/accept-invitation?token=valid_secure_token']}>
        <Routes>
          <Route path="/accept-invitation" element={<AcceptInvitation />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Welcome, Karan Mehra!')).toBeDefined();
    });

    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), {
      target: { value: 'ManagerPass123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Re-enter your password'), {
      target: { value: 'ManagerPass123' },
    });

    const submitBtn = screen.getByText('Set Password & Activate Account');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invitationApi.acceptInvitation).toHaveBeenCalledWith({
        token: 'valid_secure_token',
        password: 'ManagerPass123',
        confirmPassword: 'ManagerPass123',
      });
      expect(screen.getByText('Account Activated Successfully!')).toBeDefined();
      expect(screen.getByText('Proceed to Login')).toBeDefined();
    });
  });
});
