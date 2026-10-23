/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { ExtendDeadlineModal } from '../components/manager/ExtendDeadlineModal';
import { SelectionResultsModal } from '../components/manager/SelectionResultsModal';
import { WorkerDashboard } from '../pages/worker/WorkerDashboard';
import { workRequirementsApi, type WorkRequirement, type SelectionResultsData, type WorkerOpportunity } from '../features/work-requirements/workRequirementsApi';

vi.mock('../features/work-requirements/workRequirementsApi', () => ({
  workRequirementsApi: {
    extendDeadline: vi.fn(),
    getSelectionResults: vi.fn(),
    triggerSelection: vi.fn(),
    getWorkerOpportunities: vi.fn(),
    getWorkerAssignments: vi.fn(),
    expressInterest: vi.fn(),
  },
}));

const mockRequirement: WorkRequirement = {
  _id: 'req_101',
  eventId: 'event_456',
  workerType: 'Catering Boy',
  requiredCount: 8,
  reportingTime: '08:00',
  maxDistanceKm: 15,
  interestDeadlineAt: '2026-10-25T18:00:00.000Z',
  status: 'open',
  selectionRound: 1,
  assignedWorkers: [
    {
      workerId: 'worker_1',
      assignedAt: '2026-10-25T18:05:00.000Z',
      distanceKm: 4.2,
      distanceScore: 72,
      selectionRound: 1,
    },
    {
      workerId: 'worker_2',
      assignedAt: '2026-10-25T18:05:00.000Z',
      distanceKm: 8.5,
      distanceScore: 43.3,
      selectionRound: 1,
    },
  ],
  filled: 2,
};

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

