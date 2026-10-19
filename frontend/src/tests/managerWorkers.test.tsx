/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { ManagerWorkers } from '../pages/manager/ManagerWorkers';
import { workersApi } from '../features/workers/workersApi';

vi.mock('../features/workers/workersApi', () => ({
  WORKER_TYPES: [
    'Catering Boy',
    'Catering Supervisor',
    'Chef',
    'Cameraman / Photographer',
    'Videographer',
    'Decoration Worker',
    'Juice Worker',
    'Host',
  ],
  workersApi: {
    getWorkers: vi.fn(),
    createWorker: vi.fn(),
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

describe('ManagerWorkers Component', () => {
  const managerUser = {
    id: 'em_1',
    name: 'Karan Mehra',
    email: 'karan@eventops.com',
    role: 'event_manager' as const,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  const initialWorkers = [
    {
      id: 'worker_1',
      name: 'Sunil Chef',
      email: 'sunil@eventops.com',
      phone: '+91 98765 22222',
      role: 'worker' as const,
      workerType: 'Chef',
      businessId: '4001',
      location: { address: 'Colaba, Mumbai' },
      isActive: true,
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    },
    {
      id: 'worker_2',
      name: 'Pending Worker',
      email: 'pending.worker@eventops.com',
      phone: '+91 98765 33333',
      role: 'worker' as const,
      workerType: 'Videographer',
      businessId: '6001',
      isActive: false,
      invitationAcceptedAt: undefined,
      createdAt: '2026-10-08T00:00:00.000Z',
      updatedAt: '2026-10-08T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Manage Workers page heading, worker directory list, and status badges', async () => {
    vi.mocked(workersApi.getWorkers).mockResolvedValueOnce({
      workers: initialWorkers,
      total: 2,
      page: 1,
      limit: 50,
    });

    renderWithProviders(<ManagerWorkers />, {
      preloadedState: {
        auth: { user: managerUser, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
      },
    });

    // Heading
    expect(screen.getByText('Manage Workers')).toBeDefined();
    expect(screen.getByText('Create Worker')).toBeDefined();

    // Workers in list
    await waitFor(() => {
      expect(screen.getByText('Sunil Chef')).toBeDefined();
      expect(screen.getByText('sunil@eventops.com')).toBeDefined();
      expect(screen.getByText('W-4001')).toBeDefined();
      expect(screen.getAllByText('Chef').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);

      expect(screen.getByText('Pending Worker')).toBeDefined();
      expect(screen.getByText('pending.worker@eventops.com')).toBeDefined();
      expect(screen.getByText('W-6001')).toBeDefined();
      expect(screen.getAllByText('Videographer').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Pending Invitation').length).toBeGreaterThan(0);
      expect(screen.getByText('Resend')).toBeDefined();
    });
  });

  it('filters workers by search term', async () => {
    vi.mocked(workersApi.getWorkers).mockResolvedValueOnce({
      workers: initialWorkers,
      total: 2,
      page: 1,
      limit: 50,
    });

    renderWithProviders(<ManagerWorkers />);

    await waitFor(() => {
      expect(screen.getByText('Sunil Chef')).toBeDefined();
      expect(screen.getByText('Pending Worker')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/search name, email, or id/i);
    fireEvent.change(searchInput, { target: { value: 'sunil' } });

    expect(screen.getByText('Sunil Chef')).toBeDefined();
    expect(screen.queryByText('Pending Worker')).toBeNull();
  });

  it('validates required fields on worker creation', async () => {
    vi.mocked(workersApi.getWorkers).mockResolvedValueOnce({
      workers: initialWorkers,
      total: 2,
      page: 1,
      limit: 50,
    });

    renderWithProviders(<ManagerWorkers />);

    await waitFor(() => {
      expect(screen.getByText('Sunil Chef')).toBeDefined();
    });

    // Open Modal
    fireEvent.click(screen.getByText('Create Worker'));
    expect(screen.getByText('Onboard New Worker')).toBeDefined();

    // Submit without name
    const submitBtn = screen.getByText('Send Invitation');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Full name is required.')).toBeDefined();

    // Fill name but invalid email
    fireEvent.change(screen.getByPlaceholderText('e.g. Rahul Sharma'), {
      target: { value: 'Rahul Sharma' },
    });
    fireEvent.change(screen.getByPlaceholderText('worker@example.com'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(submitBtn);

    expect(screen.getByText('A valid email address is required.')).toBeDefined();
  });

  it('successfully creates worker and displays invitation dispatched success state', async () => {
    vi.mocked(workersApi.getWorkers).mockResolvedValue({
      workers: initialWorkers,
      total: 2,
      page: 1,
      limit: 50,
    });

    const createdWorker = {
      id: 'worker_new',
      name: 'Amit Photographer',
      email: 'amit@eventops.com',
      role: 'worker' as const,
      workerType: 'Cameraman / Photographer',
      businessId: '5001',
      isActive: false,
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };

    vi.mocked(workersApi.createWorker).mockResolvedValueOnce(createdWorker);

    renderWithProviders(<ManagerWorkers />);

    await waitFor(() => {
      expect(screen.getByText('Sunil Chef')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Create Worker'));

    fireEvent.change(screen.getByPlaceholderText('e.g. Rahul Sharma'), {
      target: { value: 'Amit Photographer' },
    });
    fireEvent.change(screen.getByPlaceholderText('worker@example.com'), {
      target: { value: 'amit@eventops.com' },
    });

    const submitBtn = screen.getByText('Send Invitation');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(workersApi.createWorker).toHaveBeenCalledWith({
        name: 'Amit Photographer',
        email: 'amit@eventops.com',
        workerType: 'Catering Boy', // default selection
        phone: undefined,
      });

      expect(screen.getByText('Worker Account Created')).toBeDefined();
      expect(screen.getByText('Invitation Email Dispatched!')).toBeDefined();
      expect(screen.getByText('W-5001')).toBeDefined();
    });
  });

  it('resends invitation for pending worker and displays success feedback', async () => {
    vi.mocked(workersApi.getWorkers).mockResolvedValue({
      workers: initialWorkers,
      total: 2,
      page: 1,
      limit: 50,
    });

    vi.mocked(workersApi.resendInvitation).mockResolvedValueOnce({
      message: 'Invitation resent successfully to pending.worker@eventops.com',
    });

    renderWithProviders(<ManagerWorkers />);

    await waitFor(() => {
      expect(screen.getByText('Pending Worker')).toBeDefined();
    });

    const resendBtn = screen.getByText('Resend');
    fireEvent.click(resendBtn);

    await waitFor(() => {
      expect(workersApi.resendInvitation).toHaveBeenCalledWith('worker_2');
      expect(
        screen.getByText('Invitation resent successfully to pending.worker@eventops.com')
      ).toBeDefined();
    });
  });
});
