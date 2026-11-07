import React, { useState } from 'react';
import type { AttendanceRosterItem } from '../../../features/attendance/attendance.types';
import type { WorkerExceptionState } from './AttendanceRosterTable';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserX,
  UserCheck,
  Loader2,
  X,
  ShieldAlert,
  RotateCw,
} from 'lucide-react';

interface ReviewCheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (idempotencyKey: string) => Promise<void>;
  roster: AttendanceRosterItem[];
  exceptions: Record<string, WorkerExceptionState>;
  idempotencyKey: string;
  onRegenerateKey?: () => void;
}

export const ReviewCheckinModal: React.FC<ReviewCheckinModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  roster,
  exceptions,
  idempotencyKey,
  onRegenerateKey,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRetryPending, setIsRetryPending] = useState(false);

  if (!isOpen) return null;

  // Compute breakdown
  const lateList: Array<{
    worker: AttendanceRosterItem;
    actualTime: string;
    delayMinutes?: number;
  }> = [];

  const absentList: AttendanceRosterItem[] = [];
  const presentList: AttendanceRosterItem[] = [];

  roster.forEach((worker) => {
    const exc = exceptions[worker.workerId] || { type: 'present' };
    if (exc.type === 'late') {
      lateList.push({
        worker,
        actualTime: exc.actualArrivalTime || '',
        delayMinutes: exc.delayMinutes,
      });
    } else if (exc.type === 'absent') {
      absentList.push(worker);
    } else {
      presentList.push(worker);
    }
  });

  const totalAssigned = roster.length;
  const onTimeCount = presentList.length;
  const lateCount = lateList.length;
  const absentCount = absentList.length;

  const handleFinalize = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onConfirm(idempotencyKey);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to finalize check-in. Network or server error.';
      setErrorMessage(msg);
      setIsRetryPending(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-checkin-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200/90 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 id="review-checkin-modal-title" className="text-lg font-extrabold text-gray-900 tracking-tight">
                Review & Finalize Check-in
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Verify exceptions before committing permanent attendance records.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Metrics Overview */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="text-xs font-semibold text-gray-500">Total Roster</div>
              <div className="text-xl font-extrabold text-gray-900 mt-0.5">{totalAssigned}</div>
            </div>
            <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-700">Default Present</div>
              <div className="text-xl font-extrabold text-emerald-800 mt-0.5">{onTimeCount}</div>
            </div>
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200">
              <div className="text-xs font-semibold text-amber-700">Late</div>
              <div className="text-xl font-extrabold text-amber-800 mt-0.5">{lateCount}</div>
            </div>
            <div className="p-3 bg-rose-50/80 rounded-xl border border-rose-200">
              <div className="text-xs font-semibold text-rose-700">Absent</div>
              <div className="text-xl font-extrabold text-rose-800 mt-0.5">{absentCount}</div>
            </div>
          </div>

          {/* Mandatory Audit Disclaimer Box */}
          <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-950 text-xs space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>Mandatory Attendance Notice</span>
            </div>
            <p className="leading-relaxed">
              The remaining <strong>{onTimeCount}</strong> worker(s) will be recorded using their respective
              Work Requirement reporting times. These are <strong>system-generated default timestamps</strong>,
              not individually verified arrival times.
            </p>
          </div>

          {/* Late Exceptions Breakdown */}
          {lateCount > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" />
                Late Exceptions ({lateCount})
              </h4>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {lateList.map(({ worker, actualTime, delayMinutes }) => (
                  <div key={worker.workerId} className="p-2.5 px-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900">{worker.workerName}</span>
                      <span className="text-gray-500 ml-1.5">({worker.workerType})</span>
                      <div className="text-[11px] text-gray-400">Scheduled: {worker.reportingTime}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-800">Actual: {actualTime}</div>
                      {delayMinutes !== undefined && (
                        <div className="text-[10px] text-amber-600 font-semibold">+{delayMinutes} min delay</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 flex items-center gap-2">
              <Clock size={14} className="text-gray-400" />
              <span>No late arrival exceptions specified.</span>
            </div>
          )}

          {/* Absent Exceptions Breakdown */}
          {absentCount > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserX size={14} className="text-rose-600" />
                Absent Exceptions ({absentCount})
              </h4>
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {absentList.map((worker) => (
                  <div key={worker.workerId} className="p-2.5 px-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900">{worker.workerName}</span>
                      <span className="text-gray-500 ml-1.5">({worker.workerType})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                      Omit Check-in
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 flex items-center gap-2">
              <UserCheck size={14} className="text-gray-400" />
              <span>No absent exceptions specified.</span>
            </div>
          )}

          {/* Idempotency Audit Footnote */}
          <div className="text-[11px] text-gray-400 flex items-center justify-between pt-1">
            <span>Idempotency Key:</span>
            <span className="font-mono text-gray-500 text-[10px]">{idempotencyKey}</span>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldAlert size={15} className="text-rose-600 shrink-0" />
                <span>Finalization Error</span>
              </div>
              <p>{errorMessage}</p>
              {isRetryPending && (
                <p className="text-[11px] text-rose-700">
                  You can retry submission. The exact same idempotency key and exception payload will be safely reused.
                </p>
              )}
              {onRegenerateKey && (
                <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-rose-700">
                    If this was a key collision, regenerate the key to proceed without losing your inputs.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onRegenerateKey();
                      setErrorMessage(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-900 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors"
                  >
                    <RotateCw size={12} />
                    Regenerate Key
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel / Edit Exceptions
          </button>

          <div className="flex items-center gap-2">
            {isRetryPending && (
              <button
                type="button"
                onClick={handleFinalize}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors"
              >
                <RotateCw size={13} className={isSubmitting ? 'animate-spin' : ''} />
                Retry
              </button>
            )}

            <button
              type="button"
              onClick={handleFinalize}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Finalizing Check-in...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Confirm & Finalize Check-in
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