describe('Worker Selection Engine Frontend UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ExtendDeadlineModal Component', () => {
    it('renders requirement details and displays the critical worker preservation banner', () => {
      render(
        <ExtendDeadlineModal
          isOpen={true}
          onClose={vi.fn()}
          onExtended={vi.fn()}
          requirement={mockRequirement}
          eventTitle="Grand Gala Night"
        />
      );

      // Verify title & details
      expect(screen.getByText('Extend Interest Deadline')).toBeDefined();
      expect(screen.getByText(/Grand Gala Night/)).toBeDefined();
      expect(screen.getAllByText(/Catering Boy/).length).toBeGreaterThan(0);

      // Verify staffing counts: 2 assigned, 6 remaining of 8
      expect(screen.getByText('Total Required')).toBeDefined();
      expect(screen.getByText('Assigned (Kept)')).toBeDefined();
      expect(screen.getByText('Positions To Fill')).toBeDefined();
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('6').length).toBeGreaterThanOrEqual(1);

      // Verify critical preservation warning banner is clearly present
      expect(
        screen.getByText(/never remove or replace/i)
      ).toBeDefined();
    });

    it('submits a valid new deadline and triggers onExtended callback', async () => {
      const mockOnExtended = vi.fn();
      const updatedReq = {
        ...mockRequirement,
        interestDeadlineAt: '2026-10-28T18:00:00.000Z',
        selectionRound: 2,
      };
      vi.mocked(workRequirementsApi.extendDeadline).mockResolvedValueOnce(updatedReq);

      const { container } = render(
        <ExtendDeadlineModal
          isOpen={true}
          onClose={vi.fn()}
          onExtended={mockOnExtended}
          requirement={mockRequirement}
          eventTitle="Grand Gala Night"
        />
      );

      const input = container.querySelector('#newInterestDeadline') as HTMLInputElement;
      const form = container.querySelector('form') as HTMLFormElement;
      expect(input).toBeDefined();
      expect(form).toBeDefined();

      fireEvent.change(input, { target: { value: '2026-10-28T18:00' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(workRequirementsApi.extendDeadline).toHaveBeenCalledWith(
          'req_101',
          new Date('2026-10-28T18:00').toISOString()
        );
        expect(mockOnExtended).toHaveBeenCalledWith(updatedReq);
      });
    });
  });

  describe('SelectionResultsModal Component', () => {
    const mockResults: SelectionResultsData = {
      requirement: mockRequirement,
      assignedWorkers: [
        {
          workerId: {
            _id: 'worker_1',
            name: 'Aarav Sharma',
            workerType: 'Catering Boy',
            businessId: '1001',
          },
          assignedAt: '2026-10-25T18:05:00.000Z',
          distanceKm: 4.2,
          distanceScore: 72,
          selectionRound: 1,
        },
      ],
      candidates: [
        {
          _id: 'resp_1',
          workerId: {
            _id: 'worker_1',
            name: 'Aarav Sharma',
            workerType: 'Catering Boy',
            businessId: '1001',
          },
          responseStatus: 'selected',
          respondedAt: '2026-10-24T12:00:00.000Z',
          distanceKm: 4.2,
          distanceScore: 72,
          selectionRound: 1,
        },
        {
          _id: 'resp_2',
          workerId: {
            _id: 'worker_3',
            name: 'Dev Patel',
            workerType: 'Catering Boy',
            businessId: '1003',
          },
          responseStatus: 'not_selected',
          respondedAt: '2026-10-24T14:30:00.000Z',
          distanceKm: 22.0, // beyond 15km
          distanceScore: 0,
          selectionRound: 1,
        },
      ],
      extensionHistory: [
        {
          previousDeadline: '2026-10-25T18:00:00.000Z',
          newDeadline: '2026-10-28T18:00:00.000Z',
          extendedAt: '2026-10-25T19:00:00.000Z',
          extendedBy: 'mgr_99',
          remainingCount: 6,
        },
      ],
    };

    it('loads and displays assigned workers and candidates pool', async () => {
      vi.mocked(workRequirementsApi.getSelectionResults).mockResolvedValueOnce(mockResults);

      render(
        <SelectionResultsModal
          isOpen={true}
          onClose={vi.fn()}
          requirementId="req_101"
          eventTitle="Grand Gala Night"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Aarav Sharma')).toBeDefined();
        expect(screen.getByText(/4.2 km/)).toBeDefined();
      });

      // Switch to candidates tab
      const candidatesTab = screen.getByRole('button', { name: /Interested Pool/i });
      fireEvent.click(candidatesTab);

      await waitFor(() => {
        expect(screen.getByText('Dev Patel')).toBeDefined();
        expect(screen.getByText(/Exceeded 15 km limit/i)).toBeDefined();
      });
    });
  });

  describe('WorkerDashboard Opportunity & Express Interest', () => {
    const workerUser = {
      id: 'worker_42',
      name: 'Rohan Verma',
      email: 'rohan@eventops.com',
      role: 'worker' as const,
      workerType: 'Catering Boy',
      businessId: '4005',
      location: {
        address: 'MG Road, Kochi',
        lat: 9.9312,
        lng: 76.2673,
        confirmedAt: '2026-10-22T00:00:00.000Z',
      },
      isActive: true,
      emailVerified: true,
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
    };

    const mockOpps: WorkerOpportunity[] = [
      {
        id: 'opp_1',
        eventId: 'event_777',
        eventTitle: 'Annual Corporate Summit',
        eventType: 'corporate',
        eventDate: '2026-11-05T10:00:00.000Z',
        eventLocation: { address: 'Grand Ballroom, JW Marriott' },
        workerType: 'Catering Boy',
        requiredCount: 5,
        reportingTime: '08:00',
        maxDistanceKm: 20,
        distanceKm: 6.5,
        withinDistance: true,
        hasExpressedInterest: false,
        myResponseStatus: 'not_responded',
      },
    ];

    it('allows a worker to express interest in an open opportunity', async () => {
      vi.mocked(workRequirementsApi.getWorkerOpportunities).mockResolvedValueOnce(mockOpps);
      vi.mocked(workRequirementsApi.getWorkerAssignments).mockResolvedValueOnce([]);
      vi.mocked(workRequirementsApi.expressInterest).mockResolvedValueOnce({
        success: true,
        recordedAt: '2026-10-22T10:00:00.000Z',
        message: 'Interest recorded successfully! Your application is in the candidate pool.',
      });

      renderWithProviders(<WorkerDashboard />, {
        preloadedState: {
          auth: { user: workerUser, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Annual Corporate Summit')).toBeDefined();
        expect(screen.getByText('Express Interest')).toBeDefined();
      });

      const expressBtn = screen.getByRole('button', { name: /Express Interest/i });
      fireEvent.click(expressBtn);

      await waitFor(() => {
        expect(workRequirementsApi.expressInterest).toHaveBeenCalledWith('opp_1');
        expect(screen.getByText(/Interest registered & pending selection/i)).toBeDefined();
      });
    });

    it('does not display rejected opportunities in the available opportunities tab and updates tab is removed', async () => {
      const rejectedOpp: WorkerOpportunity = {
        id: 'opp_rejected',
        eventId: 'event_888',
        eventTitle: 'Grand Reception Banquet',
        eventType: 'wedding',
        eventDate: '2026-11-01T10:00:00.000Z',
        eventLocation: { address: 'Nilambur Hall' },
        workerType: 'Catering Boy',
        requiredCount: 2,
        reportingTime: '08:15',
        maxDistanceKm: 30,
        distanceKm: 12,
        withinDistance: true,
        hasExpressedInterest: true,
        myResponseStatus: 'not_selected',
      };

      vi.mocked(workRequirementsApi.getWorkerOpportunities).mockResolvedValueOnce([rejectedOpp]);
      vi.mocked(workRequirementsApi.getWorkerAssignments).mockResolvedValueOnce([]);

      renderWithProviders(<WorkerDashboard />, {
        preloadedState: {
          auth: { user: workerUser, token: 'mock-token', isAuthenticated: true, loading: false, error: null },
        },
      });

      await waitFor(() => {
        // Rejected opportunities are filtered out from available opportunities
        expect(screen.queryByText('Grand Reception Banquet')).toBeNull();
        expect(screen.queryByText('Not Selected')).toBeNull();
        // Application Updates tab is removed
        expect(screen.queryByText('Application Updates')).toBeNull();
      });
    });
  });
});
