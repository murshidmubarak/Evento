/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { managerApi } from '../features/manager/managerApi';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEvents: vi.fn(),
    getDashboardStats: vi.fn(),
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

describe('ManagerDashboard Component', () => {
  const managerUser = {
    id: 'em_123',
    name: 'Vikram Mehta',
    email: 'vikram@eventops.com',
    role: 'event_manager' as const,
    businessId: '1005',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(managerApi.getDashboardStats).mockResolvedValue({
      totalAssigned: 0,
      upcoming: 0,
      ongoing: 0,
      completed: 0,
    });
  });

  it('renders heading, permitted profile information, and Event Manager role badge', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce([]);

    renderWithProviders(<ManagerDashboard />, {
      preloadedState: {
        auth: {
          user: managerUser,
          token: 'valid_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    expect(screen.getByText('Event Manager Dashboard')).toBeDefined();
    expect(screen.getByText(/Vikram Mehta/)).toBeDefined();
    expect(screen.getByText(/vikram@eventops.com/)).toBeDefined();
    expect(screen.getByText('Event Manager')).toBeDefined();
    expect(screen.getByText(/ID: EM-1005/)).toBeDefined();
  });

  it('renders loading state while retrieving dashboard events', async () => {
    // Delay resolution
    vi.mocked(managerApi.getManagerEvents).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 500))
    );

    renderWithProviders(<ManagerDashboard />, {
      preloadedState: {
        auth: {
          user: managerUser,
          token: 'valid_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    expect(screen.getByText('Loading Assigned Events...')).toBeDefined();
  });

  it('renders the appropriate empty state when no events have been assigned', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce([]);

    renderWithProviders(<ManagerDashboard />, {
      preloadedState: {
        auth: {
          user: managerUser,
          token: 'valid_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('No Events Assigned')).toBeDefined();
      expect(
        screen.getByText(
          /No events have been assigned to you yet\. Your assigned events will appear here (once|when) the Admin assigns them\./
        )
      ).toBeDefined();
    });

    expect(screen.getByText('Check for Assignments')).toBeDefined();
  });

  it('renders assigned events when manager has assigned events', async () => {
    const mockEvents = [
      {
        _id: 'ev_1',
        title: 'Grand Annual Gala 2026',
        eventType: 'Corporate',
        date: '2026-11-20T00:00:00.000Z',
        startTime: '18:00',
        endTime: '23:00',
        location: { address: 'Grand Palace Hall, Mumbai' },
        guestCount: 250,
        status: 'confirmed',
      },
    ];

    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce(mockEvents);

    renderWithProviders(<ManagerDashboard />, {
      preloadedState: {
        auth: {
          user: managerUser,
          token: 'valid_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Grand Annual Gala 2026')).toBeDefined();
      expect(screen.getByText('Corporate')).toBeDefined();
      expect(screen.getByText('Confirmed')).toBeDefined();
      expect(screen.getByText(/Grand Palace Hall, Mumbai/)).toBeDefined();
      expect(screen.getByText('250 guests')).toBeDefined();
    });
  });

  it('renders recoverable error state when request fails, and retry triggers reload', async () => {
    vi.mocked(managerApi.getManagerEvents).mockRejectedValueOnce({
      response: { data: { message: 'Network connection failed' } },
    });

    renderWithProviders(<ManagerDashboard />, {
      preloadedState: {
        auth: {
          user: managerUser,
          token: 'valid_token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Network connection failed/)).toBeDefined();
    });

    // When clicking retry, call mock again with success
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce([]);
    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('No Events Assigned')).toBeDefined();
    });
  });
});
