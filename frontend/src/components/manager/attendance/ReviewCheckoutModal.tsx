import React, { useState } from 'react';
import type { AttendanceRosterItem, CategorySummary } from '../../../features/attendance/attendance.types';
import type { WorkerCheckOutExceptionState } from './CheckoutRosterTable';
import { formatTimeTo12Hour } from '../../../utils/formatters';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
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
  categorySummaries?: CategorySummary[];
  defaultFinishTime?: string;
  categoryFinishTimes?: Record<string, string>;
  overrides?: Record<string, string>;
  exceptions?: Record<string, WorkerCheckOutExceptionState>;
  idempotencyKey: string;
  onRegenerateKey?: () => void;
}

export const ReviewCheckoutModal: React.FC<ReviewCheckoutModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  roster,
  categorySummaries = [],
  defaultFinishTime: _defaultFinishTime,
  categoryFinishTimes: _categoryFinishTimes,
  overrides: _overrides = {},
  exceptions = {},
  idempotencyKey,
  onRegenerateKey,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Category counts
  const totalCategories = categorySummaries.length;
  const categoriesWithDeparture = categorySummaries.filter(
    (c) => c.actualDepartureTime && c.actualDepartureTime.trim()
  ).length;
  const categoriesPending = categorySummaries.filter(
    (c) => c.eligibleCount > 0 && (!c.actualDepartureTime || !c.actualDepartureTime.trim())
  ).length;

  // Worker lists and metrics
  const normalList: AttendanceRosterItem[] = [];
  const earlyList: AttendanceRosterItem[] = [];
  const overtimeList: AttendanceRosterItem[] = [];
  const absentList: AttendanceRosterItem[] = [];
  const pendingWorkerList: AttendanceRosterItem[] = [];

  let totalDurationMinutes = 0;

  roster.forEach((worker) => {
    const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';
    if (isAbsent) {
      absentList.push(worker);
      return;
    }

    totalDurationMinutes += worker.durationMinutes || 0;

    // Check status from record or exceptions
    const exc = exceptions[worker.workerId];
    if (worker.departureStatus === 'early_departure' || exc?.type === 'early') {
      earlyList.push(worker);
    } else if (worker.departureStatus === 'overtime' || exc?.type === 'overtime') {
      overtimeList.push(worker);
    } else if (worker.departureStatus === 'normal' || worker.checkOut) {
      normalList.push(worker);
    } else {
      pendingWorkerList.push(worker);
    }
  });

  const canFinalize =
    (totalCategories === 0 || categoriesPending === 0) &&
    pendingWorkerList.length === 0;

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

  const formatDurationTotal = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m (${mins} mins)`;
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
                Verify the category departures, working durations, and exceptions before committing finalization.
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
                  <p className="font-bold text-xs text-rose-950">Finalization Issue</p>
                  <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              {onRegenerateKey && (
                <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-rose-700">
                    If this was an idempotency key collision, regenerate the key to proceed.
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

          {/* Categories Overview Card */}
          {totalCategories > 0 && (
            <div className="bg-gray-50 border border-gray-200/80 rounded-xl p-4">
              <h4 className="font-bold text-gray-900 text-xs mb-2 flex items-center justify-between">
                <span>Worker Categories ({totalCategories})</span>
                <span className="text-gray-500 font-normal">
                  {categoriesWithDeparture} of {totalCategories} recorded
                </span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {categorySummaries.map((cat) => (
                  <div key={cat.workerType} className="flex items-center justify-between p-2 rounded-lg bg-white border border-gray-200">
                    <span className="font-medium text-gray-800">{cat.workerType}</span>
                    {cat.actualDepartureTime ? (
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                        Departure: {formatTimeTo12Hour(cat.actualDepartureTime)}
                      </span>
                    ) : (
                      <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-200">
                        Pending Departure
                      </span>
                    )}
                  </div>
                ))}
              </div>
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
              <span className="text-[10px] text-emerald-700 block mt-0.5">Category Default</span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-700 block">Early Departures</span>
              <span className="text-lg font-black text-amber-900">{earlyList.length}</span>
              <span className="text-[10px] text-amber-700 block mt-0.5">Individual Exceptions</span>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-blue-700 block">Overtime</span>
              <span className="text-lg font-black text-blue-900">{overtimeList.length}</span>
              <span className="text-[10px] text-blue-700 block mt-0.5">Individual Exceptions</span>
            </div>
          </div>

          {/* Total Durations Summary */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-1 text-emerald-900">
            <div className="flex items-center justify-between font-bold text-xs">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-emerald-700" />
                <span>Total Recorded Working Durations</span>
              </span>
              <span className="text-sm font-black text-emerald-950">
                {formatDurationTotal(totalDurationMinutes)}
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Every eligible worker’s duration has been calculated from their own effective check-in timestamp to their actual departure.
            </p>
          </div>

          {/* Excluded Absent Workers notice */}
          {absentList.length > 0 && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-800 text-xs block">Absent Workers ({absentList.length})</span>
                <span className="text-gray-500 text-[11px]">Strictly excluded from checkout. 0 mins duration recorded.</span>
              </div>
              <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-[10px] font-bold">
                Excluded
              </span>
            </div>
          )}

          {/* Pending Workers Blocker Notice */}
          {pendingWorkerList.length > 0 && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <div>
                <span className="font-bold text-xs block">Pending Checkout Records ({pendingWorkerList.length})</span>
                <span className="text-[11px]">
                  All eligible non-absent workers must have a valid checkout before finalization. Please save category departures or record individual exceptions.
                </span>
              </div>
            </div>
          )}

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
            disabled={isSubmitting || !canFinalize}
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
