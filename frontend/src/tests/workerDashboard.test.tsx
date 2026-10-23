/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { WorkerDashboard } from '../pages/worker/WorkerDashboard';

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

describe('WorkerDashboard Component', () => {
  const workerUserWithLocation = {
    id: 'worker_42',
    name: 'Vikram Singh',
    email: 'vikram@eventops.com',
    role: 'worker' as const,
    workerType: 'Chef',
    businessId: '4005',
    phone: '+91 91234 56789',
    location: {
      address: 'Andheri West, Mumbai',
      lat: 19.1136,
      lng: 72.8697,
      confirmedAt: '2026-10-22T00:00:00.000Z',
    },
    isActive: true,
    emailVerified: true,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  };

  const workerUserWithoutLocation = {
    id: 'worker_99',
    name: 'Rohan Sharma',
    email: 'rohan@eventops.com',
    role: 'worker' as const,
    workerType: 'Chef',
    businessId: '4006',
    isActive: true,
    emailVerified: true,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
  };

  it('renders Worker Dashboard heading, welcome greeting, and business ID', () => {
    renderWithProviders(<WorkerDashboard />, {
      preloadedState: {
        auth: { user: workerUserWithLocation, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    expect(screen.getByText('Worker Dashboard')).toBeDefined();
    expect(screen.getByText('Welcome back, Vikram Singh!')).toBeDefined();
    expect(screen.getByText(/W-4005/)).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('renders worker profile details including role, contact, and base location', () => {
    renderWithProviders(<WorkerDashboard />, {
      preloadedState: {
        auth: { user: workerUserWithLocation, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    expect(screen.getByText('Worker Profile Information')).toBeDefined();
    expect(screen.getAllByText('Chef').length).toBeGreaterThan(0);
    expect(screen.getByText('vikram@eventops.com')).toBeDefined();
    expect(screen.getByText('+91 91234 56789')).toBeDefined();
    expect(screen.getAllByText('Andheri West, Mumbai').length).toBeGreaterThan(0);
  });

  it('displays mandatory location configuration gate when location is missing', () => {
    renderWithProviders(<WorkerDashboard />, {
      preloadedState: {
        auth: { user: workerUserWithoutLocation, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    expect(screen.getByText('Mandatory Location Setup Required')).toBeDefined();
    expect(screen.getByText('Location Configuration Required')).toBeDefined();
    expect(screen.getByText('Set Up Location Now')).toBeDefined();
  });

  it('displays no-opportunities empty state when location is valid but no listings match', () => {
    renderWithProviders(<WorkerDashboard />, {
      preloadedState: {
        auth: { user: workerUserWithLocation, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    expect(screen.getByText('No Eligible Opportunities Found')).toBeDefined();
  });

  it('allows clicking the refresh action without errors', () => {
    vi.useFakeTimers();

    renderWithProviders(<WorkerDashboard />, {
      preloadedState: {
        auth: { user: workerUserWithLocation, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    const refreshBtn = screen.getByRole('button', { name: /Refresh Opportunities/i });
    expect(refreshBtn).toBeDefined();

    fireEvent.click(refreshBtn);

    act(() => {
      vi.advanceTimersByTime(700);
    });
    vi.useRealTimers();
  });
});
