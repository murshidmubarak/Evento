/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EventAttendanceWorkspace } from '../components/manager/attendance/EventAttendanceWorkspace';
import { FinalizedAttendanceView } from '../components/manager/attendance/FinalizedAttendanceView';
import { attendanceApi, isOvernightCheckout, getOperationalDateString } from '../features/attendance/attendanceApi';
import type { AttendanceRosterResponse, AttendanceSession } from '../features/attendance/attendance.types';

// Mock attendanceApi
vi.mock('../features/attendance/attendanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/attendance/attendanceApi')>();
  return {
    ...actual,
    attendanceApi: {
      getSession: vi.fn(),
      getRoster: vi.fn(),
      recordCategoryDeparture: vi.fn(),
      recordWorkerCheckOutException: vi.fn(),
      clearWorkerCheckOutException: vi.fn(),
      finalizeCheckIn: vi.fn(),
      finalizeCheckOut: vi.fn(),
    },
  };
});

describe('Category-Wise, Exception-Based Checkout Frontend Integration', { timeout: 15000 }, () => {
  const mockSessionCheckInFinalized: AttendanceSession = {
    _id: 'sess_checkout_101',
    eventId: 'ev_checkout_101',
    lifecycleStatus: 'checkin_finalized',
    checkInFinalized: true,
    checkInFinalizedAt: '2026-11-06T09:30:00.000Z',
    checkOutFinalized: false,
  };

  const mockSessionCheckOutFinalized: AttendanceSession = {
    _id: 'sess_checkout_101',
    eventId: 'ev_checkout_101',
    lifecycleStatus: 'checkout_finalized',
    checkInFinalized: true,
    checkInFinalizedAt: '2026-11-06T09:30:00.000Z',
    checkOutFinalized: true,
    checkOutFinalizedAt: '2026-11-06T18:00:00.000Z',
  };

  const mockRosterCheckInFinalized: AttendanceRosterResponse = {
    eventId: 'ev_checkout_101',
    eventTitle: 'Grand Royal Gala',
    eventDate: '2026-11-06T00:00:00.000Z',
    canModifyCheckout: true,
    checkoutModificationDeadlineAt: '2026-11-07T18:00:00.000Z',
    checkoutModificationTimeRemainingMs: 86400000,
    session: {
      checkInFinalized: true,
      checkInFinalizedAt: '2026-11-06T09:30:00.000Z',
      checkOutFinalized: false,
      lifecycleStatus: 'checkin_finalized',
    },
    latestReportingTime: '09:30',
    latestReportingTimestamp: '2026-11-06T09:30:00.000Z',
    canFinalizeCheckIn: false,
    totalAssigned: 3,
    categoryActualDepartures: [],
    categorySummaries: [
      {
        workerType: 'Catering Boy',
        assignedCount: 2,
        eligibleCount: 2,
        absentCount: 0,
        actualDepartureTime: undefined,
        normalCount: 0,
        earlyDepartureCount: 0,
        overtimeCount: 0,
        pendingCount: 2,
        status: 'pending',
      },
      {
        workerType: 'Photographer',
        assignedCount: 1,
        eligibleCount: 0,
        absentCount: 1,
        actualDepartureTime: undefined,
        normalCount: 0,
        earlyDepartureCount: 0,
        overtimeCount: 0,
        pendingCount: 0,
        status: 'all_absent',
      },
    ],
    summary: {
      total: 3,
      present: 1,
      late: 1,
      absent: 1,
      checkedOutCount: 0,
      pendingCheckOutCount: 2,
      normalCount: 0,
      earlyDepartureCount: 0,
      overtimeCount: 0,
    },
    requirements: [
      {
        requirementId: 'req_catering',
        workerType: 'Catering Boy',
        reportingTime: '08:00 AM',
        assignedCount: 2,
      },
      {
        requirementId: 'req_photo',
        workerType: 'Photographer',
        reportingTime: '09:30',
        assignedCount: 1,
      },
    ],
    roster: [
      {
        workerId: 'w_1',
        workerName: 'Ahmed Raza',
        workerEmail: 'ahmed@eventops.local',
        workerPhone: '+91 9111111111',
        businessId: 'WRK-201',
        workerType: 'Catering Boy',
        requirementId: 'req_catering',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: 'att_1',
        status: 'checked_in',
        arrivalStatus: 'on_time',
        checkIn: '2026-11-06T08:00:00.000Z',
        checkInSource: 'system_default',
        delayMinutes: 0,
        isAssigned: true,
      },
      {
        workerId: 'w_2',
        workerName: 'Farhan Ali',
        workerEmail: 'farhan@eventops.local',
        workerPhone: '+91 9222222222',
        businessId: 'WRK-202',
        workerType: 'Catering Boy',
        requirementId: 'req_catering',
        reportingTime: '08:00 AM',
        reportingTimeSnapshot: '08:00 AM',
        attendanceId: 'att_2',
        status: 'checked_in',
        arrivalStatus: 'late',
        checkIn: '2026-11-06T08:45:00.000Z',
        checkInSource: 'manager_actual',
        delayMinutes: 45,
        isAssigned: true,
      },
      {
        workerId: 'w_3',
        workerName: 'Bilal Khan',
        workerEmail: 'bilal@eventops.local',
        workerPhone: '+91 9333333333',
        businessId: 'WRK-203',
        workerType: 'Photographer',
        requirementId: 'req_photo',
        reportingTime: '09:30',
        reportingTimeSnapshot: '09:30',
        attendanceId: 'att_3',
        status: 'absent',
        arrivalStatus: 'absent',
        checkIn: null,
        checkInSource: 'not_recorded',
        delayMinutes: 0,
        isAssigned: true,
      },
    ],
  };

  const mockRosterCheckOutFinalized: AttendanceRosterResponse = {
    ...mockRosterCheckInFinalized,
    session: {
      checkInFinalized: true,
      checkInFinalizedAt: '2026-11-06T09:30:00.000Z',
      actualNormalFinishTime: '17:00',
      checkOutFinalized: true,
      checkOutFinalizedAt: '2026-11-06T18:00:00.000Z',
      lifecycleStatus: 'checkout_finalized',
    },
    categorySummaries: [
      {
        workerType: 'Catering Boy',
        assignedCount: 2,
        eligibleCount: 2,
        absentCount: 0,
        actualDepartureTime: '17:00',
        departureRecordedAt: '2026-11-06T17:00:00.000Z',
        normalCount: 1,
        earlyDepartureCount: 1,
        overtimeCount: 0,
        pendingCount: 0,
        status: 'configured',
      },
      {
        workerType: 'Photographer',
        assignedCount: 1,
        eligibleCount: 0,
        absentCount: 1,
        actualDepartureTime: undefined,
        normalCount: 0,
        earlyDepartureCount: 0,
        overtimeCount: 0,
        pendingCount: 0,
        status: 'all_absent',
      },
    ],
    roster: [
      {
        ...mockRosterCheckInFinalized.roster[0],
        status: 'checked_out',
        departureStatus: 'normal',
        checkOut: '2026-11-06T17:00:00.000Z',
        checkOutSource: 'category_default',
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        durationMinutes: 540,
      },
      {
        ...mockRosterCheckInFinalized.roster[1],
        status: 'checked_out',
        departureStatus: 'early_departure',
        checkOut: '2026-11-06T15:30:00.000Z',
        checkOutSource: 'individual_exception',
        earlyDepartureMinutes: 90,
        overtimeMinutes: 0,
        durationMinutes: 405,
      },
      {
        ...mockRosterCheckInFinalized.roster[2],
        status: 'absent',
        departureStatus: 'not_recorded',
        checkOut: null,
        checkOutSource: 'not_recorded',
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        durationMinutes: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  // ---------------------------------------------------------------------------
  // 1. Initial State & Category-Wise Workspace Rendering
  // ---------------------------------------------------------------------------
  it('renders Category-Wise Checkout Workspace when clicking Checkout button', async () => {
    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
      />
    );

    await waitFor(() => {
      const checkoutBtn = screen.getByRole('button', { name: /Checkout/i });
      fireEvent.click(checkoutBtn);
    });

    // Verify category departure workspace & categories
    await waitFor(() => {
      expect(screen.getByText(/Category Departure Management/i)).toBeInTheDocument();
      expect(screen.getByText(/Catering Boy/i)).toBeInTheDocument();
      expect(screen.getByText(/Photographer/i)).toBeInTheDocument();
    });

    // Verify absent worker is rendered as absent without checkout
    expect(screen.getByText('Bilal Khan')).toBeInTheDocument();
    expect(screen.getAllByText(/Absent/i).length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Category Departure Recording
  // ---------------------------------------------------------------------------
  it('records actual category departure time and invokes recordCategoryDeparture', async () => {
    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);
    vi.mocked(attendanceApi.recordCategoryDeparture).mockResolvedValue({
      eventId: 'ev_checkout_101',
      workerType: 'Catering Boy',
      actualDepartureTime: '17:00',
      actualDepartureDate: '2026-11-06T17:00:00.000Z',
      affectedWorkersCount: 2,
      normalCount: 2,
      earlyDepartureCount: 0,
      overtimeCount: 0,
      departureStatus: 'normal',
    });

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Catering Boy/i)).toBeInTheDocument();
    });

    // Find the input in the Catering Boy card
    const inputs = screen.getAllByPlaceholderText(/e.g. 16:00 or 04:00 PM/i);
    expect(inputs.length).toBeGreaterThan(0);

    fireEvent.change(inputs[0], { target: { value: '17:00' } });

    // Find the Save button for that category
    const saveButtons = screen.getAllByRole('button', { name: /Save Departure/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(attendanceApi.recordCategoryDeparture).toHaveBeenCalledWith(
        'ev_checkout_101',
        expect.objectContaining({
          workerType: 'Catering Boy',
          actualDepartureTime: '17:00',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Individual Exceptions: Early Departure and Overtime
  // ---------------------------------------------------------------------------
  it('allows opening exception modal and submitting an early departure exception', async () => {
    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);
    vi.mocked(attendanceApi.recordWorkerCheckOutException).mockResolvedValue({
      workerId: 'w_2',
      workerName: 'Farhan Ali',
      workerEmail: 'farhan@eventops.local',
      workerPhone: '+91 9222222222',
      businessId: 'WRK-202',
      workerType: 'Catering Boy',
      requirementId: 'req_catering',
      reportingTime: '08:00 AM',
      reportingTimeSnapshot: '08:00 AM',
      attendanceId: 'att_2',
      status: 'checked_out',
      arrivalStatus: 'late',
      checkIn: '2026-11-06T08:45:00.000Z',
      checkInSource: 'manager_actual',
      delayMinutes: 45,
      checkOut: '2026-11-06T15:30:00.000Z',
      checkOutSource: 'individual_exception',
      departureStatus: 'early_departure',
      earlyDepartureMinutes: 90,
      overtimeMinutes: 0,
      durationMinutes: 405,
      totalWorkingDurationMinutes: 405,
      isAssigned: true,
    });

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Farhan Ali')).toBeInTheDocument();
    });

    // Click "Action" button for Farhan Ali to open details modal
    const actionBtns = screen.getAllByRole('button', { name: /Action/i });
    expect(actionBtns.length).toBeGreaterThan(0);
    fireEvent.click(actionBtns[0]);

    // Find "Mark Early" button inside modal
    const markEarlyBtns = screen.getAllByRole('button', { name: /Mark Early/i });
    expect(markEarlyBtns.length).toBeGreaterThan(0);

    fireEvent.click(markEarlyBtns[0]);

    // Form mode appears
    await waitFor(() => {
      expect(screen.getByText(/Mark Early Departure/i)).toBeInTheDocument();
    });

    // Fill exception departure time
    const timeInput = screen.getByPlaceholderText(/e\.g\. 14:00 or 02:00 PM/i);
    fireEvent.change(timeInput, { target: { value: '15:30' } });

    // Submit modal
    const saveExceptionBtn = screen.getByRole('button', { name: /Save Exception/i });
    fireEvent.click(saveExceptionBtn);

    await waitFor(() => {
      expect(attendanceApi.recordWorkerCheckOutException).toHaveBeenCalledWith(
        'ev_checkout_101',
        expect.any(String),
        expect.objectContaining({
          actualDepartureTime: '15:30',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Return to Normal (Clear Exception)
  // ---------------------------------------------------------------------------
  it('allows clearing an individual exception and returning worker to normal category default', async () => {
    const rosterWithException: AttendanceRosterResponse = {
      ...mockRosterCheckInFinalized,
      categoryActualDepartures: [
        {
          workerType: 'Catering Boy',
          actualDepartureTime: '17:00',
          actualDepartureDate: '2026-11-06T17:00:00.000Z',
          departureRecordedAt: '2026-11-06T17:00:00.000Z',
          recordedBy: 'mgr_1',
          source: 'manager_actual',
        },
      ],
      roster: [
        {
          ...mockRosterCheckInFinalized.roster[0],
          checkOut: '2026-11-06T15:30:00.000Z',
          checkOutSource: 'individual_exception',
          departureStatus: 'early_departure',
          earlyDepartureMinutes: 90,
          durationMinutes: 450,
        },
        mockRosterCheckInFinalized.roster[1],
        mockRosterCheckInFinalized.roster[2],
      ],
    };

    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(rosterWithException);
    vi.mocked(attendanceApi.clearWorkerCheckOutException).mockResolvedValue({
      ...mockRosterCheckInFinalized.roster[0],
      checkOut: '2026-11-06T17:00:00.000Z',
      checkOutSource: 'category_default',
      departureStatus: 'normal',
      earlyDepartureMinutes: 0,
      durationMinutes: 540,
    });

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Farhan Ali')).toBeInTheDocument();
    });

    // Open modal via Action button
    const actionBtns = screen.getAllByRole('button', { name: /Action/i });
    expect(actionBtns.length).toBeGreaterThan(0);
    fireEvent.click(actionBtns[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Return to Normal/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Return to Normal/i }));

    await waitFor(() => {
      expect(attendanceApi.clearWorkerCheckOutException).toHaveBeenCalledWith('ev_checkout_101', 'w_1');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. 24-Hour Modification Window Lock
  // ---------------------------------------------------------------------------
  it('displays locked banner and disables modifications when 24h correction deadline has passed', async () => {
    const rosterLocked: AttendanceRosterResponse = {
      ...mockRosterCheckInFinalized,
      canModifyCheckout: false,
      checkoutModificationDeadlineAt: '2026-11-07T18:00:00.000Z',
      checkoutModificationTimeRemainingMs: 0,
    };

    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(rosterLocked);

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Checkout Editing Closed \(Locked\)/i)).toBeInTheDocument();
      expect(screen.getByText(/closed after the event day/i)).toBeInTheDocument();
    });

    // Check that Save Departure buttons are disabled
    const saveButtons = screen.queryAllByRole('button', { name: /Save Departure/i });
    saveButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Review & Finalize Modal Confirmation
  // ---------------------------------------------------------------------------
  it('opens Review Modal and finalizes checkout when category departures are configured', async () => {
    const configuredRoster: AttendanceRosterResponse = {
      ...mockRosterCheckInFinalized,
      categoryActualDepartures: [
        {
          workerType: 'Catering Boy',
          actualDepartureTime: '17:00',
          actualDepartureDate: '2026-11-06T17:00:00.000Z',
          departureRecordedAt: '2026-11-06T17:00:00.000Z',
          recordedBy: 'mgr_1',
          source: 'manager_actual',
        },
      ],
      categorySummaries: [
        {
          workerType: 'Catering Boy',
          assignedCount: 2,
          eligibleCount: 2,
          absentCount: 0,
          actualDepartureTime: '17:00',
          departureRecordedAt: '2026-11-06T17:00:00.000Z',
          normalCount: 2,
          earlyDepartureCount: 0,
          overtimeCount: 0,
          pendingCount: 0,
          status: 'configured',
        },
        {
          workerType: 'Photographer',
          assignedCount: 1,
          eligibleCount: 0,
          absentCount: 1,
          actualDepartureTime: undefined,
          normalCount: 0,
          earlyDepartureCount: 0,
          overtimeCount: 0,
          pendingCount: 0,
          status: 'all_absent',
        },
      ],
      roster: [
        {
          ...mockRosterCheckInFinalized.roster[0],
          checkOut: '2026-11-06T17:00:00.000Z',
          checkOutSource: 'category_default',
          departureStatus: 'normal',
          durationMinutes: 540,
        },
        {
          ...mockRosterCheckInFinalized.roster[1],
          checkOut: '2026-11-06T17:00:00.000Z',
          checkOutSource: 'category_default',
          departureStatus: 'normal',
          durationMinutes: 495,
        },
        mockRosterCheckInFinalized.roster[2],
      ],
    };

    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(configuredRoster);
    vi.mocked(attendanceApi.finalizeCheckOut).mockResolvedValue({
      eventId: 'ev_checkout_101',
      totalProcessed: 3,
      normalCheckoutCount: 2,
      earlyDepartureCount: 0,
      overtimeCount: 0,
      absentCount: 1,
      checkOutFinalized: true,
      checkOutFinalizedAt: '2026-11-06T18:00:00.000Z',
    });

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Checkout/i });
      expect(finalizeBtn).not.toBeDisabled();
      fireEvent.click(finalizeBtn);
    });

    // Review Modal opens
    await waitFor(() => {
      expect(screen.getByText(/Review & Finalize Event Checkout/i)).toBeInTheDocument();
      expect(screen.getByText(/Strictly excluded from checkout/i)).toBeInTheDocument();
    });

    // Confirm Checkout
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Finalize Checkout/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(attendanceApi.finalizeCheckOut).toHaveBeenCalledWith(
        'ev_checkout_101',
        expect.any(Object),
        expect.stringMatching(/^chkout_ev_checkout_101_/)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. 409 Conflict Handling
  // ---------------------------------------------------------------------------
  it('when 409 occurs and checkout is already finalized, automatically transitions to finalized view', async () => {
    const configuredRoster: AttendanceRosterResponse = {
      ...mockRosterCheckInFinalized,
      categorySummaries: [
        {
          workerType: 'Catering Boy',
          assignedCount: 2,
          eligibleCount: 2,
          absentCount: 0,
          actualDepartureTime: '17:00',
          normalCount: 2,
          earlyDepartureCount: 0,
          overtimeCount: 0,
          pendingCount: 0,
          status: 'configured',
        },
      ],
      roster: [
        {
          ...mockRosterCheckInFinalized.roster[0],
          checkOut: '2026-11-06T17:00:00.000Z',
          checkOutSource: 'category_default',
          departureStatus: 'normal',
        },
      ],
    };

    vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(configuredRoster);

    const conflictErr = { response: { status: 409, data: { message: 'Checkout already finalized' } } };
    vi.mocked(attendanceApi.finalizeCheckOut).mockRejectedValue(conflictErr);
    vi.mocked(attendanceApi.getSession).mockResolvedValueOnce(mockSessionCheckOutFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValueOnce(mockRosterCheckOutFinalized);

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
        initialTab="checkout_form"
      />
    );

    await waitFor(() => {
      const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Checkout/i });
      fireEvent.click(finalizeBtn);
    });

    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Finalize Checkout/i });
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Checkout was already finalized for this event/i)).toBeInTheDocument();
    });
  });

  it('renders inactive banner when event is cancelled', async () => {
    render(
      <EventAttendanceWorkspace
        eventId="ev_cancelled"
        eventTitle="Cancelled Gala"
        eventStatus="cancelled"
      />
    );

    expect(screen.getByText(/Attendance Inactive/i)).toBeInTheDocument();
    expect(screen.getByText(/This event has been cancelled/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 8. Timezone-Aware Overnight [+1 Day] Display Regression Tests (Asia/Kolkata)
  // ---------------------------------------------------------------------------
  describe('Timezone-Aware Overnight [+1 Day] Display (Asia/Kolkata)', () => {
    it('correctly resolves operational date strings and overnight status for Asia/Kolkata', () => {
      const checkInUTC = '2026-11-06T14:30:00.000Z';
      const checkOutUTC = '2026-11-06T20:30:00.000Z';

      expect(new Date(checkInUTC).getUTCDate()).toBe(6);
      expect(new Date(checkOutUTC).getUTCDate()).toBe(6);

      expect(getOperationalDateString(checkInUTC, 'Asia/Kolkata')).toBe('2026-11-06');
      expect(getOperationalDateString(checkOutUTC, 'Asia/Kolkata')).toBe('2026-11-07');

      expect(isOvernightCheckout(checkInUTC, checkOutUTC, 'Asia/Kolkata')).toBe(true);

      const sameDayCheckIn = '2026-11-06T03:30:00.000Z';
      const sameDayCheckOut = '2026-11-06T11:30:00.000Z';

      expect(getOperationalDateString(sameDayCheckIn, 'Asia/Kolkata')).toBe('2026-11-06');
      expect(getOperationalDateString(sameDayCheckOut, 'Asia/Kolkata')).toBe('2026-11-06');
      expect(isOvernightCheckout(sameDayCheckIn, sameDayCheckOut, 'Asia/Kolkata')).toBe(false);
    });

    it('displays [+1 Day] indicator when check-in is 8:00 PM IST and checkout is 2:00 AM IST (both UTC Nov 6)', () => {
      const mockOvernightRoster = [
        {
          workerId: 'w_overnight',
          workerName: 'Kareem Khan',
          workerEmail: 'kareem@eventops.local',
          workerPhone: '+91 9555555555',
          businessId: 'WRK-501',
          workerType: 'Videographer',
          requirementId: 'req_video',
          reportingTime: '08:00 PM',
          reportingTimeSnapshot: '08:00 PM',
          attendanceId: 'att_overnight',
          status: 'checked_out' as const,
          arrivalStatus: 'on_time' as const,
          delayMinutes: 0,
          departureStatus: 'normal' as const,
          checkIn: '2026-11-06T14:30:00.000Z',
          checkOut: '2026-11-06T20:30:00.000Z',
          checkInSource: 'category_default' as const,
          checkOutSource: 'category_default' as const,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          durationMinutes: 360,
          isAssigned: true,
        },
      ];

      render(
        <FinalizedAttendanceView
          session={{
            checkInFinalized: true,
            checkInFinalizedAt: '2026-11-06T14:30:00.000Z',
            checkOutFinalized: true,
            checkOutFinalizedAt: '2026-11-06T20:35:00.000Z',
            actualNormalFinishTime: '02:00 AM',
            lifecycleStatus: 'checkout_finalized',
          }}
          roster={mockOvernightRoster}
        />
      );

      expect(screen.getByText('Kareem Khan')).toBeInTheDocument();
      const plusOneBadge = screen.getByText('+1 Day');
      expect(plusOneBadge).toBeInTheDocument();
      expect(plusOneBadge).toHaveClass('bg-indigo-100', 'text-indigo-800');
    });

    it('ensures [+1 Day] indicator is ABSENT for normal same-day shift', () => {
      const mockSameDayRoster = [
        {
          workerId: 'w_sameday',
          workerName: 'Sunil Verma',
          workerEmail: 'sunil@eventops.local',
          workerPhone: '+91 9666666666',
          businessId: 'WRK-502',
          workerType: 'Chef',
          requirementId: 'req_chef',
          reportingTime: '09:00 AM',
          reportingTimeSnapshot: '09:00 AM',
          attendanceId: 'att_sameday',
          status: 'checked_out' as const,
          arrivalStatus: 'on_time' as const,
          delayMinutes: 0,
          departureStatus: 'normal' as const,
          checkIn: '2026-11-06T03:30:00.000Z',
          checkOut: '2026-11-06T11:30:00.000Z',
          checkInSource: 'category_default' as const,
          checkOutSource: 'category_default' as const,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          durationMinutes: 480,
          isAssigned: true,
        },
      ];

      render(
        <FinalizedAttendanceView
          session={{
            checkInFinalized: true,
            checkInFinalizedAt: '2026-11-06T03:30:00.000Z',
            checkOutFinalized: true,
            checkOutFinalizedAt: '2026-11-06T11:35:00.000Z',
            actualNormalFinishTime: '05:00 PM',
            lifecycleStatus: 'checkout_finalized',
          }}
          roster={mockSameDayRoster}
        />
      );

      expect(screen.getByText('Sunil Verma')).toBeInTheDocument();
      expect(screen.queryByText('+1 Day')).not.toBeInTheDocument();
    });
  });
});
