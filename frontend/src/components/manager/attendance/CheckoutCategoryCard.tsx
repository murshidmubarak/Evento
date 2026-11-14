import React, { useState } from 'react';
import type { AttendanceRosterItem, CategoryActualDeparture, CategorySummary } from '../../../features/attendance/attendance.types';
import { parseTimeToMinutes } from '../../../features/attendance/attendanceApi';
import { formatTimeTo12Hour, formatTimeTo24Hour } from '../../../utils/formatters';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Save,
  RotateCw,
  Lock,
  TrendingUp,
  TrendingDown,
  RotateCcw,
} from 'lucide-react';

interface CheckoutCategoryCardProps {
  category: CategorySummary;
  roster: AttendanceRosterItem[];
  savedDeparture?: CategoryActualDeparture;
  defaultDate?: string;
  onSaveDeparture: (workerType: string, departureDate: string, time: string, reason?: string) => Promise<void>;
  onMarkException: (workerId: string, departureDate: string, time: string, reason?: string) => Promise<void>;
  onClearException: (workerId: string) => Promise<void>;
  disabled?: boolean;
  isLocked?: boolean;
}

const formatDateToInput = (dateVal: string | Date | null | undefined): string => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
    if (dateVal.includes('T')) return dateVal.split('T')[0];
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

