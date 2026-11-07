import React, { useState } from 'react';
import type { AttendanceRosterItem } from '../../../features/attendance/attendance.types';
import type { WorkerCheckOutExceptionState } from './CheckoutRosterTable';
import { parseTimeToMinutes } from '../../../features/attendance/attendanceApi';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  X,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';

interface ReviewCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (idempotencyKey: string) => Promise<void>;
  roster: AttendanceRosterItem[];
  defaultFinishTime: string;
  categoryFinishTimes?: Record<string, string>;
  overrides: Record<string, string>;
  exceptions: Record<string, WorkerCheckOutExceptionState>;
  idempotencyKey: string;
  onRegenerateKey?: () => void;
}

export const ReviewCheckoutModal: React.FC<ReviewCheckoutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  roster,
  defaultFinishTime,
  categoryFinishTimes,
  overrides,
  exceptions,
  idempotencyKey,
  onRegenerateKey,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Breakdown calculations
  const earlyList: Array<{
    worker: AttendanceRosterItem;
    applicableFinish: string;
    actualCheckout: string;
    earlyMinutes?: number;
  }> = [];

  const overtimeList: Array<{
    worker: AttendanceRosterItem;
    applicableFinish: string;
    actualCheckout: string;
    overtimeMinutes?: number;
  }> = [];

  const normalList: Array<{
    worker: AttendanceRosterItem;
    applicableFinish: string;
  }> = [];

  const absentList: AttendanceRosterItem[] = [];

  roster.forEach((worker) => {
    const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';
    if (isAbsent) {
      absentList.push(worker);
      return;
    }

    const applicableFinish =
      overrides[worker.requirementId] ||
      (categoryFinishTimes && categoryFinishTimes[worker.workerType]) ||
      defaultFinishTime ||
      '—';
    const exc = exceptions[worker.workerId];

    if (exc?.type === 'early') {
      earlyList.push({
        worker,
        applicableFinish,
        actualCheckout: exc.actualCheckoutTime || '',
      });
    } else if (exc?.type === 'overtime') {
      overtimeList.push({
        worker,
        applicableFinish,
        actualCheckout: exc.actualCheckoutTime || '',
      });
    } else {
      normalList.push({
        worker,
        applicableFinish,
      });
    }
  });

  const handleFinalize = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onConfirm(idempotencyKey);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to finalize checkout. Network or server error.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-checkout-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200/90 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 id="review-checkout-modal-title" className="text-base font-bold text-gray-900">
                Review & Finalize Event Checkout
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Verify the checkout summary before committing permanent attendance records.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-xs text-rose-950">Finalization Encountered an Issue</p>
                  <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
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

          {/* Metrics Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 border border-gray-200/80 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-gray-500 block">Total Staff</span>
              <span className="text-lg font-black text-gray-900">{roster.length}</span>
              <span className="text-[10px] text-gray-500 block mt-0.5">Assigned Workers</span>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Normal Default</span>
              <span className="text-lg font-black text-emerald-900">{normalList.length}</span>
              <span className="text-[10px] text-emerald-700 block mt-0.5">System Default</span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-700 block">Early Departures</span>
              <span className="text-lg font-black text-amber-900">{earlyList.length}</span>
              <span className="text-[10px] text-amber-700 block mt-0.5">Departed Early</span>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-purple-700 block">Overtime</span>
              <span className="text-lg font-black text-purple-900">{overtimeList.length}</span>
              <span className="text-[10px] text-purple-700 block mt-0.5">Extra Hours</span>
            </div>
          </div>

          {/* Finishing Time Configuration Info */}
          <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-3.5 space-y-2">
            <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
              <Clock size={14} className="text-emerald-700" />
              Finishing Time Configuration
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-500">Event Default Finish Time: </span>
                <strong className="text-gray-900 font-semibold">{defaultFinishTime}</strong>
              </div>
              <div>
                <span className="text-gray-500">Requirement Overrides: </span>
                <strong className="text-gray-900 font-semibold">
                  {Object.keys(overrides).length > 0 ? `${Object.keys(overrides).length} override(s)` : 'None'}
                </strong>
              </div>
            </div>
          </div>

          {/* Exception Details Lists */}
          {earlyList.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-amber-900 text-xs">
                Early Departure Exceptions ({earlyList.length})
              </h4>
              <div className="border border-amber-200 rounded-xl divide-y divide-amber-100 bg-amber-50/30 overflow-hidden max-h-36 overflow-y-auto">
                {earlyList.map(({ worker, applicableFinish, actualCheckout }) => {
                  const repMins = parseTimeToMinutes(worker.reportingTime);
                  const finMins = parseTimeToMinutes(applicableFinish);
                  const coMins = parseTimeToMinutes(actualCheckout);
                  const isFinNextDay = repMins !== null && finMins !== null && finMins <= repMins;
                  const isCoNextDay = repMins !== null && coMins !== null && coMins <= repMins;

                  return (
                    <div key={worker.workerId} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{worker.workerName}</span>
                        <span className="text-gray-500 text-[10px] block">
                          {worker.workerType} • Finish: {applicableFinish}
                          {isFinNextDay && (
                            <span className="ml-1 px-1 py-0.2 rounded text-[8px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              +1 Day
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-lg border border-amber-200 inline-flex items-center gap-1">
                        Out: {actualCheckout}
                        {isCoNextDay && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                            +1 Day
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {overtimeList.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-bold text-purple-900 text-xs">
                Overtime Exceptions ({overtimeList.length})
              </h4>
              <div className="border border-purple-200 rounded-xl divide-y divide-purple-100 bg-purple-50/30 overflow-hidden max-h-36 overflow-y-auto">
                {overtimeList.map(({ worker, applicableFinish, actualCheckout }) => {
                  const repMins = parseTimeToMinutes(worker.reportingTime);
                  const finMins = parseTimeToMinutes(applicableFinish);
                  const coMins = parseTimeToMinutes(actualCheckout);
                  const isFinNextDay = repMins !== null && finMins !== null && finMins <= repMins;
                  const isCoNextDay = repMins !== null && coMins !== null && coMins <= repMins;

                  return (
                    <div key={worker.workerId} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{worker.workerName}</span>
                        <span className="text-gray-500 text-[10px] block">
                          {worker.workerType} • Finish: {applicableFinish}
                          {isFinNextDay && (
                            <span className="ml-1 px-1 py-0.2 rounded text-[8px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              +1 Day
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-bold text-purple-800 bg-purple-100/80 px-2 py-0.5 rounded-lg border border-purple-200 inline-flex items-center gap-1">
                        Out: {actualCheckout}
                        {isCoNextDay && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-purple-200 text-purple-900 border border-purple-300">
                            +1 Day
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {absentList.length > 0 && (
            <div className="p-3 bg-rose-50/50 border border-rose-200/80 rounded-xl text-rose-800 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold">Absent Staff Excluded ({absentList.length})</span>
                <p className="text-[10px] text-rose-600">
                  Workers marked absent during check-in are excluded from checkout.
                </p>
              </div>
              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-md text-[10px] font-bold">
                No checkout recorded
              </span>
            </div>
          )}

          {/* Provenance Notice */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1 text-emerald-900">
            <div className="flex items-center gap-1.5 font-bold text-xs">
              <Sparkles size={14} className="text-emerald-700" />
              <span>Timestamp Provenance Disclaimer</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              All <strong>{normalList.length} staff</strong> marked as Normal (Default) will have their checkout timestamps automatically recorded with <code>system_default</code> provenance matching their applicable finishing time. Exceptions are recorded with <code>manager_actual</code>.
            </p>
          </div>

          {/* Idempotency Audit Footnote */}
          <div className="text-[10px] text-gray-400 font-mono flex items-center justify-between">
            <span>Idempotency Key: {idempotencyKey}</span>
            <span>Transaction: Single Atomic Commit</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors shadow-2xs"
          >
            Cancel & Edit
          </button>

          <button
            type="button"
            onClick={handleFinalize}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Finalizing Checkout...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={14} />
                <span>Confirm & Finalize Checkout</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

