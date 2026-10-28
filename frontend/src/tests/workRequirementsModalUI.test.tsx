import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('WorkRequirementsSection Professional UI & Details Modal', () => {
  const sampleRequirement: WorkRequirement = {
    _id: 'req_spec_1',
    eventId: 'event_999',
    workerType: 'Catering Supervisor',
    requiredCount: 4,
    reportingTime: '17:30',
    maxDistanceKm: 18,
    status: 'draft',
    description: 'Main gate access control and VIP area security',
    interestDeadlineAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    assignedWorkers: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValue([sampleRequirement]);
  });

  afterEach(() => {
    cleanup();
  });

  it('removes Reporting Time and Max Distance columns from the table header', async () => {
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValue([sampleRequirement]);

    render(
      <MemoryRouter>
        <WorkRequirementsSection
          eventId="event_999"
          eventTitle="Global Summit 2026"
          eventStatus="confirmed"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Catering Supervisor').length).toBeGreaterThanOrEqual(1);
    });

    // Check table headers
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toContain('Worker Role');
    expect(headers).toContain('Staffing Progress');
    expect(headers).toContain('Interest Window');
    expect(headers).toContain('Status');
    expect(headers).toContain('Actions');

    // Confirm Reporting Time and Max Distance are NOT column headers
    expect(headers).not.toContain('Reporting Time');
    expect(headers).not.toContain('Max Distance');
  });

  it('shows Announce button directly in the row for draft requirement', async () => {
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValue([sampleRequirement]);

    render(
      <MemoryRouter>
        <WorkRequirementsSection
          eventId="event_999"
          eventTitle="Global Summit 2026"
          eventStatus="confirmed"
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Catering Supervisor').length).toBeGreaterThanOrEqual(1);
    });

    // Announce button is present in row
    const announceBtn = screen.getByRole('button', { name: /Announce/i });
    expect(announceBtn).toBeInTheDocument();
  });

  it('opens RequirementDetailsModal on row click showing Reporting Time, Max Distance, and modal actions', async () => {
    render(
      <MemoryRouter>
        <WorkRequirementsSection
          eventId="event_999"
          eventTitle="Global Summit 2026"
          eventStatus="confirmed"
        />
      </MemoryRouter>
    );

    // Wait for requirement row to load in the table
    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    });

    // Click on the table row directly
    const row = screen.getAllByRole('row')[1];
    fireEvent.click(row);

    await waitFor(() => {
      // Check reporting time card in modal
      expect(screen.getByText('05:30 PM')).toBeInTheDocument();
      // Check max distance in modal
      expect(screen.getByText('18 km')).toBeInTheDocument();
      // Check modal actions
      expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Announce Recruitment/i })).toBeInTheDocument();
    });

    // Close the modal
    const closeBtn = screen.getByRole('button', { name: 'Close modal' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('05:30 PM')).not.toBeInTheDocument();
    });
  });
});