export const CheckoutCategoryCard: React.FC<CheckoutCategoryCardProps> = ({
  category,
  roster,
  savedDeparture,
  defaultDate = '',
  onSaveDeparture,
  onMarkException,
  onClearException,
  disabled = false,
  isLocked = false,
}) => {
  const isCategoryUnconfirmed = category.checkInFinalized === false;
  const isCategoryChangesPending = Boolean(category.checkInChangesPending);
  const isCategoryCheckoutLocked = isLocked || isCategoryUnconfirmed || isCategoryChangesPending;

  const initialDate =
    formatDateToInput(savedDeparture?.actualDepartureDate) ||
    formatDateToInput(category.actualDepartureDate) ||
    defaultDate ||
    '';

  const [departureDateInput, setDepartureDateInput] = useState<string>(initialDate);
  const [departureInput, setDepartureInput] = useState<string>(
    savedDeparture?.actualDepartureTime || category.actualDepartureTime || ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Individual exception modal / inline input state
  const [activeWorkerModal, setActiveWorkerModal] = useState<{
    worker: AttendanceRosterItem;
    type: 'early' | 'overtime';
    date: string;
    time: string;
    reason: string;
    error?: string;
  } | null>(null);

  const [isSubmittingException, setIsSubmittingException] = useState(false);

  // Workers in this category
  const categoryWorkers = roster.filter(
    (w) => w.workerType.trim().toLowerCase() === category.workerType.trim().toLowerCase()
  );

  const formatRecordedTime = (timeVal: string | Date | null | undefined): string => {
    return formatTimeTo12Hour(timeVal);
  };

  const formatDuration = (mins: number | undefined): string => {
    if (!mins || mins <= 0) return '0 mins';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m (${mins}m)`;
  };

  const handleSaveCategoryDeparture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled || isCategoryCheckoutLocked) return;

    setSaveError(null);
    setSaveSuccess(null);

    const trimmedDate = departureDateInput.trim();
    if (!trimmedDate) {
      setSaveError('Please select an actual departure date');
      return;
    }

    const trimmed = departureInput.trim();
    if (!trimmed) {
      setSaveError('Please enter an actual departure time');
      return;
    }

    if (parseTimeToMinutes(trimmed) === null) {
      setSaveError('Please enter a valid time (e.g. 16:00 or 04:00 PM)');
      return;
    }

    try {
      setIsSaving(true);
      await onSaveDeparture(category.workerType, trimmedDate, trimmed);
      setSaveSuccess(`Category actual departure saved (${trimmedDate} ${formatTimeTo12Hour(trimmed)})`);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || err.message || 'Failed to save category departure');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenException = (worker: AttendanceRosterItem, type: 'early' | 'overtime') => {
    if (disabled || isCategoryCheckoutLocked) return;
    const workerDate =
      formatDateToInput(worker.checkOut) ||
      formatDateToInput(worker.checkIn) ||
      departureDateInput ||
      defaultDate ||
      '';
    setActiveWorkerModal({
      worker,
      type,
      date: workerDate,
      time: worker.actualDepartureTime || (worker.checkOut ? formatRecordedTime(worker.checkOut) : '') || departureInput || '',
      reason: '',
    });
  };

  const handleSubmitException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkerModal || disabled || isCategoryCheckoutLocked) return;

    if (!activeWorkerModal.date.trim()) {
      setActiveWorkerModal((prev) => (prev ? { ...prev, error: 'Please select an actual departure date' } : null));
      return;
    }

    const trimmed = activeWorkerModal.time.trim();
    if (!trimmed || parseTimeToMinutes(trimmed) === null) {
      setActiveWorkerModal((prev) => (prev ? { ...prev, error: 'Please enter a valid time (e.g. 15:30 or 03:30 PM)' } : null));
      return;
    }

    try {
      setIsSubmittingException(true);
      await onMarkException(
        activeWorkerModal.worker.workerId,
        activeWorkerModal.date.trim(),
        trimmed,
        activeWorkerModal.reason.trim() || undefined
      );
      setActiveWorkerModal(null);
    } catch (err: any) {
      setActiveWorkerModal((prev) =>
        prev
          ? {
              ...prev,
              error: err.response?.data?.message || err.message || 'Failed to record exception',
            }
          : null
      );
    } finally {
      setIsSubmittingException(false);
    }
  };

  const handleClearException = async (workerId: string) => {
    if (disabled || isCategoryCheckoutLocked) return;
    if (!window.confirm('Restore this worker to the category default departure?')) return;
    try {
      await onClearException(workerId);
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to clear exception');
    }
  };

  const currentSavedTime = savedDeparture?.actualDepartureTime || category.actualDepartureTime;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden transition-all">
      {/* Category Card Header */}
      <div className="p-5 bg-gradient-to-r from-gray-50/80 to-white border-b border-gray-200/80">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                {category.workerType.charAt(0).toUpperCase()}
              </span>
              <h3 className="text-base font-bold text-gray-900">{category.workerType}</h3>
              {isCategoryUnconfirmed ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                  <Lock size={12} />
                  <span>Checkout Locked — Confirm Check-in First</span>
                </span>
              ) : isCategoryChangesPending ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                  <Lock size={12} />
                  <span>Checkout Locked — Re-confirmation Required</span>
                </span>
              ) : isLocked ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                  <Lock size={12} />
                  <span>Locked</span>
                </span>
              ) : currentSavedTime ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 size={12} />
                  <span>Departure: {formatTimeTo12Hour(currentSavedTime)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                  <Clock size={12} />
                  <span>Check-in Confirmed · Departure Pending</span>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>Assigned: <strong className="text-gray-900">{category.totalAssigned}</strong></span>
              <span>•</span>
              <span>Eligible: <strong className="text-gray-900">{category.eligibleCount}</strong></span>
              <span>•</span>
              <span>Absent: <strong className="text-gray-900">{category.absentCount}</strong></span>
              <span>•</span>
              <span>Normal: <strong className="text-emerald-700">{category.normalCount}</strong></span>
              <span>•</span>
              <span>Early: <strong className="text-amber-700">{category.earlyCount}</strong></span>
              <span>•</span>
              <span>Overtime: <strong className="text-blue-700">{category.overtimeCount}</strong></span>
              {category.pendingCount > 0 && (
                <>
                  <span>•</span>
                  <span>Pending: <strong className="text-red-700">{category.pendingCount}</strong></span>
                </>
              )}
            </div>
          </div>

          {/* Departure Date & Time Input Form */}
          {!isLocked && (
            <form onSubmit={handleSaveCategoryDeparture} className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={departureDateInput}
                  onChange={(e) => {
                    setDepartureDateInput(e.target.value);
                    setSaveError(null);
                  }}
                  disabled={disabled || isSaving || isCategoryCheckoutLocked}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer"
                  title="Actual Departure Date"
                />
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="time"
                    value={formatTimeTo24Hour(departureInput)}
                    onChange={(e) => {
                      setDepartureInput(e.target.value);
                      setSaveError(null);
                    }}
                    disabled={disabled || isSaving || isCategoryCheckoutLocked}
                    placeholder="e.g. 16:00 or 04:00 PM"
                    className="pl-8 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 w-36 transition-all bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer"
                  />
                </div>
                {departureInput && (
                  <span className="text-xs font-bold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-xl border border-gray-200">
                    {formatTimeTo12Hour(departureInput)}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={disabled || isSaving || isCategoryCheckoutLocked || !departureInput.trim() || !departureDateInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed rounded-xl transition-all shadow-2xs"
              >
                {isSaving ? (
                  <>
                    <RotateCw size={12} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={12} />
                    <span>{currentSavedTime ? 'Update Departure' : 'Save Departure'}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Notices */}
        {isCategoryUnconfirmed && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <Lock size={14} className="shrink-0 text-amber-700" />
            <span>Check-in for <strong>{category.workerType}</strong> must be confirmed before recording category departures or individual checkout exceptions.</span>
          </div>
        )}
        {isCategoryChangesPending && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0 text-rose-700" />
            <span>Attendance changes were made after confirmation. Please re-confirm check-in for <strong>{category.workerType}</strong> to unlock checkout modifications.</span>
          </div>
        )}
        {Boolean(category.ineligibleOvertimeRequiredCount && category.ineligibleOvertimeRequiredCount > 0) && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0 text-amber-700" />
            <span>
              <strong>{category.ineligibleOvertimeRequiredCount} worker(s)</strong> checked in at or after the category departure time ({currentSavedTime}). They cannot receive category default checkout; please record individual overtime exceptions for them.
            </span>
          </div>
        )}

        {/* Notices */}
        {saveError && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}
      </div>

      {/* Workers Roster Table */}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50/70 border-b border-gray-200/80 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-2.5 px-4">Worker</th>
              <th className="py-2.5 px-4">Arrival</th>
              <th className="py-2.5 px-4">Check-in</th>
              <th className="py-2.5 px-4">Actual Checkout</th>
              <th className="py-2.5 px-4">Source</th>
              <th className="py-2.5 px-4">Classification</th>
              <th className="py-2.5 px-4">Duration</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categoryWorkers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-400">
                  No workers assigned to this category.
                </td>
              </tr>
            ) : (
              categoryWorkers.map((worker) => {
                const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';
                const isException = worker.checkOutSource === 'individual_exception';
                const hasCheckIn = Boolean(worker.checkIn);

                return (
                  <tr key={worker.workerId} className={isAbsent ? 'bg-gray-50/50 opacity-60' : 'hover:bg-gray-50/50 transition-colors'}>
                    {/* Worker Info */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900">{worker.workerName}</div>
                      <div className="text-[11px] text-gray-500">{worker.businessId || '—'}</div>
                    </td>

                    {/* Arrival Status */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                          Absent · Excluded
                        </span>
                      ) : worker.arrivalStatus === 'late' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Late (+{worker.delayMinutes}m)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          On Time
                        </span>
                      )}
                      {worker.isStatusLocked && (
                        <span className="ml-1 text-[10px] text-gray-500 font-medium">(Locked)</span>
                      )}
                    </td>

                    {/* Effective Check-in */}
                    <td className="py-3 px-4 text-gray-700 font-medium">
                      {isAbsent ? '—' : formatRecordedTime(worker.checkIn)}
                    </td>

                    {/* Actual Checkout */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="text-gray-400">—</span>
                      ) : worker.checkOut ? (
                        <span className="font-bold text-gray-900">
                          {formatRecordedTime(worker.checkOut)}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-medium italic">Pending departure</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="text-gray-400">—</span>
                      ) : isException ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                          Individual Exception
                        </span>
                      ) : worker.checkOut ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          Category Default
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Departure Classification */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="text-gray-400">—</span>
                      ) : worker.departureStatus === 'early_departure' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <TrendingDown size={12} />
                          <span>Early ({worker.earlyDepartureMinutes}m)</span>
                        </span>
                      ) : worker.departureStatus === 'overtime' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                          <TrendingUp size={12} />
                          <span>Overtime (+{worker.overtimeMinutes}m)</span>
                        </span>
                      ) : worker.departureStatus === 'normal' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Normal
                        </span>
                      ) : (
                        <span className="text-gray-400">Not Recorded</span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {isAbsent ? '0 mins' : formatDuration(worker.durationMinutes)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      {isAbsent || isCategoryCheckoutLocked || !hasCheckIn ? (
                        <span className="text-gray-400">—</span>
                      ) : isException ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenException(worker, worker.departureStatus === 'overtime' ? 'overtime' : 'early')}
                            disabled={disabled || isCategoryCheckoutLocked}
                            className="px-2 py-1 text-[11px] font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClearException(worker.workerId)}
                            disabled={disabled || isCategoryCheckoutLocked}
                            title="Restore category default"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                          >
                            <RotateCcw size={10} />
                            <span>Return to Normal</span>
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenException(worker, 'early')}
                            disabled={disabled || isCategoryCheckoutLocked}
                            className="px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
                          >
                            Mark Early
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenException(worker, 'overtime')}
                            disabled={disabled || isCategoryCheckoutLocked}
                            className="px-2 py-1 text-[11px] font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                          >
                            Mark Overtime
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Individual Exception Modal */}
      {activeWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 animate-in fade-in zoom-in-95">
            <h4 className="text-base font-bold text-gray-900 mb-1">
              {activeWorkerModal.type === 'early' ? 'Mark Early Departure' : 'Mark Overtime'}
            </h4>
            <p className="text-xs text-gray-500 mb-4">
              Enter the worker’s actual departure time for <strong>{activeWorkerModal.worker.workerName}</strong>.
            </p>

            <form onSubmit={handleSubmitException} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Actual Departure Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={activeWorkerModal.date}
                  onChange={(e) =>
                    setActiveWorkerModal((prev) => (prev ? { ...prev, date: e.target.value, error: undefined } : null))
                  }
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 bg-white text-gray-900 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-700">
                    Actual Departure Time <span className="text-red-500">*</span>
                  </label>
                  {activeWorkerModal.time && (
                    <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
                      {formatTimeTo12Hour(activeWorkerModal.time)}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="time"
                    value={formatTimeTo24Hour(activeWorkerModal.time)}
                    onChange={(e) =>
                      setActiveWorkerModal((prev) => (prev ? { ...prev, time: e.target.value, error: undefined } : null))
                    }
                    placeholder="e.g. 14:00 or 02:00 PM"
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 bg-white text-gray-900 cursor-pointer"
                    autoFocus
                  />
                </div>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Check-in was at: {formatRecordedTime(activeWorkerModal.worker.checkIn)}. Must be strictly later.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason / Notes (optional)
                </label>
                <input
                  type="text"
                  value={activeWorkerModal.reason}
                  onChange={(e) =>
                    setActiveWorkerModal((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                  }
                  placeholder="e.g. Approved early departure for exam"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {activeWorkerModal.error && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{activeWorkerModal.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveWorkerModal(null)}
                  disabled={isSubmittingException}
                  className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingException || !activeWorkerModal.time.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-black disabled:bg-gray-300 rounded-xl transition-colors shadow-2xs"
                >
                  {isSubmittingException ? (
                    <>
                      <RotateCw size={12} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Exception</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
