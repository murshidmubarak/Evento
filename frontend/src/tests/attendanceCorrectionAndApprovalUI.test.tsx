/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { EventAttendanceWorkspace } from '../components/manager/attendance/EventAttendanceWorkspace';
import { FinalizedAttendanceView } from '../components/manager/attendance/FinalizedAttendanceView';
import { CorrectionModal } from '../components/manager/attendance/CorrectionModal';
import { VerificationModal } from '../components/manager/attendance/VerificationModal';
import { attendanceApi } from '../features/attendance/attendanceApi';
import type { AttendanceRosterResponse, AttendanceSession, AttendanceRosterItem } from '../features/attendance/attendance.types';

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
      correctAttendance: vi.fn(),
      verifyAttendance: vi.fn(),
    },
  };
});

describe('Milestone 4 — Phase 4.5: Attendance Corrections & Final Manager Approval UI', { timeout: 15000 }, () => {
  const mockSession: AttendanceSession = {
    _id: 'sess_101',
    eventId: 'ev_101',
    lifecycleStatus: 'checkout_finalized',
    checkInFinalized: true,
    checkInFinalizedAt: '2026-11-06T09:30:00.000Z',
    checkOutFinalized: true,
    checkOutFinalizedAt: '2026-11-06T18:00:00.000Z',
    actualNormalFinishTime: '18:00',
    verificationStatus: 'pending_review',
  };

  const mockApprovedSession: AttendanceSession = {
    ...mockSession,
    verificationStatus: 'approved',
    verifiedBy: 'mgr_1',
    verifiedAt: '2026-11-06T19:00:00.000Z',
  };

  const mockRejectedSession: AttendanceSession = {
    ...mockSession,
    verificationStatus: 'rejected',
    verifiedBy: 'mgr_1',
    verifiedAt: '2026-11-06T19:00:00.000Z',
    rejectionReason: 'Worker overtime hours disputed by event client',
  };

  const mockWorkerNormal: AttendanceRosterItem = {
    workerId: 'w_1',
    workerName: 'Ahmed Raza',
    workerEmail: 'ahmed@eventops.local',
    workerPhone: '+91 9111111111',
    businessId: 'WRK-201',
    workerType: 'Catering Boy',
    requirementId: 'req_catering',
    reportingTime: '10:00',
    reportingTimeSnapshot: '10:00',
    attendanceId: 'att_1',
    status: 'checked_out',
    arrivalStatus: 'on_time',
    delayMinutes: 0,
    departureStatus: 'normal',
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    durationMinutes: 480,
    checkIn: '2026-11-06T10:00:00.000Z',
    checkInSource: 'system_default',
    checkOut: '2026-11-06T18:00:00.000Z',
    checkOutSource: 'system_default',
    verificationStatus: 'pending_review',
    corrections: [],
    isAssigned: true,
  };

  const mockWorkerAbsent: AttendanceRosterItem = {
    workerId: 'w_2',
    workerName: 'Farhan Ali',
    workerEmail: 'farhan@eventops.local',
    workerPhone: '+91 9222222222',
    businessId: 'WRK-202',
    workerType: 'Catering Boy',
    requirementId: 'req_catering',
    reportingTime: '10:00',
    reportingTimeSnapshot: '10:00',
    attendanceId: 'att_2',
    status: 'absent',
    arrivalStatus: 'absent',
    delayMinutes: 0,
    departureStatus: 'not_recorded',
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    durationMinutes: 0,
    checkIn: null,
    checkInSource: 'not_recorded',
    checkOut: null,
    checkOutSource: 'not_recorded',
    verificationStatus: 'pending_review',
    corrections: [],
    isAssigned: true,
  };

  const mockRosterResponse: AttendanceRosterResponse = {
    eventId: 'ev_101',
    eventTitle: 'Grand Royal Gala',
    eventDate: '2026-11-06T00:00:00.000Z',
    session: mockSession,
    latestReportingTime: '10:00',
    latestReportingTimestamp: '2026-11-06T10:00:00.000Z',
    canFinalizeCheckIn: false,
    totalAssigned: 2,
    requirements: [
      {
        requirementId: 'req_catering',
        workerType: 'Catering Boy',
        reportingTime: '10:00',
        assignedCount: 2,
      },
    ],
    roster: [mockWorkerNormal, mockWorkerAbsent],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Finalized Attendance View - Verification Banners & Controls', () => {
    it('displays Pending Review banner and action buttons in pending_review state', () => {
      render(
        <FinalizedAttendanceView
          session={mockSession}
          roster={mockRosterResponse.roster}
          onOpenCorrection={vi.fn()}
          onOpenVerification={vi.fn()}
        />
      );

      expect(screen.getByText(/Final Manager Review & Attendance Approval/i)).toBeInTheDocument();
      expect(screen.getByText('pending_review')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approve Attendance/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reject Attendance/i })).toBeInTheDocument();
    });

    it('displays Approved banner when attendance is approved', () => {
      render(
        <FinalizedAttendanceView
          session={mockApprovedSession}
          roster={mockRosterResponse.roster}
          onOpenCorrection={vi.fn()}
          onOpenVerification={vi.fn()}
        />
      );

      expect(screen.getByText(/Attendance Verified & Approved/i)).toBeInTheDocument();
      expect(screen.getByText('approved')).toBeInTheDocument();
      // Approve and Reject buttons should be hidden when already approved
      expect(screen.queryByRole('button', { name: /Approve Attendance/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reject Attendance/i })).not.toBeInTheDocument();
    });

    it('displays Rejected banner with reason when attendance is rejected', () => {
      render(
        <FinalizedAttendanceView
          session={mockRejectedSession}
          roster={mockRosterResponse.roster}
          onOpenCorrection={vi.fn()}
          onOpenVerification={vi.fn()}
        />
      );

      expect(screen.getByText(/Attendance Verification Rejected/i)).toBeInTheDocument();
      expect(screen.getByText(/Worker overtime hours disputed by event client/i)).toBeInTheDocument();
      expect(screen.getByText('rejected')).toBeInTheDocument();
    });

    it('renders "Correct" button on each worker row', () => {
      render(
        <FinalizedAttendanceView
          session={mockSession}
          roster={mockRosterResponse.roster}
          onOpenCorrection={vi.fn()}
          onOpenVerification={vi.fn()}
        />
      );

      const correctButtons = screen.getAllByRole('button', { name: /Correct/i });
      expect(correctButtons.length).toBe(2);
    });
  });

  describe('2. Verification Modal Workflow', () => {
    it('renders approval confirmation modal with operational summary', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <VerificationModal
          action="approve"
          roster={mockRosterResponse.roster}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText(/Final Attendance Approval/i)).toBeInTheDocument();
      expect(screen.getByText(/Attendance Records Breakdown/i)).toBeInTheDocument();

      const confirmButton = screen.getByRole('button', { name: /Confirm & Approve Attendance/i });
      expect(confirmButton).toBeEnabled();

      fireEvent.click(confirmButton);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          action: 'approve',
          rejectionReason: undefined,
        });
      });
    });

    it('enforces mandatory rejection reason with minimum 5 characters', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <VerificationModal
          action="reject"
          roster={mockRosterResponse.roster}
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText(/Reject Event Attendance/i)).toBeInTheDocument();
      const rejectButton = screen.getByRole('button', { name: /Confirm Rejection/i });
      expect(rejectButton).toBeDisabled();

      const textarea = screen.getByPlaceholderText(/State the exact reasons why this attendance is rejected/i);
      fireEvent.change(textarea, { target: { value: 'bad' } }); // 3 chars
      expect(rejectButton).toBeDisabled();

      fireEvent.change(textarea, { target: { value: 'Client dispute on catering staff count' } }); // > 5 chars
      expect(rejectButton).toBeEnabled();

      fireEvent.click(rejectButton);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          action: 'reject',
          rejectionReason: 'Client dispute on catering staff count',
        });
      });
    });
  });

  describe('3. Correction Modal - Non-Absent Worker Flow', () => {
    it('validates reason input and submits correction for departure time', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <CorrectionModal
          worker={mockWorkerNormal}
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText(/Correct Attendance Record/i)).toBeInTheDocument();
      expect(screen.getByText(/Ahmed Raza/i)).toBeInTheDocument();

      const saveButton = screen.getByRole('button', { name: /Confirm & Apply Correction/i });
      expect(saveButton).toBeDisabled();

      // Enter reason < 5 chars
      const reasonInput = screen.getByPlaceholderText(/Explain why this attendance record requires correction/i);
      fireEvent.change(reasonInput, { target: { value: 'test' } });
      expect(saveButton).toBeDisabled();

      // Enter valid reason
      fireEvent.change(reasonInput, { target: { value: 'Shift extended for late tear-down' } });

      // Ensure arrival time is 10:00
      const arrivalInput = screen.getByPlaceholderText(/e\.g\. 08:30 or 08:30 AM/i);
      fireEvent.change(arrivalInput, { target: { value: '10:00' } });

      // Change checkout time
      const checkoutInput = screen.getByPlaceholderText(/e\.g\. 17:30 or 05:30 PM/i);
      fireEvent.change(checkoutInput, { target: { value: '19:30' } });

      expect(saveButton).toBeEnabled();
      fireEvent.click(saveButton);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith('att_1', {
          reason: 'Shift extended for late tear-down',
          actualArrivalTime: '10:00',
          actualCheckoutTime: '19:30',
        });
      });
    });
  });

  describe('4. Correction Modal - Absence Reversal Flow', () => {
    it('supports reversing absence to On Time with default checkout', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <CorrectionModal
          worker={mockWorkerAbsent}
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText(/Absence Reversal & Attendance Correction/i)).toBeInTheDocument();
      expect(screen.getByText(/Farhan Ali/i)).toBeInTheDocument();

      // Enter valid reason
      const reasonInput = screen.getByPlaceholderText(/Explain why this attendance record requires correction/i);
      fireEvent.change(reasonInput, { target: { value: 'Worker arrived and was serving in kitchen' } });

      // Click "On Time" arrival button
      const onTimeRadio = screen.getByText(/On Time \(Default Present\)/i);
      fireEvent.click(onTimeRadio);

      // Verify that post-checkout choice defaults to "Applicable Default Finish"
      expect(screen.getByText(/Applicable Default Finish/i)).toBeInTheDocument();

      const saveButton = screen.getByRole('button', { name: /Confirm & Apply Correction/i });
      expect(saveButton).toBeEnabled();

      fireEvent.click(saveButton);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith('att_2', {
          reason: 'Worker arrived and was serving in kitchen',
          actualArrivalTime: '10:00',
          applyDefaultCheckout: true,
        });
      });
    });

    it('supports reversing absence to Late with custom arrival and checkout time', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(
        <CorrectionModal
          worker={mockWorkerAbsent}
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={onSubmit}
        />
      );

      // Enter valid reason
      const reasonInput = screen.getByPlaceholderText(/Explain why this attendance record requires correction/i);
      fireEvent.change(reasonInput, { target: { value: 'Confirmed delayed arrival due to public transit issue' } });

      // Click "Late Arrival"
      const lateRadio = screen.getByText(/Late Arrival/i);
      fireEvent.click(lateRadio);

      // Arrival input
      const arrivalInput = screen.getByPlaceholderText(/e\.g\. 08:30 or 08:30 AM/i);
      fireEvent.change(arrivalInput, { target: { value: '10:45' } });

      // Choose "Custom Actual Checkout"
      const customFinishRadio = screen.getByText(/Custom Actual Checkout/i);
      fireEvent.click(customFinishRadio);

      const checkoutInput = screen.getByPlaceholderText(/e\.g\. 19:30 or 07:30 PM/i);
      fireEvent.change(checkoutInput, { target: { value: '17:30' } });

      const saveButton = screen.getByRole('button', { name: /Confirm & Apply Correction/i });
      expect(saveButton).toBeEnabled();

      fireEvent.click(saveButton);
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith('att_2', {
          reason: 'Confirmed delayed arrival due to public transit issue',
          actualArrivalTime: '10:45',
          actualCheckoutTime: '17:30',
        });
      });
    });
  });

  describe('5. Workspace Full Integration Flow', () => {
    it('loads session and roster, opens verification modal and triggers approval API call', async () => {
      vi.mocked(attendanceApi.getSession).mockResolvedValue(mockSession);
      vi.mocked(attendanceApi.getRoster).mockResolvedValue(mockRosterResponse);
      vi.mocked(attendanceApi.verifyAttendance).mockResolvedValue({
        eventId: 'ev_101',
        verificationStatus: 'approved',
        verifiedBy: 'mgr_1',
        verifiedAt: '2026-11-06T19:00:00.000Z',
        totalRecords: 2,
      });

      render(
        <EventAttendanceWorkspace
          eventId="ev_101"
          eventStatus="confirmed"
          eventDate="2026-11-06T00:00:00.000Z"
          eventTitle="Grand Royal Gala"
        />
      );

      // Wait for workspace to load and display finalized view
      await waitFor(() => {
        expect(screen.getByText(/Attendance & Checkout Finalized/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Final Manager Review & Attendance Approval/i)).toBeInTheDocument();

      // Click "Approve Attendance"
      const approveBtn = screen.getByRole('button', { name: /Approve Attendance/i });
      fireEvent.click(approveBtn);

      // Verification modal opens
      expect(screen.getByText(/Final Attendance Approval/i)).toBeInTheDocument();

      // Click confirm
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Approve Attendance/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(attendanceApi.verifyAttendance).toHaveBeenCalledWith('ev_101', {
          action: 'approve',
          rejectionReason: undefined,
        });
      });
    });
  });
});
