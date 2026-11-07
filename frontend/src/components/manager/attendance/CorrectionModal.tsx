import React, { useState, useMemo } from 'react';
import type { AttendanceRosterItem, CorrectAttendancePayload } from '../../../features/attendance/attendance.types';
import {
  parseTimeToMinutes,
  calculateEarlyDepartureMinutes,
  calculateOvertimeMinutes,
  formatDurationMinutes,
} from '../../../features/attendance/attendanceApi';
import {
  X,
  AlertTriangle,
  Clock,
  UserCheck,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

interface CorrectionModalProps {
  worker: AttendanceRosterItem;
  isCheckoutFinalized: boolean;
  defaultFinishTime?: string;
  onClose: () => void;
  onSubmit: (attendanceId: string, payload: CorrectAttendancePayload) => Promise<void>;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  worker,
  isCheckoutFinalized,
  defaultFinishTime,
  onClose,
  onSubmit,
}) => {
  const isAbsent = worker.status === 'absent' || worker.arrivalStatus === 'absent';
  const [markAsAbsent, setMarkAsAbsent] = useState(false);

  // State for absence reversal
  const [absenceReversalType, setAbsenceReversalType] = useState<'on_time' | 'late'>('on_time');
  const [actualArrivalTime, setActualArrivalTime] = useState(
    isAbsent ? worker.reportingTime : worker.checkIn ? new Date(worker.checkIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : worker.reportingTime
  );

  // State for checkout when checkout is finalized
  const applicableFinish = worker.applicableNormalFinishTimeSnapshot || defaultFinishTime || '17:00';
  const [checkoutOption, setCheckoutOption] = useState<'default' | 'actual'>('default');
  const [actualCheckoutTime, setActualCheckoutTime] = useState(
    worker.checkOut
      ? new Date(worker.checkOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
      : applicableFinish
  );

  // Mandatory reason
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live validation of arrival time
  const arrivalValidation = useMemo(() => {
    if (markAsAbsent) return { isValid: true, delayMinutes: 0, previewText: '' };
    if (!actualArrivalTime.trim()) {
      return { isValid: false, delayMinutes: 0, previewText: 'Please enter arrival time' };
    }
    const arrMins = parseTimeToMinutes(actualArrivalTime);
    const repMins = parseTimeToMinutes(worker.reportingTime);
    if (arrMins === null || repMins === null) {
      return { isValid: false, delayMinutes: 0, previewText: 'Invalid time format (e.g. 08:30 or 08:30 AM)' };
    }

    let diff = arrMins - repMins;
    if (diff < 0 && repMins >= 12 * 60 && arrMins < 12 * 60) {
      diff += 24 * 60; // Overnight
    }

    if (diff <= 0) {
      return { isValid: true, delayMinutes: 0, previewText: 'On Time (0 min delay)' };
    } else {
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      const previewText = hours > 0 ? `+${hours} hr ${mins} min late` : `+${mins} min late`;
      return { isValid: true, delayMinutes: diff, previewText };
    }
  }, [markAsAbsent, actualArrivalTime, worker.reportingTime]);

  // Live validation of checkout time (if entered)
  const checkoutValidation = useMemo(() => {
    if (markAsAbsent) return { isValid: true };
    if (!isCheckoutFinalized) return { isValid: true };
    if (checkoutOption === 'default') return { isValid: true };
    if (!actualCheckoutTime.trim()) {
      return { isValid: false, previewText: 'Please enter checkout time' };
    }
    const outMins = parseTimeToMinutes(actualCheckoutTime);
    if (outMins === null) {
      return { isValid: false, previewText: 'Invalid time format (e.g. 19:30 or 07:30 PM)' };
    }

    const earlyInfo = calculateEarlyDepartureMinutes(applicableFinish, actualCheckoutTime, actualArrivalTime);
    const overtimeInfo = calculateOvertimeMinutes(applicableFinish, actualCheckoutTime, actualArrivalTime);

    if (earlyInfo.earlyMinutes > 0) {
      return { isValid: true, departureStatus: 'early_departure', earlyDepartureMinutes: earlyInfo.earlyMinutes, previewText: earlyInfo.previewText };
    } else if (overtimeInfo.overtimeMinutes > 0) {
      return { isValid: true, departureStatus: 'overtime', overtimeMinutes: overtimeInfo.overtimeMinutes, previewText: overtimeInfo.previewText };
    } else {
      return { isValid: true, departureStatus: 'normal', previewText: 'Normal finish' };
    }
  }, [markAsAbsent, isCheckoutFinalized, checkoutOption, actualCheckoutTime, applicableFinish, actualArrivalTime]);

  // Live duration preview
  const durationPreview = useMemo(() => {
    if (markAsAbsent) return 0;
    if (!isCheckoutFinalized) return null;
    const inMins = parseTimeToMinutes(actualArrivalTime);
    const outMins = checkoutOption === 'default'
      ? parseTimeToMinutes(applicableFinish)
      : parseTimeToMinutes(actualCheckoutTime);

    if (inMins === null || outMins === null) return null;
    let diff = outMins - inMins;
    if (diff < 0 && inMins >= 12 * 60 && outMins < 12 * 60) {
      diff += 24 * 60; // Overnight
    }
    return Math.max(0, diff);
  }, [markAsAbsent, isCheckoutFinalized, actualArrivalTime, checkoutOption, applicableFinish, actualCheckoutTime]);

  // Form validity
  const isReasonValid = reason.trim().length >= 5;
  const isFormValid = isReasonValid && (markAsAbsent || (arrivalValidation.isValid && checkoutValidation.isValid));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !worker.attendanceId) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload: CorrectAttendancePayload = {
      reason: reason.trim(),
    };

    if (markAsAbsent) {
      payload.status = 'absent';
      payload.arrivalStatus = 'absent';
    } else if (isAbsent) {
      payload.actualArrivalTime = actualArrivalTime.trim();
      if (isCheckoutFinalized) {
        if (checkoutOption === 'default') {
          payload.applyDefaultCheckout = true;
        } else {
          payload.actualCheckoutTime = actualCheckoutTime.trim();
        }
      }
    } else {
      // Non-absent worker corrections
      payload.actualArrivalTime = actualArrivalTime.trim();
      if (isCheckoutFinalized) {
        payload.actualCheckoutTime = actualCheckoutTime.trim();
      }
    }

    if (!worker.attendanceId) {
      setErrorMessage('Cannot correct record: Worker attendance record ID is missing');
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(worker.attendanceId, payload);
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Failed to apply attendance correction'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <RotateCcw size={18} />
            </div>
            <div>
              <h3 id="correction-modal-title" className="text-sm font-bold text-gray-900">
                {isAbsent ? 'Absence Reversal & Attendance Correction' : 'Correct Attendance Record'}
              </h3>
              <p className="text-xs text-gray-500">
                {worker.workerName} ({worker.workerType}) · Rep: {worker.reportingTime}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Approval Invalidation Notice if previously verified */}
          {worker.verificationStatus && worker.verificationStatus !== 'pending_review' && (
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>Approval Invalidation:</strong> Applying this correction will invalidate the event's{' '}
                <span className="capitalize font-bold">{worker.verificationStatus}</span> status and reset it to{' '}
                <strong>Pending Review</strong>.
              </p>
            </div>
          )}

          {/* Current State Info Card */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/80 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-gray-400 block text-[11px] uppercase font-bold">Current Status</span>
              <span className="font-bold text-gray-900 capitalize">
                {worker.status.replace('_', ' ')} ({worker.arrivalStatus.replace('_', ' ')})
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px] uppercase font-bold">Check-in</span>
              <span className="font-semibold text-gray-800">
                {worker.checkIn ? new Date(worker.checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px] uppercase font-bold">Checkout</span>
              <span className="font-semibold text-gray-800">
                {worker.checkOut ? new Date(worker.checkOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—'}
              </span>
            </div>
          </div>

          {/* Target Status Choice for Non-Absent workers */}
          {!isAbsent && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                Target Attendance Status:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMarkAsAbsent(false);
                    setActualArrivalTime(worker.reportingTime);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                    !markAsAbsent && arrivalValidation.delayMinutes === 0
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold shadow-2xs'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700 text-xs'
                  }`}
                >
                  <span className="text-xs">On Time</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkAsAbsent(false);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                    !markAsAbsent && arrivalValidation.delayMinutes > 0
                      ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold shadow-2xs'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700 text-xs'
                  }`}
                >
                  <span className="text-xs">Late</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkAsAbsent(true);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                    markAsAbsent
                      ? 'border-rose-500 bg-rose-50 text-rose-900 font-bold shadow-2xs'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700 text-xs'
                  }`}
                >
                  <span className="text-xs">Mark as Absent</span>
                </button>
              </div>
            </div>
          )}

          {/* Absent notice when marking worker as absent */}
          {markAsAbsent && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900">
              <p className="font-semibold">Worker will be marked Absent.</p>
              <p className="text-[11px] text-rose-700 mt-0.5">
                Recorded check-in and checkout timestamps will be cleared, and duration will be set to 0.
              </p>
            </div>
          )}

          {/* Absence Reversal Mode Selection */}
          {isAbsent && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                Reverse Absence Status to:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAbsenceReversalType('on_time');
                    setActualArrivalTime(worker.reportingTime);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    absenceReversalType === 'on_time'
                      ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 font-bold shadow-2xs'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck size={14} className="text-emerald-700" />
                    <span className="text-xs">On Time (Default Present)</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-normal mt-1">
                    Arrived at or before {worker.reportingTime}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAbsenceReversalType('late');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    absenceReversalType === 'late'
                      ? 'border-amber-500 bg-amber-50/80 text-amber-950 font-bold shadow-2xs'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-700" />
                    <span className="text-xs">Late Arrival</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-normal mt-1">
                    Arrived after {worker.reportingTime}
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Actual Arrival Time Input */}
          {!markAsAbsent && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Actual Arrival Time</span>
                <span className="text-[11px] text-gray-400 font-normal">Reporting: {worker.reportingTime}</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={actualArrivalTime}
                  onChange={(e) => setActualArrivalTime(e.target.value)}
                  placeholder="e.g. 08:30 or 08:30 AM"
                  className={`w-full text-xs px-3.5 py-2.5 rounded-xl border font-mono transition-colors focus:outline-none focus:ring-2 ${
                    arrivalValidation.isValid
                      ? 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-200'
                      : 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/30'
                  }`}
                />
              </div>
              {arrivalValidation.previewText && (
                <p
                  className={`text-[11px] font-semibold ${
                    arrivalValidation.isValid
                      ? arrivalValidation.delayMinutes > 0
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                      : 'text-rose-600'
                  }`}
                >
                  {arrivalValidation.previewText}
                </p>
              )}
            </div>
          )}

          {/* Checkout Handling (when checkout is finalized) */}
          {!markAsAbsent && isCheckoutFinalized && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <label className="text-xs font-bold text-gray-700 block">
                Checkout Finalization Handling:
              </label>

              {isAbsent ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCheckoutOption('default')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        checkoutOption === 'default'
                          ? 'border-blue-500 bg-blue-50/80 text-blue-950 font-bold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="text-xs block">Applicable Default Finish</span>
                      <span className="text-[11px] text-blue-700 font-mono font-normal mt-0.5 block">
                        {applicableFinish} (system default)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCheckoutOption('actual')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        checkoutOption === 'actual'
                          ? 'border-blue-500 bg-blue-50/80 text-blue-950 font-bold shadow-2xs'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="text-xs block">Custom Actual Checkout</span>
                      <span className="text-[11px] text-gray-500 font-normal mt-0.5 block">
                        Manager-specified departure
                      </span>
                    </button>
                  </div>

                  {checkoutOption === 'actual' && (
                    <div className="space-y-1.5 animate-in fade-in duration-150">
                      <label className="text-xs font-bold text-gray-700 block">
                        Actual Checkout Time
                      </label>
                      <input
                        type="text"
                        value={actualCheckoutTime}
                        onChange={(e) => setActualCheckoutTime(e.target.value)}
                        placeholder="e.g. 19:30 or 07:30 PM"
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                      />
                      {checkoutValidation.previewText && (
                        <p className="text-[11px] text-blue-700 font-semibold">
                          {checkoutValidation.previewText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                    <span>Actual Checkout Time</span>
                    <span className="text-[11px] text-gray-400 font-normal">Applicable Finish: {applicableFinish}</span>
                  </label>
                  <input
                    type="text"
                    value={actualCheckoutTime}
                    onChange={(e) => setActualCheckoutTime(e.target.value)}
                    placeholder="e.g. 17:30 or 05:30 PM"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                  />
                  {checkoutValidation.previewText && (
                    <p className="text-[11px] text-blue-700 font-semibold">
                      {checkoutValidation.previewText}
                    </p>
                  )}
                </div>
              )}

              {/* Working Duration Preview */}
              {durationPreview !== null && (
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200/80 flex items-center justify-between text-xs">
                  <span className="text-emerald-900 font-medium">Calculated Working Duration:</span>
                  <span className="font-extrabold text-emerald-950 font-mono">
                    {formatDurationMinutes(durationPreview)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mandatory Reason */}
          <div className="space-y-1.5 pt-2 border-t border-gray-100">
            <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
              <span>Mandatory Correction Reason *</span>
              <span className={`text-[11px] ${isReasonValid ? 'text-gray-400' : 'text-amber-600 font-medium'}`}>
                {reason.trim().length}/5 chars min
              </span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this attendance record requires correction (e.g. Worker was present at catering station but marked absent by mistake)..."
              className={`w-full text-xs px-3.5 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 ${
                reason.trim().length === 0 || isReasonValid
                  ? 'border-gray-300 focus:border-emerald-500 focus:ring-emerald-200'
                  : 'border-amber-300 focus:border-amber-500 focus:ring-amber-200 bg-amber-50/20'
              }`}
            />
          </div>

          {/* Re-review Invalidation Warning Notice */}
          <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold">Approval Re-Review Policy:</span>
              <p className="text-amber-800 leading-relaxed text-[11px]">
                Submitting this correction permanently saves an immutable audit log entry. If attendance was previously approved, this correction automatically returns the event verification status to <strong>Pending Review</strong> and will require manager re-approval.
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800">
              <span className="font-bold block">Correction Error</span>
              {errorMessage}
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>Applying Correction...</>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Confirm & Apply Correction
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

