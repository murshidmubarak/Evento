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

describe('Work Requirements UI in Manager Portal', () => {
  const confirmedEvent = {
    _id: 'ev_confirmed_123',
    title: 'Grand Royal Wedding',
    eventType: 'Wedding',
    date: '2026-11-20T00:00:00.000Z',
    startTime: '10:00',
    endTime: '22:00',
    guestCount: 500,
    status: 'confirmed',
    location: { address: 'Palace Grounds, Bangalore' },
  };

  const sampleRequirements: WorkRequirement[] = [
    {
      _id: 'req_1',
      eventId: 'ev_confirmed_123',
      workerType: 'Catering Boy',
      requiredCount: 12,
      reportingTime: '08:30 AM',
      description: 'Buffet and table service. Black trousers and white shirt required.',
      status: 'draft',
      filled: 0,
      pending: 12,
    },
    {
      _id: 'req_2',
      eventId: 'ev_confirmed_123',
      workerType: 'Chef',
      requiredCount: 3,
      reportingTime: '06:00 AM',
      description: 'Head chef and sous chefs for live cooking counter.',
      status: 'open',
      filled: 0,
      pending: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (initialTab = 'requirements') => {
    const url = initialTab === 'requirements'
      ? '/manager/events/ev_confirmed_123?tab=requirements'
      : '/manager/events/ev_confirmed_123';

    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('1. Renders empty state with create action when no requirements exist for confirmed event', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce([]);

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getByText('Grand Royal Wedding')).toBeDefined();
      expect(screen.getByText('Staffing Demand Summary')).toBeDefined();
      expect(screen.getByText('No Work Requirements Created')).toBeDefined();
      expect(screen.getByText('Create First Requirement')).toBeDefined();
    });
  });

  it('2. Renders staffing demand summary, roles breakdown, and requirements list from backend data', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce(sampleRequirements);

    renderComponent('requirements');

    await waitFor(() => {
      // Summary cards
      expect(screen.getByText('Active Workers Needed')).toBeDefined();
      expect(screen.getByText('15')).toBeDefined(); // 12 Catering Boy + 3 Chef = 15 total active workers
      expect(screen.getByText('Total Requirements')).toBeDefined();

      // Breakdown tags
      expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Catering Boy').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Chef').length).toBeGreaterThanOrEqual(1);

      // Table rows
      expect(screen.getByText(/Buffet and table service/)).toBeDefined();
      expect(screen.getByText(/Head chef and sous chefs/)).toBeDefined();

      // Status badges
      expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
    });

    // Opening details modal shows Reporting Time and Modal Actions (Edit & Cancel for draft)
    fireEvent.click(screen.getAllByText('Details')[0]);
    await waitFor(() => {
      expect(screen.getByText('08:30 AM')).toBeDefined();
      expect(screen.getByText('Edit')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  it('3. Validates required count and creates a new requirement', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce([]);

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getByText('Add Requirement')).toBeDefined();
    });

    // Open create modal
    fireEvent.click(screen.getByText('Add Requirement'));
    expect(screen.getByText('Create Work Requirement')).toBeDefined();

    const form = screen.getByRole('dialog').querySelector('form')!;

    // Test frontend validation: invalid count (e.g. 0)
    const countInput = screen.getByLabelText(/Required Quantity/i);
    fireEvent.change(countInput, { target: { value: '0' } });
    fireEvent.submit(form);

    expect(screen.getByText(/Required count must be a whole number of at least 1/i)).toBeDefined();

    // Test frontend validation: missing reporting time
    fireEvent.change(countInput, { target: { value: '5' } });
    fireEvent.submit(form);

    expect(screen.getByText(/Reporting time is required/i)).toBeDefined();

    // Set valid time and worker type
    const workerTypeSelect = screen.getByLabelText(/Worker Type/i);
    fireEvent.change(workerTypeSelect, { target: { value: 'Decoration Worker' } });

    const timeInput = screen.getByLabelText(/Reporting Time/i);
    fireEvent.change(timeInput, { target: { value: '07:00' } });

    const newReq: WorkRequirement = {
      _id: 'req_new_3',
      eventId: 'ev_confirmed_123',
      workerType: 'Decoration Worker',
      requiredCount: 5,
      reportingTime: '07:00',
      status: 'draft',
      filled: 0,
      pending: 5,
    };
    vi.mocked(workRequirementsApi.createRequirement).mockResolvedValueOnce(newReq);

    fireEvent.submit(form);

    await waitFor(() => {
      expect(workRequirementsApi.createRequirement).toHaveBeenCalledWith(
        'ev_confirmed_123',
        expect.objectContaining({
          workerType: 'Decoration Worker',
          requiredCount: 5,
          reportingTime: '07:00',
        })
      );
      expect(screen.getByText(/Successfully created requirement for 5 × Decoration Worker/i)).toBeDefined();
      expect(screen.getAllByText('Decoration Worker').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('4. Allows editing a draft requirement and saves updates', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce([sampleRequirements[0]]);

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getAllByText('Details').length).toBeGreaterThanOrEqual(1);
    });

    // Open details modal by clicking row / Details button
    fireEvent.click(screen.getAllByText('Details')[0]);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    // Open edit modal
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Work Requirement')).toBeDefined();

    const countInput = screen.getByLabelText(/Required Quantity/i);
    fireEvent.change(countInput, { target: { value: '14' } });

    // Test validation: clearing reporting time shows validation error
    const timeInput = screen.getByLabelText(/Reporting Time/i);
    fireEvent.change(timeInput, { target: { value: '' } });
    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveBtn);
    expect(screen.getByText(/Reporting time is required/i)).toBeDefined();

    // Set valid reporting time
    fireEvent.change(timeInput, { target: { value: '09:30' } });

    const updatedReq: WorkRequirement = {
      ...sampleRequirements[0],
      requiredCount: 14,
      reportingTime: '09:30',
    };
    vi.mocked(workRequirementsApi.updateRequirement).mockResolvedValueOnce(updatedReq);

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(workRequirementsApi.updateRequirement).toHaveBeenCalledWith(
        'req_1',
        expect.objectContaining({
          requiredCount: 14,
        })
      );
      expect(screen.getAllByText('14').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('5. Allows cancelling a requirement with confirmation dialog', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockResolvedValueOnce([sampleRequirements[0]]);

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getAllByText('Details').length).toBeGreaterThanOrEqual(1);
    });

    // Open details modal by clicking row / Details button
    fireEvent.click(screen.getAllByText('Details')[0]);
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeDefined();
    });

    // Click Cancel to open confirmation modal
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Cancel Work Requirement?')).toBeDefined();
    expect(screen.getByText(/Are you sure you want to cancel the requirement/)).toBeDefined();

    const cancelledReq: WorkRequirement = {
      ...sampleRequirements[0],
      status: 'cancelled',
    };
    vi.mocked(workRequirementsApi.cancelRequirement).mockResolvedValueOnce(cancelledReq);

    const confirmBtn = screen.getByRole('button', { name: 'Confirm Cancellation' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(workRequirementsApi.cancelRequirement).toHaveBeenCalledWith('req_1');
      expect(screen.getByText(/has been cancelled/i)).toBeDefined();
      expect(screen.getAllByText('Cancelled').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('6. Locks work requirements and displays notice when event is not confirmed (e.g. requested)', async () => {
    const requestedEvent = {
      ...confirmedEvent,
      status: 'requested',
    };
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(requestedEvent as any);

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getByText('Work Requirements Locked for This Event')).toBeDefined();
      expect(screen.getByText(/worker recruitment begins only after Event = confirmed/i)).toBeDefined();
      expect(screen.queryByText('Add Requirement')).toBeNull();
    });
  });

  it('7. Displays meaningful error feedback on API failure and does not treat failure as empty list', async () => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(confirmedEvent as any);
    vi.mocked(workRequirementsApi.getRequirementsByEvent).mockRejectedValueOnce({
      response: { data: { message: 'Network database timeout retrieving staffing data' } },
    });

    renderComponent('requirements');

    await waitFor(() => {
      expect(screen.getByText('Network database timeout retrieving staffing data')).toBeDefined();
      expect(screen.getByText('Retry')).toBeDefined();
      expect(screen.queryByText('No Work Requirements Created')).toBeNull();
    });
  });
});
