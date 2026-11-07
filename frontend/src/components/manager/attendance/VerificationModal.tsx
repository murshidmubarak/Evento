import React, { useState } from 'react';
import type { AttendanceRosterItem, VerifyAttendancePayload } from '../../../features/attendance/attendance.types';
import { formatDurationMinutes } from '../../../features/attendance/attendanceApi';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface VerificationModalProps {
  action: 'approve' | 'reject';
  roster: AttendanceRosterItem[];
  onClose: () => void;
  onSubmit: (payload: VerifyAttendancePayload) => Promise<void>;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  action,
  roster,
  onClose,
  onSubmit,
}) => {
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute breakdown
  let onTime = 0;
  let late = 0;
  let absent = 0;
  let earlyDeparture = 0;
  let overtime = 0;
  let totalDurationMinutes = 0;

  roster.forEach((r) => {
    const arr = r.arrivalStatus?.toLowerCase();
    if (arr === 'on_time' || r.status === 'present') onTime++;
    else if (arr === 'late' || r.status === 'late') late++;
    else if (arr === 'absent' || r.status === 'absent') absent++;
    else onTime++;

    const dep = r.departureStatus?.toLowerCase();
    if (dep === 'early_departure') earlyDeparture++;
    else if (dep === 'overtime') overtime++;

    totalDurationMinutes += r.durationMinutes || 0;
  });

  const isReasonValid = action === 'approve' || rejectionReason.trim().length >= 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onSubmit({
        action,
        rejectionReason: action === 'reject' ? rejectionReason.trim() : undefined,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || `Failed to ${action} attendance`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div
          className={`px-6 py-4 flex items-center justify-between border-b ${
            action === 'approve'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/80 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs ${
                action === 'approve' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              {action === 'approve' ? <ShieldCheck size={20} /> : <XCircle size={20} />}
            </div>
            <div>
              <h3 id="verification-modal-title" className="text-sm font-bold">
                {action === 'approve' ? 'Final Attendance Approval' : 'Reject Event Attendance'}
              </h3>
              <p className="text-xs opacity-80">
                {action === 'approve'
                  ? 'Verify and sign off complete attendance records for this event'
                  : 'Reject attendance records and provide mandatory correction guidance'}
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
          {action === 'approve' ? (
            <>
              {/* Operational Summary Grid */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Attendance Records Breakdown ({roster.length} Total Workers)
                </span>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">On Time</span>
                    <span className="text-base font-extrabold text-emerald-700">{onTime}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Late</span>
                    <span className="text-base font-extrabold text-amber-700">{late}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Absent</span>
                    <span className="text-base font-extrabold text-rose-700">{absent}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Departures</span>
                    <span className="text-xs font-bold text-gray-900 block mt-0.5">
                      {earlyDeparture} Early · {overtime} Overtime
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-gray-100">
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">Total Duration</span>
                    <span className="text-xs font-bold text-gray-900 block mt-0.5 font-mono">
                      {formatDurationMinutes(totalDurationMinutes)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approval Disclaimer */}
              <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Manager Verification Attestation</span>
                  <p className="text-emerald-800 text-[11px] leading-relaxed">
                    By approving, you confirm that you have reviewed the recorded shift check-in and checkout timestamps, verified any exceptions, and approve this attendance ledger as accurate.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Rejection Guidance Notice */}
              <div className="bg-rose-50 rounded-xl p-3.5 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Rejection Audit Policy</span>
                  <p className="text-rose-800 text-[11px] leading-relaxed">
                    Rejecting does not delete any attendance timestamps. It marks the event attendance as <strong>Rejected</strong> with your reason on the permanent audit record so necessary corrections can be made prior to re-review.
                  </p>
                </div>
              </div>

              {/* Mandatory Rejection Reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                  <span>Mandatory Rejection Reason *</span>
                  <span className={`text-[11px] ${isReasonValid ? 'text-gray-400' : 'text-rose-600 font-medium'}`}>
                    {rejectionReason.trim().length}/5 chars min
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State the exact reasons why this attendance is rejected and what corrections must be made..."
                  className={`w-full text-xs px-3.5 py-2.5 rounded-xl border transition-colors focus:outline-none focus:ring-2 ${
                    rejectionReason.trim().length === 0 || isReasonValid
                      ? 'border-gray-300 focus:border-rose-500 focus:ring-rose-200'
                      : 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                  }`}
                />
              </div>
            </>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800">
              <span className="font-bold block">Verification Error</span>
              {errorMessage}
            </div>
          )}

          {/* Actions */}
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
              disabled={!isReasonValid || isSubmitting}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                action === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? (
                <>Processing...</>
              ) : action === 'approve' ? (
                <>
                  <ShieldCheck size={15} />
                  Confirm & Approve Attendance
                </>
              ) : (
                <>
                  <XCircle size={15} />
                  Confirm Rejection
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

