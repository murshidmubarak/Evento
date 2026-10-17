/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ManagerEventList } from '../pages/manager/ManagerEventList';
import { managerApi } from '../features/manager/managerApi';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEvents: vi.fn(),
  },
}));

describe('ManagerEventList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <ManagerEventList />
      </MemoryRouter>
    );
  };

  const mockEvents = [
    {
      _id: 'ev_001',
      title: 'Annual Gala 2026',
      eventType: 'Corporate',
      date: '2026-11-20T00:00:00.000Z',
      startTime: '18:00',
      endTime: '23:00',
      location: { address: 'Grand Palace Hall, Mumbai' },
      guestCount: 250,
      status: 'confirmed',
      clientId: { name: 'Acme Corp' },
    },
    {
      _id: 'ev_002',
      title: 'Product Launch Keynote',
      eventType: 'Product Launch',
      date: '2026-11-25T00:00:00.000Z',
      startTime: '10:00',
      endTime: '14:00',
      location: { address: 'TechHub Auditorium, Pune' },
      guestCount: 150,
      status: 'in_progress',
      clientId: { name: 'Innovate LLC' },
    },
  ];

  it('renders assigned events list with event cards and details links', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce(mockEvents as any);

    renderComponent();

    expect(screen.getByText('Loading Events...')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Annual Gala 2026')).toBeDefined();
      expect(screen.getByText('Product Launch Keynote')).toBeDefined();
      expect(screen.getByText('Grand Palace Hall, Mumbai')).toBeDefined();
      expect(screen.getByText('TechHub Auditorium, Pune')).toBeDefined();
      expect(screen.getByText('Host: Acme Corp')).toBeDefined();
      expect(screen.getByText('Host: Innovate LLC')).toBeDefined();
      expect(screen.getAllByText('View Details').length).toBe(2);
    });
  });

  it('filters events by status when clicking status tabs', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce(mockEvents as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Annual Gala 2026')).toBeDefined();
    });

    // Click 'In Progress' tab
    fireEvent.click(screen.getByRole('button', { name: 'In Progress' }));

    // Only Product Launch Keynote should be visible
    expect(screen.queryByText('Annual Gala 2026')).toBeNull();
    expect(screen.getByText('Product Launch Keynote')).toBeDefined();

    // Click 'Confirmed' tab
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed' }));

    expect(screen.getByText('Annual Gala 2026')).toBeDefined();
    expect(screen.queryByText('Product Launch Keynote')).toBeNull();
  });

  it('searches events by text query', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce(mockEvents as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Annual Gala 2026')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('Search by title, host, venue...');
    fireEvent.change(searchInput, { target: { value: 'Pune' } });

    expect(screen.queryByText('Annual Gala 2026')).toBeNull();
    expect(screen.getByText('Product Launch Keynote')).toBeDefined();
  });

  it('renders proper empty state when no events are assigned', async () => {
    vi.mocked(managerApi.getManagerEvents).mockResolvedValueOnce([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No Events Assigned')).toBeDefined();
      expect(
        screen.getByText(
          'No events have been assigned to you yet. Your assigned events will appear here when the Admin assigns them.'
        )
      ).toBeDefined();
    });
  });
});
