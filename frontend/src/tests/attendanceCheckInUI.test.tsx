/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ManagerEventDetails } from '../pages/manager/ManagerEventDetails';
import { managerApi } from '../features/manager/managerApi';
import { attendanceApi } from '../features/attendance/attendanceApi';
import type { AttendanceRosterResponse, AttendanceSession } from '../features/attendance/attendance.types';

// Mock managerApi
vi.mock('../features/manager/managerApi', () => ({
  managerApi: {
    getManagerEventById: vi.fn(),
  },
}));

// Mock attendanceApi
vi.mock('../features/attendance/attendanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/attendance/attendanceApi')>();
  return {
    ...actual,
    attendanceApi: {
      getSession: vi.fn(),
      getRoster: vi.fn(),
      finalizeCheckIn: vi.fn(),
    },
  };
});

// Mock ReadOnlyMap
vi.mock('../components/common/ReadOnlyMap', () => ({
  ReadOnlyMap: () => <div data-testid="readonly-map" />,
}));

describe('Milestone 4 — Phase 4.3: Event Manager Check-in Frontend Integration', { timeout: 15000 }, () => {
  const mockEvent = {
    _id: 'ev_att_101',
    title: 'Grand Royal Wedding 2026',
    eventType: 'Wedding',
    date: '2026-11-20T00:00:00.000Z',
    startTime: '08:00',
    endTime: '22:00',
    guestCount: 500,
    status: 'confirmed',
    location: {
      address: 'Royal Palace Convention Center',
      lat: 12.9716,
      lng: 77.5946,
    },
    clientId: {
      _id: 'cli_1',
      name: 'Mr. Khan',
      email: 'khan@example.com',
      phone: '+91 9988776655',
    },
    selectedServices: [],
  };

  const mockSessionInitial: AttendanceSession = {
    _id: 'sess_101',
    eventId: 'ev_att_101',
    lifecycleStatus: 'checkin_in_progress',
    checkInFinalized: false,
    checkOutFinalized: false,
  };

  const mockRosterEligible: AttendanceRosterResponse = {
    eventId: 'ev_att_101',
    eventTitle: 'Grand Royal Wedding 2026',
    eventDate: '2026-11-20T00:00:00.000Z',
    session: {
      checkInFinalized: false,
      checkOutFinalized: false,
      lifecycleStatus: 'checkin_in_progress',
    },
    latestReportingTime: '09:30 AM',
    latestReportingTimestamp: '2026-11-20T04:00:00.000Z',
    canFinalizeCheckIn: true,
    totalAssigned: 3,
    roster: [
      {
        workerId: 'w_1',
        workerName: 'Ahmed Raza',
        workerEmail: 'ahmed@eventops.local',
        workerPhone: '+91 9111111111',
        businessId: 'W-2001',
        workerType: 'Catering Boy',
        requirementId: 'req_cat_1',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
      {
        workerId: 'w_2',
        workerName: 'Bilal Hassan',
        workerEmail: 'bilal@eventops.local',
        workerPhone: '+91 9222222222',
        businessId: 'W-2002',
        workerType: 'Catering Boy',
        requirementId: 'req_cat_1',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
      {
        workerId: 'w_3',
        workerName: 'Zubair Qureshi',
        workerEmail: 'zubair@eventops.local',
        workerPhone: '+91 9333333333',
        businessId: 'W-5001',
        workerType: 'Cameraman / Photographer',
        requirementId: 'req_photo_1',
        reportingTime: '09:30 AM',
        reportingTimeSnapshot: '09:30 AM',
        attendanceId: null,
        status: 'not_started',
        arrivalStatus: 'unrecorded',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
    ],
  };

  const mockRosterLocked: AttendanceRosterResponse = {
    ...mockRosterEligible,
    canFinalizeCheckIn: false,
  };

  const mockSessionFinalized: AttendanceSession = {
    _id: 'sess_101',
    eventId: 'ev_att_101',
    lifecycleStatus: 'checkin_finalized',
    checkInFinalized: true,
    checkInFinalizedAt: '2026-11-20T04:15:00.000Z',
    checkOutFinalized: false,
  };

  const mockRosterFinalized: AttendanceRosterResponse = {
    ...mockRosterEligible,
    session: {
      checkInFinalized: true,
      checkInFinalizedAt: '2026-11-20T04:15:00.000Z',
      checkOutFinalized: false,
      lifecycleStatus: 'checkin_finalized',
    },
    roster: [
      {
        ...mockRosterEligible.roster[0],
        status: 'present',
        arrivalStatus: 'on_time',
        checkIn: '2026-11-20T02:30:00.000Z',
        checkInSource: 'system_default',
      },
      {
        ...mockRosterEligible.roster[1],
        status: 'late',
        arrivalStatus: 'late',
        checkIn: '2026-11-20T03:15:00.000Z',
        checkInSource: 'manager_actual',
        delayMinutes: 45,
      },
      {
        ...mockRosterEligible.roster[2],
        status: 'absent',
        arrivalStatus: 'absent',
        checkIn: null,
        checkInSource: 'not_recorded',
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  const renderManagerDetails = (
    initialTab = 'attendance',
    customSession: AttendanceSession = mockSessionInitial,
    customRoster: AttendanceRosterResponse = mockRosterEligible
  ) => {
    vi.mocked(managerApi.getManagerEventById).mockResolvedValue(mockEvent as any);
    vi.mocked(attendanceApi.getSession).mockResolvedValue(customSession);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(customRoster);

    return render(
      <MemoryRouter initialEntries={[`/manager/events/ev_att_101?tab=${initialTab}`]}>
        <Routes>
          <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
        </Routes>
      </MemoryRouter>
    );
  };

  // -------------------------------------------------------------------------
  // 1. Navigation & Attendance Tab Integration
  // -------------------------------------------------------------------------
  describe('Tab Integration in ManagerEventDetails', () => {
    it('renders the Attendance tab button in the header', async () => {
      renderManagerDetails('overview');

      await waitFor(() => {
        expect(screen.getByText('Grand Royal Wedding 2026')).toBeDefined();
      });

      // Look for the exact Attendance tab button
      const attendanceTabBtn = screen.getByRole('button', { name: /^Attendance$/i });
      expect(attendanceTabBtn).toBeDefined();

      // Click on Attendance tab
      fireEvent.click(attendanceTabBtn);

      await waitFor(() => {
        expect(screen.getByText('Check-in Exceptions Workspace')).toBeDefined();
      });
    });

    it('renders Quick Attendance banner in overview tab for confirmed events', async () => {
      renderManagerDetails('overview');

      await waitFor(() => {
        expect(screen.getByText('Exception-Based Attendance & Check-in')).toBeDefined();
      });

      const jumpBtn = screen.getByRole('button', { name: /Manage Attendance & Check-in/i });
      fireEvent.click(jumpBtn);

      await waitFor(() => {
        expect(screen.getByText('Check-in Exceptions Workspace')).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Initial Roster Loading & Summary Metrics
  // -------------------------------------------------------------------------
  describe('Initial Roster Loading & Summary Cards', () => {
    it('loads session and roster, displaying summary counts and assigned workers', async () => {
      renderManagerDetails('attendance');

      await waitFor(() => {
        // Summary metrics
        expect(screen.getByText('Total Assigned')).toBeDefined();
        expect(screen.getByText('Default Present')).toBeDefined();
        expect(screen.getByText('Late Arrivals')).toBeDefined();
        expect(screen.getAllByText('Absent').length).toBeGreaterThan(0);
        expect(screen.getByText('Latest Shift')).toBeDefined();

        // Worker rows
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
        expect(screen.getByText('W-2001')).toBeDefined();
        expect(screen.getByText('Bilal Hassan')).toBeDefined();
        expect(screen.getByText('W-2002')).toBeDefined();
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
        expect(screen.getByText('W-5001')).toBeDefined();

        // Default On Time message for present workers
        expect(screen.getAllByText(/Will be recorded as .* \(Default\)/i).length).toBe(3);
      });
    });

    it('displays error notice and retry button if API fails to load', async () => {
      vi.mocked(managerApi.getManagerEventById).mockResolvedValue(mockEvent as any);
      vi.mocked(attendanceApi.getSession).mockRejectedValue(new Error('Network error loading session'));
      vi.mocked(attendanceApi.getRoster).mockRejectedValue(new Error('Network error loading roster'));

      render(
        <MemoryRouter initialEntries={['/manager/events/ev_att_101?tab=attendance']}>
          <Routes>
            <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Attendance')).toBeDefined();
        expect(screen.getByText(/Network error loading/)).toBeDefined();
        expect(screen.getByRole('button', { name: /Retry Loading/i })).toBeDefined();
      });
    });

    it('displays inactive notice when event is cancelled', async () => {
      const cancelledEvent = { ...mockEvent, status: 'cancelled' };
      vi.mocked(managerApi.getManagerEventById).mockResolvedValueOnce(cancelledEvent as any);

      render(
        <MemoryRouter initialEntries={['/manager/events/ev_att_101?tab=attendance']}>
          <Routes>
            <Route path="/manager/events/:id" element={<ManagerEventDetails />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Attendance Inactive')).toBeDefined();
        expect(screen.getByText(/Attendance check-in and roster operations cannot be performed on cancelled events/i)).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Latest Reporting Time Barrier Guard
  // -------------------------------------------------------------------------
  describe('Timing Guard Barrier & Button State', () => {
    it('disables finalization button and displays locked timing banner when shifts have not commenced', async () => {
      renderManagerDetails('attendance', mockSessionInitial, mockRosterLocked);

      await waitFor(() => {
        expect(screen.getByText('Check-in Finalization Locked Until Latest Shift')).toBeDefined();
        expect(screen.getByText(/Available after 09:30 AM/i)).toBeDefined();
      });

      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Check-in/i });
      expect(finalizeBtn).toBeDisabled();
    });

    it('enables finalization button and displays ready banner when timing guard passes', async () => {
      renderManagerDetails('attendance', mockSessionInitial, mockRosterEligible);

      await waitFor(() => {
        expect(screen.getByText('Ready for Check-in Finalization')).toBeDefined();
        expect(screen.getByText(/All Shifts Commenced/i)).toBeDefined();
      });

      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Check-in/i });
      expect(finalizeBtn).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Exception Management (Late, Absent, Reset, Validation)
  // -------------------------------------------------------------------------
  describe('Check-in Exception Form & Validation', () => {
    it('supports marking a worker Late, requires actual arrival time, and shows delay preview', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionInitial);
      vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterEligible);

      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
      });

      // Find Ahmed's Late button
      const lateButtons = screen.getAllByRole('button', { name: /^Late$/i });
      fireEvent.click(lateButtons[0]);

      // Error appears: arrival time is required
      await waitFor(() => {
        expect(screen.getByText('Arrival time is required for late exceptions')).toBeDefined();
      });

      // Finalize button is disabled due to validation error
      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Check-in/i });
      expect(finalizeBtn).toBeDisabled();

      // Find arrival time input
      const timeInputs = screen.getAllByPlaceholderText('HH:mm');
      expect(timeInputs.length).toBeGreaterThan(0);

      // Enter earlier time than 08:00 AM (e.g. 07:30)
      fireEvent.change(timeInputs[0], { target: { value: '07:30' } });
      await waitFor(() => {
        expect(
          screen.getByText(/Actual arrival time must be strictly later than scheduled reporting time/i)
        ).toBeDefined();
      });
      expect(finalizeBtn).toBeDisabled();

      // Enter valid late time: 08:45
      fireEvent.change(timeInputs[0], { target: { value: '08:45' } });
      await waitFor(() => {
        expect(screen.getByText('+45 min late')).toBeDefined();
      });

      // Validation error cleared, button re-enabled
      expect(finalizeBtn).not.toBeDisabled();
    });

    it('supports marking a worker Absent, removing them from Default Present', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionInitial);
      vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterEligible);

      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Bilal Hassan')).toBeDefined();
      });

      const absentButtons = screen.getAllByRole('button', { name: /^Absent$/i });
      fireEvent.click(absentButtons[1]);

      await waitFor(() => {
        expect(screen.getByText('Absent — Check-in omitted')).toBeDefined();
      });
    });

    it('allows resetting all exceptions back to default On Time', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionInitial);
      vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterEligible);

      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
      });

      // Mark one absent
      const absentButtons = screen.getAllByRole('button', { name: /^Absent$/i });
      fireEvent.click(absentButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Reset to Default/i })).toBeDefined();
      });

      // Click Reset to Default
      fireEvent.click(screen.getByRole('button', { name: /Reset to Default/i }));

      await waitFor(() => {
        expect(screen.getByText(/Exceptions reset\. All workers restored to default On Time\./i)).toBeDefined();
      });
    });

    it('filters workers using quick search and category filter chips', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionInitial);
      vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterEligible);

      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
      });

      // Search for Cameraman
      const searchInput = screen.getByPlaceholderText(/Search by name, type, ID\.\.\./i);
      fireEvent.change(searchInput, { target: { value: 'Zubair' } });

      await waitFor(() => {
        expect(screen.getByText('Zubair Qureshi')).toBeDefined();
        expect(screen.queryByText('Ahmed Raza')).toBeNull();
      });

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      await waitFor(() => {
        expect(screen.getByText('Ahmed Raza')).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. Review Modal, Idempotency & Finalize Check-in Submission
  // -------------------------------------------------------------------------
  describe('Review Modal & Idempotency Submission Flow', () => {
    it('opens confirmation modal, displays mandatory disclaimer, and includes Idempotency-Key in API call', async () => {
      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByText('Ready for Check-in Finalization')).toBeDefined();
      });

      // Mark Ahmed late (08:45)
      const lateButtons = screen.getAllByRole('button', { name: /^Late$/i });
      fireEvent.click(lateButtons[0]);
      const timeInputs = screen.getAllByPlaceholderText('HH:mm');
      fireEvent.change(timeInputs[0], { target: { value: '08:45' } });

      // Mark Bilal absent
      const absentButtons = screen.getAllByRole('button', { name: /^Absent$/i });
      fireEvent.click(absentButtons[1]);

      // Click Review & Finalize
      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Check-in/i });
      fireEvent.click(finalizeBtn);

      // Modal opens
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Review & Finalize Check-in/i })).toBeDefined();
        expect(screen.getByText(/Mandatory Attendance Notice/i)).toBeDefined();
        expect(screen.getByText(/system-generated default timestamps/i)).toBeDefined();
        expect(screen.getByText(/not individually verified arrival times/i)).toBeDefined();
        expect(screen.getByText(/Late Exceptions \(1\)/i)).toBeDefined();
        expect(screen.getByText(/Absent Exceptions \(1\)/i)).toBeDefined();
        expect(screen.getByText(/Idempotency Key:/i)).toBeDefined();
      });

      // Mock successful finalization
      vi.mocked(attendanceApi.finalizeCheckIn).mockResolvedValueOnce({
        eventId: 'ev_att_101',
        totalProcessed: 3,
        onTimeCount: 1,
        lateCount: 1,
        absentCount: 1,
        checkInFinalized: true,
        checkInFinalizedAt: '2026-11-20T04:15:00.000Z',
      });

      // Mock subsequent session & roster re-fetch after finalization
      vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionFinalized);
      vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterFinalized);

      const confirmBtn = screen.getByRole('button', { name: /Confirm & Finalize Check-in/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(attendanceApi.finalizeCheckIn).toHaveBeenCalledTimes(1);
      });

      const [calledEventId, calledPayload, calledIdempotencyKey] = vi.mocked(attendanceApi.finalizeCheckIn).mock.calls[0];
      expect(calledEventId).toBe('ev_att_101');
      expect(calledPayload).toEqual({
        lateExceptions: [{ workerId: 'w_1', actualArrivalTime: '08:45' }],
        absentExceptions: ['w_2'],
      });
      expect(typeof calledIdempotencyKey).toBe('string');
      expect(calledIdempotencyKey.startsWith('chk_ev_att_101_')).toBe(true);

      // Successfully transitioned to Checkout workspace / Check-in baseline
      await waitFor(() => {
        expect(screen.getByText(/Check-in has been successfully finalized/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /Check-in Baseline/i })).toBeDefined();
      });

      // Switch to Check-in Baseline to view persisted check-in records
      fireEvent.click(screen.getByRole('button', { name: /Check-in Baseline/i }));

      await waitFor(() => {
        expect(screen.getByText('Check-in Complete & Persisted')).toBeDefined();
        expect(screen.getByText('Finalized Attendance Records (3)')).toBeDefined();
      });
    });

    it('reuses the same idempotency key and payload on retry after network error', async () => {
      renderManagerDetails('attendance');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Review & Finalize Check-in/i })).toBeDefined();
      });

      // Open review modal
      fireEvent.click(screen.getByRole('button', { name: /Review & Finalize Check-in/i }));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Review & Finalize Check-in/i })).toBeDefined();
      });

      // Mock first attempt: network failure
      vi.mocked(attendanceApi.finalizeCheckIn).mockRejectedValueOnce(new Error('Network connection timeout'));

      const confirmBtn = screen.getByRole('button', { name: /Confirm & Finalize Check-in/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText('Network connection timeout')).toBeDefined();
        expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined();
      });

      // Mock second attempt: success
      vi.mocked(attendanceApi.finalizeCheckIn).mockResolvedValueOnce({
        eventId: 'ev_att_101',
        totalProcessed: 3,
        onTimeCount: 3,
        lateCount: 0,
        absentCount: 0,
        checkInFinalized: true,
        checkInFinalizedAt: '2026-11-20T04:15:00.000Z',
      });
      vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionFinalized);
      vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterFinalized);

      fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

      await waitFor(() => {
        expect(attendanceApi.finalizeCheckIn).toHaveBeenCalledTimes(2);
      });

      const firstCallKey = vi.mocked(attendanceApi.finalizeCheckIn).mock.calls[0][2];
      const secondCallKey = vi.mocked(attendanceApi.finalizeCheckIn).mock.calls[1][2];

      // Exact same idempotency key must be reused across retries!
      expect(firstCallKey).toBe(secondCallKey);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Finalized Attendance View (Read-Only)
  // -------------------------------------------------------------------------
  describe('Finalized Attendance View', () => {
    it('renders finalized read-only view with recorded timestamps and provenance sources', async () => {
      renderManagerDetails('attendance', mockSessionFinalized, mockRosterFinalized);

      // In Milestone 4 (Phases 4.3 & 4.4), view Check-in Baseline to inspect read-only records
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Check-in Baseline/i })).toBeDefined();
      });
      fireEvent.click(screen.getByRole('button', { name: /Check-in Baseline/i }));

      await waitFor(() => {
        expect(screen.getByText('Check-in Complete & Persisted')).toBeDefined();
        expect(screen.getByText('Finalized Attendance Records (3)')).toBeDefined();

        // Provenance badges
        expect(screen.getByText('System default')).toBeDefined();
        expect(screen.getByText('Manager actual')).toBeDefined();
        expect(screen.getByText('Not recorded')).toBeDefined();

        // Arrival status badges
        expect(screen.getAllByText(/On Time/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Late \(45 min\)/i)).toBeDefined();
        expect(screen.getAllByText(/Absent/i).length).toBeGreaterThan(0);

        // Exception editing inputs are absent (read-only)
        expect(screen.queryByPlaceholderText('HH:mm')).toBeNull();
        expect(screen.queryByRole('button', { name: /Review & Finalize Check-in/i })).toBeNull();
      });
    });
  });
});
