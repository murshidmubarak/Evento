/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminEventDetails } from '../pages/admin/AdminEventDetails';
import * as eventsApi from '../features/events/eventsApi';

// Mock eventsApi
vi.mock('../features/events/eventsApi', async () => {
  const actual = await vi.importActual<any>('../features/events/eventsApi');
  return {
    ...actual,
    getEventById: vi.fn(),
    getAvailableManagers: vi.fn(),
    assignEventManager: vi.fn(),
  };
});

// Mock quotationApi
vi.mock('../features/quotations/quotationApi', () => ({
  getQuotations: vi.fn().mockResolvedValue([]),
}));

// Mock paymentsApi
vi.mock('../features/payments/paymentsApi', () => ({
  getAdvanceSummary: vi.fn().mockResolvedValue(null),
  renewPaymentLink: vi.fn(),
}));

// Mock ReadOnlyMap
vi.mock('../components/common/ReadOnlyMap', () => ({
  ReadOnlyMap: () => <div data-testid="mock-map">Map</div>,
}));

describe('Admin Event Manager Assignment in AdminEventDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const confirmedEvent = {
    _id: 'ev_confirmed_101',
    title: 'Grand Product Showcase',
    eventType: 'Exhibition',
    status: 'confirmed',
    date: '2026-11-10T00:00:00.000Z',
    startTime: '10:00',
    endTime: '17:00',
    guestCount: 200,
    location: { address: 'Tech Park, Hyderabad' },
    clientId: { name: 'Client Alice', email: 'alice@test.com', phone: '9988776655' },
    eventManagerId: null,
    selectedServices: [],
  };

  const renderComponent = (eventId = 'ev_confirmed_101') => {
    return render(
      <MemoryRouter initialEntries={[`/admin/events/${eventId}`]}>
        <Routes>
          <Route path="/admin/events/:id" element={<AdminEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders unassigned status for confirmed event and opens assignment modal with eligible managers', async () => {
    vi.mocked(eventsApi.getEventById).mockResolvedValueOnce(confirmedEvent as any);

    const availableManagers = [
      {
        _id: 'mgr_001',
        name: 'Suresh Kumar',
        email: 'suresh@eventops.com',
        phone: '9876501234',
        businessId: '102',
      },
    ];

    vi.mocked(eventsApi.getAvailableManagers).mockResolvedValueOnce(availableManagers as any);
    vi.mocked(eventsApi.assignEventManager).mockResolvedValueOnce({
      ...confirmedEvent,
      eventManagerId: availableManagers[0],
    } as any);

    renderComponent();

    // Event details loaded
    await waitFor(() => {
      expect(screen.getByText('Grand Product Showcase')).toBeDefined();
      expect(screen.getByText('Not Assigned Yet')).toBeDefined();
    });

    // Click "Assign Event Manager" button
    const assignBtn = screen.getByRole('button', { name: /Assign Event Manager/i });
    fireEvent.click(assignBtn);

    // Modal opens and shows available managers
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Assign Event Manager' })).toBeDefined();
      expect(screen.getByText('Suresh Kumar')).toBeDefined();
      expect(screen.getByText('EM-102')).toBeDefined();
      expect(screen.getByText('suresh@eventops.com')).toBeDefined();
    });

    // Select the manager
    const selectManagerBtn = screen.getByText('Suresh Kumar');
    fireEvent.click(selectManagerBtn);

    // Submit assignment
    const confirmAssignBtn = screen.getByText('Confirm Assignment');
    fireEvent.click(confirmAssignBtn);

    // Verify assignEventManager was called with event ID and manager ID
    await waitFor(() => {
      expect(eventsApi.assignEventManager).toHaveBeenCalledWith('ev_confirmed_101', 'mgr_001');
      expect(screen.getByText('Event Manager assigned successfully!')).toBeDefined();
    });
  });
});
