/// <reference types="@testing-library/jest-dom" />
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import {
  AttendanceRosterTable,
  type WorkerExceptionState,
} from '../components/manager/attendance/AttendanceRosterTable';
import { CheckoutFinishingTimeCard } from '../components/manager/attendance/CheckoutFinishingTimeCard';
import { CorrectionModal } from '../components/manager/attendance/CorrectionModal';
import type {
  AttendanceRosterItem,
  AttendanceRosterRequirementItem,
} from '../features/attendance/attendance.types';

// Interactive wrapper for testing stateful exception interactions in AttendanceRosterTable
const StatefulAttendanceTable: React.FC<{
  roster: AttendanceRosterItem[];
  onSave?: (workerId: string, payload: any) => Promise<void>;
}> = ({ roster, onSave }) => {
  const [exceptions, setExceptions] = useState<Record<string, WorkerExceptionState>>({});

  return (
    <AttendanceRosterTable
      roster={roster}
      exceptions={exceptions}
      onExceptionChange={(workerId, exc) => setExceptions((prev) => ({ ...prev, [workerId]: exc }))}
      onSaveWorkerCheckIn={onSave}
    />
  );
};

describe('Milestone 4 — Category-wise Finishing Times, Immediate Check-in Persistence & Post-Finalization Corrections UI', () => {
  const mockRosterItem1: AttendanceRosterItem = {
    workerId: 'w_1',
    workerName: 'Ahmed Raza',
    workerEmail: 'ahmed@eventops.local',
    workerPhone: '+91 9111111111',
    businessId: 'WRK-101',
    workerType: 'Cameraman / Photographer',
    requirementId: 'req_1',
    reportingTime: '09:00',
    reportingTimeSnapshot: '09:00',
    attendanceId: null,
    status: 'not_started',
    arrivalStatus: 'unrecorded',
    checkIn: null,
    checkInSource: 'not_recorded',
    delayMinutes: 0,
    checkOut: null,
    checkOutSource: 'not_recorded',
    departureStatus: 'not_recorded',
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    durationMinutes: 0,
    verificationStatus: 'pending_review',
    isAssigned: true,
  };

  const mockRosterItem2: AttendanceRosterItem = {
    workerId: 'w_2',
    workerName: 'Bilal Khan',
    workerEmail: 'bilal@eventops.local',
    workerPhone: '+91 9222222222',
    businessId: 'WRK-102',
    workerType: 'Catering Boy',
    requirementId: 'req_2',
    reportingTime: '20:00',
    reportingTimeSnapshot: '20:00',
    attendanceId: 'att_2',
    status: 'checked_in',
    arrivalStatus: 'on_time',
    checkIn: '2026-11-06T20:00:00.000Z',
    checkInSource: 'system_default',
    delayMinutes: 0,
    checkOut: null,
    checkOutSource: 'not_recorded',
    departureStatus: 'not_recorded',
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
    durationMinutes: 0,
    verificationStatus: 'approved',
    isAssigned: true,
  };

  const mockRequirements: AttendanceRosterRequirementItem[] = [
    {
      requirementId: 'req_1',
      workerType: 'Cameraman / Photographer',
      assignedCount: 2,
      reportingTime: '09:00',
    },
    {
      requirementId: 'req_2',
      workerType: 'Catering Boy',
      assignedCount: 3,
      reportingTime: '20:00',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. AttendanceRosterTable - Immediate Individual Check-in Persistence
  // =========================================================================
  describe('1. AttendanceRosterTable - Immediate Individual Check-in Persistence', () => {
    it('renders worker with default On Time status and allows opening status modal', () => {
      render(<StatefulAttendanceTable roster={[mockRosterItem1]} />);

      expect(screen.getByText('Ahmed Raza')).toBeInTheDocument();
      expect(screen.getByText(/^Present$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Change Status/i })).toBeInTheDocument();

      // Open modal to view status options
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));
      expect(screen.getByRole('button', { name: /Mark Late/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Mark Absent/i })).toBeInTheDocument();
    });

    it('selecting Late enters draft mode, showing arrival input and action buttons without auto-saving', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);

      render(<StatefulAttendanceTable roster={[mockRosterItem1]} onSave={mockSave} />);

      // Open status modal
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));

      // Click Late button
      fireEvent.click(screen.getByRole('button', { name: /Mark Late/i }));

      // Confirm draft input and buttons appear
      expect(screen.getByPlaceholderText('HH:mm')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm and Save/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

      // Ensure API has NOT been called yet (draft state only)
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('cancelling draft discards arrival time input and returns to previous state', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);

      render(<StatefulAttendanceTable roster={[mockRosterItem1]} onSave={mockSave} />);

      // Open modal & Enter Late draft
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));
      fireEvent.click(screen.getByRole('button', { name: /Mark Late/i }));
      expect(screen.getByRole('button', { name: /Confirm and Save/i })).toBeInTheDocument();

      // Click Cancel
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      // Modal closed, draft time input gone
      expect(screen.queryByPlaceholderText('HH:mm')).not.toBeInTheDocument();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('entering arrival time and clicking "Confirm and Save" triggers immediate save API call', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);

      render(<StatefulAttendanceTable roster={[mockRosterItem1]} onSave={mockSave} />);

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));

      // Select Late
      fireEvent.click(screen.getByRole('button', { name: /Mark Late/i }));

      // Enter arrival time
      const timeInput = screen.getByPlaceholderText('HH:mm');
      fireEvent.change(timeInput, { target: { value: '09:45' } });

      // Click Confirm and Save
      const saveBtn = screen.getByRole('button', { name: /Confirm and Save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledTimes(1);
        expect(mockSave).toHaveBeenCalledWith('w_1', {
          arrivalStatus: 'late',
          actualArrivalTime: '09:45',
          status: 'checked_in',
        });
      });
    });

    it('selecting Absent and confirming triggers save API call with absent status', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);

      render(<StatefulAttendanceTable roster={[mockRosterItem1]} onSave={mockSave} />);

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));

      // Select Absent
      fireEvent.click(screen.getByRole('button', { name: /Mark Absent/i }));

      const saveBtn = screen.getByRole('button', { name: /Confirm and Save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith('w_1', {
          arrivalStatus: 'absent',
          actualArrivalTime: undefined,
          status: 'absent',
        });
      });
    });

    it('displays "Saved On-Time" badge when worker already has saved record in MongoDB', () => {
      render(<StatefulAttendanceTable roster={[mockRosterItem2]} />);

      expect(screen.getByText('Saved On-Time')).toBeInTheDocument();
    });

    it('renders "Change Status" and allows changing saved Late and Absent workers', () => {
      const lateWorker: AttendanceRosterItem = {
        ...mockRosterItem1,
        workerId: 'w_late',
        workerName: 'Late Worker',
        attendanceId: 'att_late',
        arrivalStatus: 'late',
        status: 'checked_in',
        delayMinutes: 30,
      };

      const { rerender } = render(
        <AttendanceRosterTable
          roster={[lateWorker]}
          exceptions={{ w_late: { type: 'late', actualArrivalTime: '09:30', delayMinutes: 30 } }}
          onExceptionChange={vi.fn()}
        />
      );

      // Late worker row has Change Status
      expect(screen.getByRole('button', { name: /Change Status/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));
      expect(screen.getByRole('button', { name: /Change to Present/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Mark Absent/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

      const absentWorker: AttendanceRosterItem = {
        ...mockRosterItem1,
        workerId: 'w_absent',
        workerName: 'Absent Worker',
        attendanceId: 'att_absent',
        arrivalStatus: 'absent',
        status: 'absent',
      };

      // Absent worker has Change Status
      rerender(
        <AttendanceRosterTable
          roster={[absentWorker]}
          exceptions={{ w_absent: { type: 'absent' } }}
          onExceptionChange={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /Change Status/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));
      expect(screen.getByRole('button', { name: /Change to Present/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Mark Late/i })).toBeInTheDocument();
    });

    it('clicking "Change to Present" on saved worker opens confirmation dialog and calls onCorrectAttendance', async () => {
      const mockCorrect = vi.fn().mockResolvedValue(undefined);
      const lateWorker: AttendanceRosterItem = {
        ...mockRosterItem1,
        workerId: 'w_late_2',
        workerName: 'Tariq Cameraman',
        attendanceId: 'att_late_2',
        arrivalStatus: 'late',
        status: 'checked_in',
        delayMinutes: 20,
        reportingTime: '09:00',
      };

      render(
        <AttendanceRosterTable
          roster={[lateWorker]}
          exceptions={{ w_late_2: { type: 'late', actualArrivalTime: '09:20', delayMinutes: 20 } }}
          onExceptionChange={vi.fn()}
          onCorrectAttendance={mockCorrect}
        />
      );

      // Open status modal
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));

      // Confirm modal opens with worker details and scheduled reporting time
      expect(screen.getByText('Update Attendance Status')).toBeInTheDocument();
      expect(screen.getAllByText('Tariq Cameraman').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('09:00').length).toBeGreaterThanOrEqual(1);

      // Select Change to Present
      fireEvent.click(screen.getByRole('button', { name: /Change to Present/i }));

      // Click "Confirm Present"
      const confirmBtn = screen.getByRole('button', { name: /Confirm Present/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockCorrect).toHaveBeenCalledWith('att_late_2', {
          arrivalStatus: 'on_time',
          status: 'checked_in',
          applyDefaultCheckout: true,
          reason: 'Reporting time confirmed on time / exception cleared',
        });
      });
    });

    it('editing an existing saved record via "Confirm and Save" calls onCorrectAttendance instead of onSaveWorkerCheckIn', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockCorrect = vi.fn().mockResolvedValue(undefined);

      const savedLateWorker: AttendanceRosterItem = {
        ...mockRosterItem1,
        workerId: 'w_saved_1',
        attendanceId: 'att_saved_1',
        arrivalStatus: 'late',
        status: 'checked_in',
        delayMinutes: 15,
        reportingTime: '09:00',
      };

      render(
        <AttendanceRosterTable
          roster={[savedLateWorker]}
          exceptions={{ w_saved_1: { type: 'late', actualArrivalTime: '09:25', delayMinutes: 25 } }}
          onExceptionChange={vi.fn()}
          onSaveWorkerCheckIn={mockSave}
          onCorrectAttendance={mockCorrect}
        />
      );

      // Open status modal
      fireEvent.click(screen.getByRole('button', { name: /Change Status/i }));

      // Enter updated arrival time
      const timeInput = screen.getByPlaceholderText('HH:mm');
      fireEvent.change(timeInput, { target: { value: '09:25' } });

      const confirmAndSaveBtn = screen.getByRole('button', { name: /Confirm and Save/i });
      fireEvent.click(confirmAndSaveBtn);

      await waitFor(() => {
        expect(mockCorrect).toHaveBeenCalledTimes(1);
        expect(mockCorrect).toHaveBeenCalledWith('att_saved_1', expect.objectContaining({
          arrivalStatus: 'late',
          actualArrivalTime: '09:25',
          status: 'checked_in',
          applyDefaultCheckout: true,
        }));
        expect(mockSave).not.toHaveBeenCalled();
      });
    });

    it('locked worker displays Locked badge and does not render editable actions', () => {
      const lockedWorker: AttendanceRosterItem = {
        ...mockRosterItem1,
        workerId: 'w_locked',
        attendanceId: 'att_locked',
        isStatusLocked: true,
      };

      render(
        <AttendanceRosterTable
          roster={[lockedWorker]}
          exceptions={{}}
          onExceptionChange={vi.fn()}
        />
      );

      expect(screen.getByText('Locked')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Mark Late/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Mark Absent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change to Present/i })).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. CheckoutFinishingTimeCard - Category-Wise Finishing Times
  // =========================================================================
  describe('2. CheckoutFinishingTimeCard - Category-Wise Normal Finishing Times', () => {
    it('groups distinct categories with assigned staff and renders category finish time inputs', () => {
      render(
        <CheckoutFinishingTimeCard
          defaultFinishTime="17:00"
          onDefaultFinishTimeChange={vi.fn()}
          categoryFinishTimes={{}}
          onCategoryFinishTimesChange={vi.fn()}
          overrides={{}}
          onOverridesChange={vi.fn()}
          requirements={mockRequirements}
        />
      );

      // Section header with category count
      expect(screen.getByText(/Category-Wise Normal Finishing Times \(2\)/i)).toBeInTheDocument();

      // Category names exist in card
      const camItems = screen.getAllByText('Cameraman / Photographer');
      expect(camItems.length).toBeGreaterThanOrEqual(1);

      const catItems = screen.getAllByText('Catering Boy');
      expect(catItems.length).toBeGreaterThanOrEqual(1);

      // Staff counts
      expect(screen.getByText('2 staff')).toBeInTheDocument();
      expect(screen.getByText('3 staff')).toBeInTheDocument();
    });

    it('typing into category finish time input triggers onCategoryFinishTimesChange', () => {
      const mockCategoryChange = vi.fn();

      render(
        <CheckoutFinishingTimeCard
          defaultFinishTime="17:00"
          onDefaultFinishTimeChange={vi.fn()}
          categoryFinishTimes={{ 'Cameraman / Photographer': '17:00' }}
          onCategoryFinishTimesChange={mockCategoryChange}
          overrides={{}}
          onOverridesChange={vi.fn()}
          requirements={mockRequirements}
        />
      );

      const inputs = screen.getAllByPlaceholderText(/Category finish/i);
      expect(inputs.length).toBe(2);

      // Type 02:00 for Catering Boy (second input)
      fireEvent.change(inputs[1], { target: { value: '02:00' } });

      expect(mockCategoryChange).toHaveBeenCalledWith({
        'Cameraman / Photographer': '17:00',
        'Catering Boy': '02:00',
      });
    });

    it('"Apply default to all categories" updates all categories simultaneously', () => {
      const mockCategoryChange = vi.fn();

      render(
        <CheckoutFinishingTimeCard
          defaultFinishTime="23:00"
          onDefaultFinishTimeChange={vi.fn()}
          categoryFinishTimes={{}}
          onCategoryFinishTimesChange={mockCategoryChange}
          overrides={{}}
          onOverridesChange={vi.fn()}
          requirements={mockRequirements}
        />
      );

      const applyAllBtn = screen.getByRole('button', { name: /Apply "23:00" to all categories/i });
      fireEvent.click(applyAllBtn);

      expect(mockCategoryChange).toHaveBeenCalledWith({
        'Cameraman / Photographer': '23:00',
        'Catering Boy': '23:00',
      });
    });
  });

  // =========================================================================
  // 3. CorrectionModal - Absence Transitions & Approval Invalidation
  // =========================================================================
  describe('3. CorrectionModal - Post-Finalization Absence Transitions & Approval Invalidation', () => {
    it('displays Approval Invalidation warning notice informing that verification resets to Pending Review', () => {
      render(
        <CorrectionModal
          worker={mockRosterItem2} // verificationStatus: 'approved'
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText(/Approval Invalidation:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Pending Review/i).length).toBeGreaterThanOrEqual(1);
    });

    it('selecting "Mark as Absent" shows absent warning notice and submits arrivalStatus absent', async () => {
      const mockSubmit = vi.fn().mockResolvedValue(undefined);

      render(
        <CorrectionModal
          worker={mockRosterItem2}
          isCheckoutFinalized={true}
          defaultFinishTime="18:00"
          onClose={vi.fn()}
          onSubmit={mockSubmit}
        />
      );

      // Select "Mark as Absent" button
      const absentBtn = screen.getByRole('button', { name: /Mark as Absent/i });
      fireEvent.click(absentBtn);

      // Warning notice should appear
      expect(
        screen.getByText(/timestamps will be cleared/i)
      ).toBeInTheDocument();

      // Enter reason
      const reasonInput = screen.getByPlaceholderText(/Explain why this attendance record requires correction/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Worker departed premises prior to start of duties; confirmed via venue security.' },
      });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /Confirm & Apply Correction/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledTimes(1);
        expect(mockSubmit).toHaveBeenCalledWith('att_2', {
          arrivalStatus: 'absent',
          status: 'absent',
          reason: 'Worker departed premises prior to start of duties; confirmed via venue security.',
        });
      });
    });
  });
});
