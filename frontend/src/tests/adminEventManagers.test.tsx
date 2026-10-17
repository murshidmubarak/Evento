/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { AdminEventManagers } from '../pages/admin/AdminEventManagers';
import { usersApi } from '../features/users/usersApi';

vi.mock('../features/users/usersApi', () => ({
  usersApi: {
    getEventManagers: vi.fn(),
    createEventManager: vi.fn(),
    resendInvitation: vi.fn(),
  },
}));

const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({ reducer: { auth: authReducer }, preloadedState }),
  } = {}
) => {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </Provider>
  );
};

describe('AdminEventManagers Component', () => {
  const adminUser = {
    id: 'admin_1',
    name: 'Admin User',
    email: 'admin@eventops.com',
    role: 'admin' as const,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  const initialManagers = [
    {
      id: 'em_1',
      name: 'Priya Patel',
      email: 'priya@eventops.com',
      phone: '+91 98765 11111',
      role: 'event_manager' as const,
      businessId: '1001',
      isActive: true,
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    },
    {
      id: 'em_2',
      name: 'Pending Manager',
      email: 'pending@eventops.com',
      phone: '+91 98765 22222',
      role: 'event_manager' as const,
      businessId: '1002',
      isActive: false,
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Event Managers page heading, manager list, and status badges', async () => {
    vi.mocked(usersApi.getEventManagers).mockResolvedValueOnce(initialManagers);

    renderWithProviders(<AdminEventManagers />, {
      preloadedState: {
        auth: {
          user: adminUser,
          token: 'admin_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Event Managers')).toBeDefined();
      expect(screen.getByText('Priya Patel')).toBeDefined();
      expect(screen.getByText('Active')).toBeDefined();
      expect(screen.getByText('Pending Manager')).toBeDefined();
      expect(screen.getByText('Pending Invitation')).toBeDefined();
      expect(screen.getByText('Resend Invitation')).toBeDefined();
    });
  });

  it('opens manager invitation modal without password field', async () => {
    vi.mocked(usersApi.getEventManagers).mockResolvedValueOnce(initialManagers);

    renderWithProviders(<AdminEventManagers />, {
      preloadedState: {
        auth: {
          user: adminUser,
          token: 'admin_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Priya Patel')).toBeDefined();
    });

    const createBtn = screen.getByText('Create Event Manager');
    fireEvent.click(createBtn);

    expect(screen.getByPlaceholderText('e.g. Rahul Sharma')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g. rahul@eventops.com')).toBeDefined();
    // Verify password input is NOT present
    expect(screen.queryByPlaceholderText('Minimum 6 characters')).toBeNull();
  });

  it('validates required fields on manager creation', async () => {
    vi.mocked(usersApi.getEventManagers).mockResolvedValueOnce(initialManagers);

    renderWithProviders(<AdminEventManagers />, {
      preloadedState: {
        auth: {
          user: adminUser,
          token: 'admin_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Priya Patel')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Create Event Manager'));

    // Fill only name, invalid email
    fireEvent.change(screen.getByPlaceholderText('e.g. Rahul Sharma'), { target: { value: 'Arun Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. rahul@eventops.com'), { target: { value: 'not-an-email' } });

    // Submit
    fireEvent.click(screen.getByText('Create & Send Invitation'));

    await waitFor(() => {
      expect(screen.getByText('A valid email address is required.')).toBeDefined();
    });
  });

  it('successfully creates manager and displays invitation dispatched success state', async () => {
    let currentManagers = [...initialManagers];
    vi.mocked(usersApi.getEventManagers).mockImplementation(async () => currentManagers);

    const newlyCreated = {
      id: 'em_3',
      name: 'Arun Kumar',
      email: 'arun@eventops.com',
      phone: '+91 99999 88888',
      role: 'event_manager' as const,
      businessId: '1003',
      isActive: false,
      createdAt: '2026-10-16T00:00:00.000Z',
      updatedAt: '2026-10-16T00:00:00.000Z',
    };

    vi.mocked(usersApi.createEventManager).mockImplementation(async () => {
      currentManagers = [...currentManagers, newlyCreated];
      return newlyCreated;
    });

    renderWithProviders(<AdminEventManagers />, {
      preloadedState: {
        auth: {
          user: adminUser,
          token: 'admin_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Priya Patel')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Create Event Manager'));

    fireEvent.change(screen.getByPlaceholderText('e.g. Rahul Sharma'), { target: { value: 'Arun Kumar' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. rahul@eventops.com'), { target: { value: 'arun@eventops.com' } });
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '+91 99999 88888' } });

    fireEvent.click(screen.getByText('Create & Send Invitation'));

    await waitFor(() => {
      expect(usersApi.createEventManager).toHaveBeenCalledWith({
        name: 'Arun Kumar',
        email: 'arun@eventops.com',
        phone: '+91 99999 88888',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Event Manager Created & Invitation Sent!')).toBeDefined();
      expect(screen.getAllByText('EM-1003').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/arun@eventops.com/).length).toBeGreaterThanOrEqual(1);
    });

    // Close success modal
    fireEvent.click(screen.getByText('Done'));

    // Verify list contains newly created manager
    await waitFor(() => {
      expect(screen.getByText('Arun Kumar')).toBeDefined();
    });
  });

  it('allows Admin to resend invitation for pending manager', async () => {
    vi.mocked(usersApi.getEventManagers).mockResolvedValueOnce(initialManagers);
    vi.mocked(usersApi.resendInvitation).mockResolvedValueOnce({
      message: 'Invitation resent successfully',
    });

    renderWithProviders(<AdminEventManagers />, {
      preloadedState: {
        auth: {
          user: adminUser,
          token: 'admin_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Pending Manager')).toBeDefined();
    });

    const resendBtn = screen.getByText('Resend Invitation');
    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(usersApi.resendInvitation).toHaveBeenCalledWith('em_2');
      expect(screen.getByText('Invitation resent successfully')).toBeDefined();
    });
  });
});
