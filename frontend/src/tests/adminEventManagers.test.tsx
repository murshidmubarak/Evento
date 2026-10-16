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
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Event Managers page heading and manager list', async () => {
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
      expect(screen.getByText('priya@eventops.com')).toBeDefined();
      expect(screen.getByText('EM-1001')).toBeDefined();
    });
  });

  it('opens manager creation form when clicking Create Event Manager', async () => {
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
    expect(screen.getByPlaceholderText('Minimum 6 characters')).toBeDefined();
  });

  it('validates required fields and password length', async () => {
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
    fireEvent.change(screen.getByPlaceholderText('Minimum 6 characters'), { target: { value: '123' } });

    // Submit
    fireEvent.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(screen.getByText('A valid email address is required.')).toBeDefined();
    });
  });

  it('successfully creates manager and displays safe account details', async () => {
    let currentManagers = [...initialManagers];
    vi.mocked(usersApi.getEventManagers).mockImplementation(async () => currentManagers);

    const newlyCreated = {
      id: 'em_2',
      name: 'Arun Kumar',
      email: 'arun@eventops.com',
      phone: '+91 99999 88888',
      role: 'event_manager' as const,
      businessId: '1002',
      isActive: true,
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
    fireEvent.change(screen.getByPlaceholderText('Minimum 6 characters'), { target: { value: 'SecurePass123' } });
    fireEvent.change(screen.getByPlaceholderText('+91 98765 43210'), { target: { value: '+91 99999 88888' } });

    fireEvent.click(screen.getByText('Create Account'));

    await waitFor(() => {
      expect(usersApi.createEventManager).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Event Manager Created Successfully!')).toBeDefined();
      expect(screen.getAllByText('EM-1002').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/arun@eventops.com/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('+91 99999 88888').length).toBeGreaterThanOrEqual(1);
    });

    // Close success modal
    fireEvent.click(screen.getByText('Done'));

    // Verify list contains newly created manager
    await waitFor(() => {
      expect(screen.getByText('Arun Kumar')).toBeDefined();
    });
  });
});
