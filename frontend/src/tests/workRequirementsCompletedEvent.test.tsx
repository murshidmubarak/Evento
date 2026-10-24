/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ManagerEventDetails } from '../pages/manager/ManagerEventDetails';
import { managerApi } from '../features/manager/managerApi';
import { workRequirementsApi, type WorkRequirement } from '../features/work-requirements/workRequirementsApi';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEventById: vi.fn(),
  },
}));

// Mock workRequirementsApi
vi.mock('../features/work-requirements/workRequirementsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/work-requirements/workRequirementsApi')>();
  return {
    ...actual,
    workRequirementsApi: {
      getRequirementsByEvent: vi.fn(),
      getRequirementById: vi.fn(),
      createRequirement: vi.fn(),
      updateRequirement: vi.fn(),
      cancelRequirement: vi.fn(),
    },
  };
});

// Mock ReadOnlyMap
vi.mock('../components/common/ReadOnlyMap', () => ({
  ReadOnlyMap: () => <div data-testid="readonly-map" />,
}));

describe('Work Requirements on Completed Events', () => {
  const completedEvent = {
    _id: 'ev_completed_999',
    title: 'Historic Tech Summit 2026',
    eventType: 'Corporate',
    date: '2026-10-15T00:00:00.000Z',
    startTime: '09:00',
    endTime: '17:00',
    guestCount: 300,
    status: 'completed',
    location: { address: 'Convention Hall, Bangalore' },
  };

  const completedRequirements: WorkRequirement[] = [
    {
      _id: 'req_101',
      eventId: 'ev_completed_999',
      workerType: 'Catering Boy',
      requiredCount: 8,
      reportingTime: '08:00 AM',
      description: 'Tea and snack catering service.',
      status: 'filled',
      filled: 8,
      pending: 0,
    },
    {
      _id: 'req_102',
      eventId: 'ev_completed_999',
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '07:00 AM',
      description: 'Breakfast and lunch head chefs.',
      status: 'closed',
      filled: 2,
      pending: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (initialEntries = ['/manager/events/ev_completed_999?tab=requirements']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. Loads and renders requirements list and statuses for a completed event', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(completedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce(completedRequirements);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Historic Tech Summit 2026')).toBeInTheDocument();
    });

    // Requirements table should be rendered
    await waitFor(() => {
      expect(screen.getByText(/Staffing Work Requirements/i)).toBeInTheDocument();
      expect(screen.getAllByText('Catering Boy').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Chef').length).toBeGreaterThanOrEqual(1);
    });

    // Statuses should be rendered
    expect(screen.getAllByText('Filled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(1);
  });

  it('2. Shows Event Completed banner and disables requirement creation', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(completedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce(completedRequirements);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Event Completed (View Only)')).toBeInTheDocument();
    });

    // "Add Requirement" button should NOT be present
    expect(screen.queryByText('Add Requirement')).not.toBeInTheDocument();
    // Instead, "Completed Event" badge is shown
    expect(screen.getByText('Completed Event')).toBeInTheDocument();
  });

  it('3. Modifying actions (Announce, Edit, Cancel, Extend) are not available on completed event', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(completedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce(completedRequirements);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Staffing Work Requirements (2)')).toBeInTheDocument();
    });

    // Action buttons that alter recruitment should not exist
    expect(screen.queryByText('Announce')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('Extend Deadline')).not.toBeInTheDocument();

    // Clicking Details opens details modal where Staffing Results is accessible
    fireEvent.click(screen.getAllByText('Details')[0]);
    await waitFor(() => {
      expect(screen.getByText(/View Staffing Results/i)).toBeInTheDocument();
    });
  });
});
