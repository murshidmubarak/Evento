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
      finalizeCheckIn: vi.fn(),
      finalizeCheckOut: vi.fn(),
    },
  };
});

describe('Milestone 4 — Phase 4.4: Exception-Based Checkout Frontend Integration', { timeout: 15000 }, () => {
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
    actualNormalFinishTime: '17:00',
    requirementFinishOverrides: [
      { requirementId: 'req_photo', normalFinishTime: '19:00', normalFinishDate: '2026-11-06T19:00:00.000Z' },
    ],
  };

  const mockRosterCheckInFinalized: AttendanceRosterResponse = {
    eventId: 'ev_checkout_101',
    eventTitle: 'Grand Royal Gala',
    eventDate: '2026-11-06T00:00:00.000Z',
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
      requirementFinishOverrides: [
        { requirementId: 'req_photo', normalFinishTime: '19:00', normalFinishDate: '2026-11-06T19:00:00.000Z' },
      ],
      checkOutFinalized: true,
      checkOutFinalizedAt: '2026-11-06T18:00:00.000Z',
      lifecycleStatus: 'checkout_finalized',
    },
    roster: [
      {
        ...mockRosterCheckInFinalized.roster[0],
        status: 'checked_out',
        departureStatus: 'normal',
        checkOut: '2026-11-06T17:00:00.000Z',
        checkOutSource: 'system_default',
        applicableNormalFinishTimeSnapshot: '17:00',
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        durationMinutes: 540,
      },
      {
        ...mockRosterCheckInFinalized.roster[1],
        status: 'checked_out',
        departureStatus: 'early_departure',
        checkOut: '2026-11-06T15:30:00.000Z',
        checkOutSource: 'manager_actual',
        applicableNormalFinishTimeSnapshot: '17:00',
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
        applicableNormalFinishTimeSnapshot: '19:00',
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
        durationMinutes: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Initial State & Checkout Stage Rendering
  // ---------------------------------------------------------------------------
  it('renders Checkout Workspace when check-in is finalized and checkout is pending', async () => {
    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
      />
    );

    // Verify checkout workspace is active
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Checkout$/i })).toBeInTheDocument();
      expect(screen.getByText(/Normal Work Finishing Time/i)).toBeInTheDocument();
      expect(screen.getByText(/Checkout Stage Active/i)).toBeInTheDocument();
    });

    // Verify Default Finish Time input exists
    expect(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 2. Default Finishing-Time Validation
  // ---------------------------------------------------------------------------
  it('validates Event Default Normal Finishing Time and disables review button when invalid', async () => {
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
      expect(screen.getByText(/Review & Finalize Checkout/i)).toBeInTheDocument();
    });

    const finalizeBtn = screen.getByRole('button', { name: /Review & Finalize Checkout/i });
    // Button starts disabled because defaultFinishTime is empty
    expect(finalizeBtn).toBeDisabled();

    // Type invalid time
    const finishInput = screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i);
    fireEvent.change(finishInput, { target: { value: 'invalid-time' } });

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid time/i)).toBeInTheDocument();
      expect(finalizeBtn).toBeDisabled();
    });

    // Type valid time
    fireEvent.change(finishInput, { target: { value: '17:00' } });

    await waitFor(() => {
      expect(screen.queryByText(/Please enter a valid time/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Valid Time/i)).toBeInTheDocument();
      expect(finalizeBtn).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Work Requirement Overrides
  // ---------------------------------------------------------------------------
  it('allows adding and removing requirement-level finishing-time overrides', async () => {
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
      expect(screen.getByText(/Work Requirement Overrides/i)).toBeInTheDocument();
    });

    // Select requirement to override
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'req_photo' } });

    // Enter override time
    const overrideInput = screen.getByPlaceholderText(/Override Time/i);
    fireEvent.change(overrideInput, { target: { value: '19:30' } });

    // Click Add Override
    const addBtn = screen.getByRole('button', { name: /Add Override/i });
    fireEvent.click(addBtn);

    // Verify override pill is added
    await waitFor(() => {
      expect(screen.getByText(/1 override\(s\) configured/i)).toBeInTheDocument();
      expect(screen.getAllByText(/19:30/).length).toBeGreaterThan(0);
    });

    // Verify remove button removes the override
    const removeBtn = screen.getByTitle(/Remove override/i);
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByText(/0 override\(s\) configured/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Checkout Roster Exception Toggling
  // ---------------------------------------------------------------------------
  it('renders check-in status, excludes absent workers, and enables early departure / overtime', async () => {
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
      expect(screen.getByText('Ahmed Raza')).toBeInTheDocument();
      expect(screen.getByText('Farhan Ali')).toBeInTheDocument();
      expect(screen.getByText('Bilal Khan')).toBeInTheDocument();
    });

    // Verify absent worker is excluded with clear disabled indicator
    expect(screen.getByText(/Absent — Excluded from checkout/i)).toBeInTheDocument();

    // Verify checked-in workers have Normal (Default) selected by default
    const normalButtons = screen.getAllByRole('button', { name: /Normal \(Default\)/i });
    expect(normalButtons.length).toBe(2); // For the 2 checked-in workers

    // Click "Early Departure" for Farhan Ali
    const earlyButtons = screen.getAllByRole('button', { name: /Early Departure/i });
    fireEvent.click(earlyButtons[1]); // Farhan Ali

    // Verify input for departure time appears
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Departure Time \(e\.g\. 15:30\)/i)).toBeInTheDocument();
    });

    // Fill valid early departure time
    const earlyInput = screen.getByPlaceholderText(/Departure Time \(e\.g\. 15:30\)/i);
    fireEvent.change(earlyInput, { target: { value: '15:30' } });

    // Click "Overtime" for Ahmed Raza
    const overtimeButtons = screen.getAllByRole('button', { name: /Overtime/i });
    fireEvent.click(overtimeButtons[0]); // Ahmed Raza

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Checkout Time \(e\.g\. 21:00\)/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Review & Finalize Modal
  // ---------------------------------------------------------------------------
  it('opens Review Modal with breakdown and disclaimers before checkout commit', async () => {
    vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
    vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);

    render(
      <EventAttendanceWorkspace
        eventId="ev_checkout_101"
        eventTitle="Grand Royal Gala"
        eventStatus="confirmed"
      />
    );

    // Set default finish time
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i)).toBeInTheDocument();
    });
    const finishInput = screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i);
    fireEvent.change(finishInput, { target: { value: '17:00' } });

    // Open review modal
    const reviewBtn = screen.getByRole('button', { name: /Review & Finalize Checkout/i });
    fireEvent.click(reviewBtn);

    // Verify Modal contents
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Review & Finalize Event Checkout/i })).toBeInTheDocument();
      expect(screen.getByText(/Timestamp Provenance Disclaimer/i)).toBeInTheDocument();
      expect(screen.getByText(/Idempotency Key:/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm & Finalize Checkout/i })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Successful Checkout Finalization & Transition to Read-Only Finalized View
  // ---------------------------------------------------------------------------
  it('successfully commits checkout finalization and transitions to finalized read-only view', async () => {
    vi.mocked(attendanceApi.getSession)
      .mockResolvedValueOnce(mockSessionCheckInFinalized)
      .mockResolvedValueOnce(mockSessionCheckOutFinalized);

    vi.mocked(attendanceApi.getRoster)
      .mockResolvedValueOnce(mockRosterCheckInFinalized)
      .mockResolvedValueOnce(mockRosterCheckOutFinalized);

    vi.mocked(attendanceApi.finalizeCheckOut).mockResolvedValue({
      eventId: 'ev_checkout_101',
      totalProcessed: 3,
      normalCheckoutCount: 1,
      earlyDepartureCount: 1,
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
      />
    );

    // Enter default finish time
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i), {
      target: { value: '17:00' },
    });

    // Open review
    fireEvent.click(screen.getByRole('button', { name: /Review & Finalize Checkout/i }));

    // Confirm
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm & Finalize Checkout/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Finalize Checkout/i }));

    // Verify finalizeCheckOut was called
    await waitFor(() => {
      expect(attendanceApi.finalizeCheckOut).toHaveBeenCalledWith(
        'ev_checkout_101',
        expect.objectContaining({
          actualNormalFinishTime: '17:00',
        }),
        expect.stringMatching(/^chkout_/)
      );
    });

    // Verify transition to Finalized Attendance View
    await waitFor(() => {
      expect(screen.getByText(/Attendance & Checkout Finalized/i)).toBeInTheDocument();
      expect(screen.getByText(/Checkout & Shift Duration Metrics/i)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. 409 Conflict Handling (Section 12)
  // ---------------------------------------------------------------------------
  describe('Section 12: 409 Conflict Handling', () => {
    it('when 409 occurs and checkout is already finalized, automatically transitions to finalized view', async () => {
      let currentSession = mockSessionCheckInFinalized;
      let currentRoster = mockRosterCheckInFinalized;

      vi.mocked(attendanceApi.getSession).mockImplementation(async () => currentSession);
      vi.mocked(attendanceApi.getRoster).mockImplementation(async () => currentRoster);

      vi.mocked(attendanceApi.finalizeCheckOut).mockImplementation(async () => {
        currentSession = mockSessionCheckOutFinalized;
        currentRoster = mockRosterCheckOutFinalized;
        const err: any = new Error('Checkout has already been finalized for this event');
        err.response = {
          status: 409,
          data: { message: 'Checkout has already been finalized for this event' },
        };
        throw err;
      });

      render(
        <EventAttendanceWorkspace
          eventId="ev_checkout_101"
          eventTitle="Grand Royal Gala"
          eventStatus="confirmed"
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i), {
        target: { value: '17:00' },
      });

      const finalizeBtn = await screen.findByRole('button', { name: /Review & Finalize Checkout/i });
      await waitFor(() => expect(finalizeBtn).not.toBeDisabled());
      fireEvent.click(finalizeBtn);

      const confirmBtn = await screen.findByRole('button', { name: /Confirm & Finalize Checkout/i });
      fireEvent.click(confirmBtn);

      // Automatically transitions to finalized view
      await waitFor(() => {
        expect(screen.getByText(/Attendance & Checkout Finalized/i)).toBeInTheDocument();
      });
    });

    it('when 409 occurs due to true key collision / altered payload while pending, retains unsaved exceptions and shows error in modal', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSessionCheckInFinalized);
      vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterCheckInFinalized);

      vi.mocked(attendanceApi.finalizeCheckOut).mockRejectedValue({
        response: {
          status: 409,
          data: { message: 'Idempotency key collision: previous checkout finalized with different payload' },
        },
      });

      render(
        <EventAttendanceWorkspace
          eventId="ev_checkout_101"
          eventTitle="Grand Royal Gala"
          eventStatus="confirmed"
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i)).toBeInTheDocument();
      });
      const finishInput = screen.getByPlaceholderText(/e\.g\. 17:00 or 05:00 PM/i);
      fireEvent.change(finishInput, {
        target: { value: '17:00' },
      });

      const finalizeBtn = await screen.findByRole('button', { name: /Review & Finalize Checkout/i });
      await waitFor(() => expect(finalizeBtn).not.toBeDisabled());
      fireEvent.click(finalizeBtn);

      const confirmBtn = await screen.findByRole('button', { name: /Confirm & Finalize Checkout/i });
      fireEvent.click(confirmBtn);

      // Modal stays open and displays the collision error message
      await waitFor(() => {
        expect(screen.getByText(/Idempotency key collision/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Regenerate Key/i })).toBeInTheDocument();
      });

      // Inputs were NOT discarded
      expect(finishInput).toHaveValue('17:00');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Stage Tab Switcher & Cancelled Events
  // ---------------------------------------------------------------------------
  it('allows toggling to Check-in Baseline historical view during Checkout stage', async () => {
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
      expect(screen.getByRole('button', { name: /Check-in Baseline/i })).toBeInTheDocument();
    });

    // Click Check-in Baseline tab
    fireEvent.click(screen.getByRole('button', { name: /Check-in Baseline/i }));

    // Historical check-in baseline view is rendered
    await waitFor(() => {
      expect(screen.getByText(/Check-in Complete & Persisted/i)).toBeInTheDocument();
    });

    // Click back to Checkout Workspace
    fireEvent.click(screen.getByRole('button', { name: /Checkout Workspace/i }));

    await waitFor(() => {
      expect(screen.getByText(/Normal Work Finishing Time/i)).toBeInTheDocument();
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
  // 9. Timezone-Aware Overnight [+1 Day] Display Regression Tests (Asia/Kolkata)
  // ---------------------------------------------------------------------------
  describe('Timezone-Aware Overnight [+1 Day] Display (Asia/Kolkata)', () => {
    it('correctly resolves operational date strings and overnight status for Asia/Kolkata', () => {
      // Check-in: November 6, 2026, 8:00 PM IST = 14:30 UTC Nov 6
      const checkInUTC = '2026-11-06T14:30:00.000Z';
      // Checkout: November 7, 2026, 2:00 AM IST = 20:30 UTC Nov 6
      const checkOutUTC = '2026-11-06T20:30:00.000Z';

      // Both UTC dates are November 6
      expect(new Date(checkInUTC).getUTCDate()).toBe(6);
      expect(new Date(checkOutUTC).getUTCDate()).toBe(6);

      // Operational date strings in Asia/Kolkata
      expect(getOperationalDateString(checkInUTC, 'Asia/Kolkata')).toBe('2026-11-06');
      expect(getOperationalDateString(checkOutUTC, 'Asia/Kolkata')).toBe('2026-11-07');

      // Overnight checkout check
      expect(isOvernightCheckout(checkInUTC, checkOutUTC, 'Asia/Kolkata')).toBe(true);

      // Normal same-day shift
      // Check-in: Nov 6, 9:00 AM IST = 03:30 UTC Nov 6
      const sameDayCheckIn = '2026-11-06T03:30:00.000Z';
      // Checkout: Nov 6, 5:00 PM IST = 11:30 UTC Nov 6
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
          // Nov 6, 2026, 8:00 PM IST = 14:30 UTC Nov 6
          checkIn: '2026-11-06T14:30:00.000Z',
          // Nov 7, 2026, 2:00 AM IST = 20:30 UTC Nov 6 (Both UTC Nov 6!)
          checkOut: '2026-11-06T20:30:00.000Z',
          checkInSource: 'system_default' as const,
          checkOutSource: 'system_default' as const,
          applicableNormalFinishTimeSnapshot: '02:00 AM',
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

      // Verify worker is rendered
      expect(screen.getByText('Kareem Khan')).toBeInTheDocument();

      // Verify [+1 Day] indicator is visible
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
          // Nov 6, 2026, 9:00 AM IST = 03:30 UTC Nov 6
          checkIn: '2026-11-06T03:30:00.000Z',
          // Nov 6, 2026, 5:00 PM IST = 11:30 UTC Nov 6
          checkOut: '2026-11-06T11:30:00.000Z',
          checkInSource: 'system_default' as const,
          checkOutSource: 'system_default' as const,
          applicableNormalFinishTimeSnapshot: '05:00 PM',
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

      // Verify worker is rendered
      expect(screen.getByText('Sunil Verma')).toBeInTheDocument();

      // Verify [+1 Day] indicator is NOT present
      expect(screen.queryByText('+1 Day')).not.toBeInTheDocument();
    });
  });
});
