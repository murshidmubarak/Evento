/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ManagerEventDetails } from '../pages/manager/ManagerEventDetails';
import { managerApi } from '../features/manager/managerApi';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEventById: vi.fn(),
  },
}));

// Mock ReadOnlyMap to avoid mapbox webgl requirement in jsdom
vi.mock('../components/common/ReadOnlyMap', () => ({
  ReadOnlyMap: ({ lat, lng }: { lat: number; lng: number }) => (
    <div data-testid="readonly-map">
      Map Location: {lat}, {lng}
    </div>
  ),
}));

describe('ManagerEventDetails Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (eventId = 'ev_123') => {
    return render(
      <MemoryRouter initialEntries={[`/manager/events/${eventId}`]}>
        <Routes>
          <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders operational details, schedule, venue, and host contact for assigned manager', async () => {
    const mockEvent = {
      _id: 'ev_123',
      title: 'Global Tech Summit 2026',
      eventType: 'Conference',
      date: '2026-11-15T00:00:00.000Z',
      startTime: '09:00',
      endTime: '18:00',
      guestCount: 300,
      status: 'confirmed',
      location: {
        address: 'Convention Center, Bangalore',
        lat: 12.9716,
        lng: 77.5946,
      },
      clientId: {
        _id: 'cli_999',
        name: 'Anita Sharma',
        email: 'anita@technova.com',
        phone: '+91 9876543210',
      },
      selectedServices: [
        {
          serviceId: {
            _id: 'svc_1',
            name: 'Corporate Catering',
            category: 'Catering',
          },
          preferences: {
            dietary: 'Vegetarian and Vegan options',
            serviceStyle: 'Buffet',
          },
        },
      ],
      notes: 'Please ensure stage microphones are checked 30 minutes prior.',
    };

    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(mockEvent as any);

    renderComponent('ev_123');

    // Loading first
    expect(screen.getByText('Loading Event Details...')).toBeDefined();

    // Loaded
    await waitFor(() => {
      expect(screen.getByText('Global Tech Summit 2026')).toBeDefined();
      expect(screen.getByText('Conference')).toBeDefined();
      expect(screen.getByText('Confirmed')).toBeDefined();
      expect(screen.getByText(/09:00 – 18:00/)).toBeDefined();
      expect(screen.getByText(/300 Guests/)).toBeDefined();
      expect(screen.getByText('Anita Sharma')).toBeDefined();
      expect(screen.getByText('anita@technova.com')).toBeDefined();
      expect(screen.getByText('+91 9876543210')).toBeDefined();
      expect(screen.getByText('Convention Center, Bangalore')).toBeDefined();
      expect(screen.getByTestId('readonly-map')).toBeDefined();
      expect(screen.getByText('Corporate Catering')).toBeDefined();
      expect(screen.getByText(/Please ensure stage microphones are checked/)).toBeDefined();
    });
  });

  it('displays access prohibited error when non-assigned manager accesses event (403 Forbidden)', async () => {
    vi.mocked(managerApi.getManagerEventById).mockRejectedValueOnce({
      response: {
        status: 403,
        data: { message: 'You do not have permission to access this event' },
      },
    });

    renderComponent('ev_forbidden');

    await waitFor(() => {
      expect(screen.getByText('Access Prohibited')).toBeDefined();
      expect(screen.getByText('You do not have permission to access this event')).toBeDefined();
      expect(screen.getByText('Back to Assigned Events')).toBeDefined();
    });
  });

  it('displays not found message when event does not exist (404 Not Found)', async () => {
    vi.mocked(managerApi.getManagerEventById).mockRejectedValueOnce({
      response: {
        status: 404,
        data: { message: 'Event not found' },
      },
    });

    renderComponent('ev_nonexistent');

    await waitFor(() => {
      expect(screen.getByText('Event Not Found')).toBeDefined();
      expect(screen.getByText('Event not found')).toBeDefined();
    });
  });
});
