import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import { AnnounceRequirementModal } from '../components/manager/AnnounceRequirementModal';
import { WorkRequirementsSection } from '../components/manager/WorkRequirementsSection';
import {
  workRequirementsApi,
  type WorkRequirement,
} from '../features/work-requirements/workRequirementsApi';

vi.mock('../features/work-requirements/workRequirementsApi', () => ({
  WORKER_TYPES: ['Juice Worker', 'Catering Boy', 'Security Guard', 'Sound Engineer'],
  workRequirementsApi: {
    getRequirementsByEvent: vi.fn(),
    updateRequirement: vi.fn(),
    createRequirement: vi.fn(),
    cancelRequirement: vi.fn(),
    extendDeadline: vi.fn(),
    getSelectionResults: vi.fn(),
  },
}));

const mockDraftRequirement: WorkRequirement = {
  _id: 'req_draft_1',
  eventId: 'event_777',
  workerType: 'Juice Worker',
  requiredCount: 2,
  reportingTime: '08:30',
  status: 'draft',
  description: 'Fresh juice counter service',
  assignedWorkers: [],
};

const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({ reducer: { auth: authReducer }, preloadedState }),
  } = {}
) => {
  return render(<Provider store={store}>{ui}</Provider>);
};

describe('Announce Recruitment Feature & UI Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders AnnounceRequirementModal and successfully submits status: open', async () => {
    const handleAnnounced = vi.fn();
    const handleClose = vi.fn();

    const futureDate = new Date(Date.now() + 86400000 * 2); // 2 days in future
    const isoString = futureDate.toISOString();

    const mockUpdated: WorkRequirement = {
      ...mockDraftRequirement,
      status: 'open',
      maxDistanceKm: 25,
      interestDeadlineAt: isoString,
    };

    vi.mocked(workRequirementsApi.updateRequirement).mockResolvedValueOnce(mockUpdated);

    render(
      <AnnounceRequirementModal
        isOpen={true}
        onClose={handleClose}
        onAnnounced={handleAnnounced}
        requirement={mockDraftRequirement}
        eventTitle="aju and aju"
      />
    );

    // Verify modal header and information
    expect(screen.getByText(/Announce Recruitment Opportunity/i)).toBeInTheDocument();
    expect(screen.getByText(/aju and aju/i)).toBeInTheDocument();
    expect(screen.getByText(/Broadcast to Eligible Workforce Pool/i)).toBeInTheDocument();

    // Verify distance input
    const distanceInput = screen.getByLabelText(/Maximum Permitted Worker Distance/i) as HTMLInputElement;
    fireEvent.change(distanceInput, { target: { value: '25' } });
    expect(distanceInput.value).toBe('25');

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Announce & Open for Workers/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(workRequirementsApi.updateRequirement).toHaveBeenCalledWith(
        'req_draft_1',
        expect.objectContaining({
          status: 'open',
          maxDistanceKm: 25,
        })
      );
      expect(handleAnnounced).toHaveBeenCalledWith(mockUpdated);
    });
  });

  it('shows Announce button on draft requirements in WorkRequirementsSection and triggers modal', async () => {
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce([
      mockDraftRequirement,
    ]);

    renderWithProviders(
      <WorkRequirementsSection
        eventId="event_777"
        eventTitle="aju and aju"
        eventStatus="confirmed"
      />
    );

    // Wait for requirement row to load
    await waitFor(() => {
      expect(screen.getAllByText('Juice Worker').length).toBeGreaterThan(0);
    });

    // Verify "Announce" button is visible for draft requirement
    const announceBtn = screen.getByRole('button', { name: /Announce/i });
    expect(announceBtn).toBeInTheDocument();

    // Click Announce button
    fireEvent.click(announceBtn);

    // Verify modal opens
    await waitFor(() => {
      expect(screen.getByText(/Announce Recruitment Opportunity/i)).toBeInTheDocument();
    });
  });
});
