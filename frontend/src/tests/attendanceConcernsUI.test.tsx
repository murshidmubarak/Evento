/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinalizedAttendanceView } from '../components/manager/attendance/FinalizedAttendanceView';
import { CorrectionModal } from '../components/manager/attendance/CorrectionModal';
import { WorkerAttendanceConcerns } from '../pages/worker/WorkerAttendanceConcerns';
import { ManagerAttendanceConcerns } from '../pages/manager/ManagerAttendanceConcerns';
import { attendanceApi } from '../features/attendance/attendanceApi';
import type {
  AttendanceRosterItem,
  AttendanceSession,
  WorkerAttendanceRecordWithConcern,
  AttendanceConcern,
} from '../features/attendance/attendance.types';

// Mock attendanceApi
vi.mock('../features/attendance/attendanceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/attendance/attendanceApi')>();
  return {
    ...actual,
    attendanceApi: {
      getWorkerAttendanceRecords: vi.fn(),
      submitConcern: vi.fn(),
      getConcerns: vi.fn(),
      getConcernById: vi.fn(),
      addConcernMessage: vi.fn(),
      resolveConcern: vi.fn(),
    },
  };
});

describe('Milestone 4 — Prompt 2: Worker Concerns, 24h Deadline & Permanent Status Locking UI', () => {
  const mockSession: AttendanceSession = {
    _id: 'sess_1',
    eventId: 'ev_1',
    lifecycleStatus: 'checkout_finalized',
    checkInFinalized: false,
    checkOutFinalized: true,
    actualNormalFinishTime: '18:00',
    verificationStatus: 'pending_review',
  };

  const mockWorkerNormal: AttendanceRosterItem = {
    workerId: 'w_1',
    workerName: 'Ahmed Cameraman',
    workerEmail: 'ahmed@eventops.local',
    workerPhone: '+91 9111111111',
    businessId: 'WRK-201',
    workerType: 'Cameraman / Photographer',
    requirementId: 'req_1',
    reportingTime: '08:00',
    reportingTimeSnapshot: '08:00',
    attendanceId: 'att_1',
    status: 'checked_out',
    arrivalStatus: 'on_time',
    delayMinutes: 0,
    departureStatus: 'normal',
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    durationMinutes: 600,
    checkIn: '2026-11-09T08:00:00.000Z',
    checkInSource: 'system_default',
    checkOut: '2026-11-09T18:00:00.000Z',
    checkOutSource: 'system_default',
    verificationStatus: 'pending_review',
    corrections: [],
    isAssigned: true,
    isStatusLocked: false,
  };

  const mockWorkerLocked: AttendanceRosterItem = {
    ...mockWorkerNormal,
    workerId: 'w_2',
    workerName: 'Farhan Helper',
    attendanceId: 'att_2',
    arrivalStatus: 'late',
    isStatusLocked: true,
    statusLockedReason: 'Accepted worker concern (Reporting delay excused)',
    statusLockedAt: '2026-11-09T14:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. FinalizedAttendanceView - Concern Blocker Banner & Verification Guard (§13)', () => {
    it('displays warning banner and disables Approve button when openConcernsCount > 0', () => {
      render(
        <MemoryRouter>
          <FinalizedAttendanceView
            session={mockSession}
            roster={[mockWorkerNormal]}
            openConcernsCount={2}
            onOpenCorrection={vi.fn()}
            onOpenVerification={vi.fn()}
          />
        </MemoryRouter>
      );

      expect(screen.getByText(/2 Open Attendance Concerns Require Resolution/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Review Concerns/i })).toHaveAttribute(
        'href',
        '/manager/concerns'
      );

      const approveButton = screen.getByRole('button', { name: /Approve Attendance/i });
      expect(approveButton).toBeDisabled();
      expect(approveButton).toHaveAttribute(
        'title',
        'Resolve all open attendance concerns before final verification'
      );
    });

    it('enables Approve button when openConcernsCount is 0', () => {
      render(
        <MemoryRouter>
          <FinalizedAttendanceView
            session={mockSession}
            roster={[mockWorkerNormal]}
            openConcernsCount={0}
            onOpenCorrection={vi.fn()}
            onOpenVerification={vi.fn()}
          />
        </MemoryRouter>
      );

      expect(screen.queryByText(/Open Attendance Concerns Require Resolution/i)).not.toBeInTheDocument();
      const approveButton = screen.getByRole('button', { name: /Approve Attendance/i });
      expect(approveButton).not.toBeDisabled();
    });
  });

  describe('2. CorrectionModal - Permanent Status Locking (§12)', () => {
    it('displays permanent lock banner and disables submission when record is locked', () => {
      render(
        <CorrectionModal
          worker={mockWorkerLocked}
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText(/Attendance Record Permanently Locked/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Accepted worker concern \(Reporting delay excused\)/i)
      ).toBeInTheDocument();

      const submitButton = screen.getByRole('button', { name: /Record Permanently Locked/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('3. Worker Attendance Concerns Page (§4 & §11)', () => {
    const mockWorkerRecord: WorkerAttendanceRecordWithConcern = {
      attendanceId: 'att_w1',
      eventId: 'ev_w1',
      eventTitle: 'Grand Royal Reception',
      eventType: 'Wedding',
      eventDate: '2026-11-09',
      eventStatus: 'completed',
      workerType: 'Cameraman / Photographer',
      reportingTime: '08:00',
      checkIn: '2026-11-09T08:45:00.000Z',
      arrivalStatus: 'late',
      departureStatus: 'normal',
      status: 'checked_out',
      delayMinutes: 45,
      isStatusLocked: false,
      hasOpenConcern: false,
      canRaiseConcern: true,
      eligibilityReason: 'Dispute window is active',
      isBeforeEventEnd: false,
      isAfterDeadline: false,
    };

    it('renders worker attendance records and allows opening dispute modal', async () => {
      vi.mocked(attendanceApi.getWorkerAttendanceRecords).mockResolvedValue([mockWorkerRecord]);

      render(
        <MemoryRouter>
          <WorkerAttendanceConcerns />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Grand Royal Reception/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Late \(45m delay\)/i)).toBeInTheDocument();
      const raiseButton = screen.getByRole('button', { name: /Raise Concern/i });
      expect(raiseButton).toBeInTheDocument();

      fireEvent.click(raiseButton);

      expect(screen.getByText(/Raise Attendance Concern/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Grand Royal Reception/i).length).toBeGreaterThan(0);
    });
  });

  describe('4. Manager Attendance Concerns Page (§6, §7 & §11)', () => {
    const mockConcern: AttendanceConcern = {
      _id: 'conc_101',
      attendanceId: {
        _id: 'att_101',
        reportingTimeSnapshot: '09:00',
        arrivalStatus: 'late',
        departureStatus: 'normal',
      } as any,
      eventId: {
        _id: 'ev_101',
        title: 'Sunset Beach Gala',
        date: '2026-11-09',
      } as any,
      managerId: 'mgr_101',
      workerId: {
        _id: 'w_101',
        name: 'Rashid Khan',
        workerType: 'Cameraman / Photographer',
        businessId: 'WRK-99',
      } as any,
      concernCategory: 'late_dispute',
      explanation: 'Gate security delay held cameraman team outside for 30 minutes',
      status: 'open',
      messages: [
        {
          senderId: 'w_101',
          senderRole: 'worker',
          message: 'Security scanner queue caused the delay at gate B',
          sentAt: '2026-11-09T10:00:00.000Z',
        },
      ],
      createdAt: '2026-11-09T09:30:00.000Z',
      updatedAt: '2026-11-09T10:00:00.000Z',
    };

    it('renders concern list, opens detail modal, and displays Accept / Reject resolution options', async () => {
      vi.mocked(attendanceApi.getConcerns).mockResolvedValue([mockConcern]);
      vi.mocked(attendanceApi.getConcernById).mockResolvedValue(mockConcern);

      render(
        <MemoryRouter>
          <ManagerAttendanceConcerns />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Rashid Khan/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Sunset Beach Gala/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Gate security delay held cameraman team outside/i)
      ).toBeInTheDocument();

      const reviewButton = screen.getByRole('button', { name: /Review & Resolve/i });
      fireEvent.click(reviewButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Accept Concern/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject Concern/i })).toBeInTheDocument();
      });
    });
  });
});
