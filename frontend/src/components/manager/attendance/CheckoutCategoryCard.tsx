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
  X,
  ChevronRight,
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

  // Unified Worker Details & Actions Modal state
  const [selectedWorkerForModal, setSelectedWorkerForModal] = useState<AttendanceRosterItem | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'form'>('view');
  const [exceptionType, setExceptionType] = useState<'early' | 'overtime'>('early');
  const [exceptionDate, setExceptionDate] = useState<string>('');
  const [exceptionTime, setExceptionTime] = useState<string>('');
  const [exceptionReason, setExceptionReason] = useState<string>('');
  const [exceptionError, setExceptionError] = useState<string | null>(null);
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

  const handleOpenWorkerModal = (worker: AttendanceRosterItem) => {
    setSelectedWorkerForModal(worker);
    setModalMode('view');
    setExceptionError(null);

    const workerDate =
      formatDateToInput(worker.checkOut) ||
      formatDateToInput(worker.checkIn) ||
      departureDateInput ||
      defaultDate ||
      '';
    setExceptionDate(workerDate);
    const existingTime =
      worker.actualDepartureTime ||
      (worker.checkOut ? formatRecordedTime(worker.checkOut) : '') ||
      departureInput ||
      '';
    setExceptionTime(existingTime);
    setExceptionReason('');
    setExceptionType(worker.departureStatus === 'overtime' ? 'overtime' : 'early');
  };

  const handleStartExceptionForm = (type: 'early' | 'overtime') => {
    setExceptionType(type);
    setModalMode('form');
    setExceptionError(null);
  };

  const handleCloseWorkerModal = () => {
    if (isSubmittingException) return;
    setSelectedWorkerForModal(null);
    setModalMode('view');
    setExceptionError(null);
  };

  const handleSubmitException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForModal || disabled || isCategoryCheckoutLocked) return;

    if (!exceptionDate.trim()) {
      setExceptionError('Please select an actual departure date');
      return;
    }

    const trimmed = exceptionTime.trim();
    if (!trimmed || parseTimeToMinutes(trimmed) === null) {
      setExceptionError('Please enter a valid time (e.g. 15:30 or 03:30 PM)');
      return;
    }

    try {
      setIsSubmittingException(true);
      setExceptionError(null);
      await onMarkException(
        selectedWorkerForModal.workerId,
        exceptionDate.trim(),
        trimmed,
        exceptionReason.trim() || undefined
      );
      setSelectedWorkerForModal(null);
      setModalMode('view');
    } catch (err: any) {
      setExceptionError(err.response?.data?.message || err.message || 'Failed to record exception');
    } finally {
      setIsSubmittingException(false);
    }
  };

  const handleClearCurrentException = async () => {
    if (!selectedWorkerForModal || disabled || isCategoryCheckoutLocked) return;
    if (!window.confirm('Restore this worker to the category default departure?')) return;
    try {
      await onClearException(selectedWorkerForModal.workerId);
      setSelectedWorkerForModal(null);
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to clear exception');
    }
  };

  const currentSavedTime = savedDeparture?.actualDepartureTime || category.actualDepartureTime;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-2xs overflow-hidden transition-all">
      {/* Category Card Header */}
      <div className="p-4 sm:p-5 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-gray-900">{category.workerType}</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
              <span>Assigned <strong className="text-gray-900 font-bold ml-0.5">{category.totalAssigned}</strong></span>
              <span>Eligible <strong className="text-gray-900 font-bold ml-0.5">{category.eligibleCount}</strong></span>
              <span>Absent <strong className="text-rose-600 font-bold ml-0.5">{category.absentCount}</strong></span>
              <span>Normal <strong className="text-emerald-600 font-bold ml-0.5">{category.normalCount}</strong></span>
              <span>Early <strong className="text-amber-600 font-bold ml-0.5">{category.earlyCount}</strong></span>
              <span>Overtime <strong className="text-purple-600 font-bold ml-0.5">{category.overtimeCount}</strong></span>
              {category.pendingCount > 0 && (
                <span>Pending <strong className="text-gray-700 font-bold ml-0.5">{category.pendingCount}</strong></span>
              )}
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-auto">
            {isCategoryUnconfirmed ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                <Lock size={12} />
                <span>Checkout Locked — Confirm Check-in First</span>
              </span>
            ) : isCategoryChangesPending ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                <Lock size={12} />
                <span>Checkout Locked — Re-confirmation Required</span>
              </span>
            ) : isLocked ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                <Lock size={12} />
                <span>Locked</span>
              </span>
            ) : currentSavedTime ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Departure: {formatTimeTo12Hour(currentSavedTime)}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                <Clock size={12} />
                <span>Check-in Confirmed · Departure Pending</span>
              </span>
            )}
          </div>
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

      {/* Actual Departure Section */}
      {!isLocked && (
        <div className="p-4 sm:p-5 bg-gray-50/40 border-t border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-gray-900">Actual departure</h4>
            <p className="text-[11px] text-gray-500">
              Applies to all normal workers in this category.
            </p>
          </div>

          <form onSubmit={handleSaveCategoryDeparture} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Departure date</label>
              <input
                type="date"
                value={departureDateInput}
                onChange={(e) => {
                  setDepartureDateInput(e.target.value);
                  setSaveError(null);
                }}
                disabled={disabled || isSaving || isCategoryCheckoutLocked}
                className="px-3 py-1.5 text-xs text-gray-900 bg-white border border-gray-200 rounded-lg shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer"
                title="Departure date"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Departure time</label>
              <input
                type="time"
                value={formatTimeTo24Hour(departureInput)}
                onChange={(e) => {
                  setDepartureInput(e.target.value);
                  setSaveError(null);
                }}
                disabled={disabled || isSaving || isCategoryCheckoutLocked}
                placeholder="e.g. 16:00 or 04:00 PM"
                className="px-3 py-1.5 text-xs text-gray-900 bg-white border border-gray-200 rounded-lg shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-36 disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer"
                title="Departure time"
              />
            </div>

            <button
              type="submit"
              disabled={disabled || isSaving || isCategoryCheckoutLocked || !departureInput.trim() || !departureDateInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors shadow-2xs shrink-0 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RotateCw size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={13} />
                  <span>{currentSavedTime ? 'Update Departure' : 'Save Departure'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Workers Roster Table */}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left text-xs min-w-[640px]">
          <thead className="bg-white border-b border-gray-100 text-gray-400 font-semibold uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Worker</th>
              <th className="py-3 px-4">Arrival</th>
              <th className="py-3 px-4">Check-in</th>
              <th className="py-3 px-4">Actual Checkout</th>
              <th className="py-3 px-4">Classification</th>
              <th className="py-3 px-4 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categoryWorkers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No workers assigned to this category.
                </td>
              </tr>
            ) : (
              categoryWorkers.map((worker) => {
                const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';

                return (
                  <tr
                    key={worker.workerId}
                    onClick={() => handleOpenWorkerModal(worker)}
                    className={`cursor-pointer transition-colors ${isAbsent ? 'bg-gray-50/50 hover:bg-gray-100/60' : 'hover:bg-gray-50/70'
                      }`}
                  >
                    {/* Worker Info */}
                    <td className="py-3 px-4">
                      <div className="text-sm font-bold text-gray-900">{worker.workerName}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{worker.businessId || '—'}</div>
                    </td>

                    {/* Arrival Status */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                          Absent
                        </span>
                      ) : worker.arrivalStatus === 'late' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Late (+{worker.delayMinutes}m)
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          On Time
                        </span>
                      )}
                      {worker.isStatusLocked && (
                        <span className="ml-1 text-[10px] text-gray-500 font-medium">(Locked)</span>
                      )}
                    </td>

                    {/* Effective Check-in */}
                    <td className="py-3 px-4 text-gray-700 font-normal">
                      {isAbsent ? '—' : formatRecordedTime(worker.checkIn)}
                    </td>

                    {/* Actual Checkout */}
                    <td className="py-3 px-4">
                      {isAbsent ? (
                        <span className="text-gray-400">—</span>
                      ) : worker.checkOut ? (
                        <span className="text-xs font-bold text-gray-900">
                          {formatRecordedTime(worker.checkOut)}
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
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/80">
                          <TrendingDown size={12} />
                          <span>Early</span>
                        </span>
                      ) : worker.departureStatus === 'overtime' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200/80">
                          <TrendingUp size={12} />
                          <span>Overtime</span>
                        </span>
                      ) : worker.departureStatus === 'normal' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                          <CheckCircle2 size={12} />
                          <span>On Time</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-left">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenWorkerModal(worker);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg shadow-2xs hover:border-gray-300 transition-all cursor-pointer"
                        title="View details and manage departure"
                      >
                        <span>Action</span>
                        <ChevronRight size={12} className="text-gray-400" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Unified Worker Details & Actions Modal */}
      {selectedWorkerForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 mb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-gray-900">
                    {selectedWorkerForModal.workerName}
                  </h4>
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-700 rounded-md border border-gray-200">
                    {selectedWorkerForModal.workerType}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {selectedWorkerForModal.businessId ? `ID: ${selectedWorkerForModal.businessId} · ` : ''}
                  Scheduled shift reporting: <strong>{formatTimeTo12Hour(selectedWorkerForModal.reportingTime)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseWorkerModal}
                disabled={isSubmittingException}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Total Duration Banner (Prominent & Clean) */}
            <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-gray-200/90 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">
                    Total Shift Duration
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-gray-700" />
                    <span className="text-xl font-extrabold text-gray-900">
                      {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent'
                        ? '0 mins'
                        : formatDuration(selectedWorkerForModal.durationMinutes)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">
                    Source
                  </span>
                  {selectedWorkerForModal.checkOutSource === 'individual_exception' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                      Individual Exception
                    </span>
                  ) : selectedWorkerForModal.checkOut ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                      Category Default
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/60">
                <span className="text-[11px] font-semibold text-gray-500 block mb-1">Check-in Arrival</span>
                <div className="font-bold text-gray-900 text-sm mb-1">
                  {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent'
                    ? '—'
                    : formatRecordedTime(selectedWorkerForModal.checkIn)}
                </div>
                <div>
                  {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                      Absent
                    </span>
                  ) : selectedWorkerForModal.arrivalStatus === 'late' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Late (+{selectedWorkerForModal.delayMinutes}m)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      On Time
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/60">
                <span className="text-[11px] font-semibold text-gray-500 block mb-1">Actual Departure</span>
                <div className="font-bold text-gray-900 text-sm mb-1">
                  {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent' ? (
                    '—'
                  ) : selectedWorkerForModal.checkOut ? (
                    formatRecordedTime(selectedWorkerForModal.checkOut)
                  ) : (
                    <span className="text-amber-700 font-medium italic text-xs">Pending departure</span>
                  )}
                </div>
                <div>
                  {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent' ? (
                    <span className="text-[10px] text-gray-400">—</span>
                  ) : selectedWorkerForModal.departureStatus === 'early_departure' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <TrendingDown size={10} />
                      <span>Early</span>
                    </span>
                  ) : selectedWorkerForModal.departureStatus === 'overtime' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                      <TrendingUp size={10} />
                      <span>Overtime</span>
                    </span>
                  ) : selectedWorkerForModal.departureStatus === 'normal' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 size={10} />
                      <span>On Time</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions / Form Section */}
            {selectedWorkerForModal.arrivalStatus === 'absent' || selectedWorkerForModal.status === 'absent' ? (
              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-center">
                <p className="text-xs text-gray-500">
                  This worker was marked absent and is excluded from checkout departure adjustments.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleCloseWorkerModal}
                    className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : isCategoryCheckoutLocked || !selectedWorkerForModal.checkIn ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <div className="flex items-center justify-center gap-1.5 text-amber-800 text-xs font-semibold mb-1">
                  <Lock size={14} />
                  <span>Checkout Locked</span>
                </div>
                <p className="text-[11px] text-amber-700">
                  Check-in must be confirmed before recording individual checkout exceptions.
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleCloseWorkerModal}
                    className="px-4 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : modalMode === 'view' ? (
              <div className="space-y-3 pt-1 border-t border-gray-100">
                <span className="text-xs font-bold text-gray-800 block">Actions</span>
                {selectedWorkerForModal.checkOutSource === 'individual_exception' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50/60 border border-purple-200">
                      <div>
                        <span className="text-xs font-bold text-purple-900 block">Custom Departure Recorded</span>
                        <span className="text-[11px] text-purple-700">
                          {selectedWorkerForModal.departureStatus === 'overtime'
                            ? `Overtime exception active (+${selectedWorkerForModal.overtimeMinutes || 0}m)`
                            : `Early departure exception active (-${selectedWorkerForModal.earlyDepartureMinutes || 0}m)`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearCurrentException}
                        disabled={disabled || isCategoryCheckoutLocked}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-white hover:bg-purple-100 border border-purple-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
                      >
                        <RotateCcw size={12} />
                        <span>Return to Normal</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartExceptionForm(selectedWorkerForModal.departureStatus === 'overtime' ? 'overtime' : 'early')}
                        disabled={disabled || isCategoryCheckoutLocked}
                        className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Edit Departure Time
                      </button>
                      <button
                        type="button"
                        onClick={handleCloseWorkerModal}
                        className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleStartExceptionForm('early')}
                        disabled={disabled || isCategoryCheckoutLocked}
                        className="flex flex-col items-start p-3 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-left transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs mb-0.5">
                          <TrendingDown size={14} className="text-amber-700 group-hover:scale-110 transition-transform" />
                          <span>Mark Early</span>
                        </div>
                        <span className="text-[11px] text-amber-700/90 leading-tight">
                          Worker left before category departure
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartExceptionForm('overtime')}
                        disabled={disabled || isCategoryCheckoutLocked}
                        className="flex flex-col items-start p-3 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 text-left transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs mb-0.5">
                          <TrendingUp size={14} className="text-blue-700 group-hover:scale-110 transition-transform" />
                          <span>Mark Overtime</span>
                        </div>
                        <span className="text-[11px] text-blue-700/90 leading-tight">
                          Worker worked extended overtime shift
                        </span>
                      </button>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleCloseWorkerModal}
                        className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Inline Form Mode for Editing / Marking Exception */
              <form onSubmit={handleSubmitException} className="space-y-4 pt-1 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-gray-900">
                    {exceptionType === 'early' ? 'Mark Early Departure' : 'Mark Overtime Departure'}
                  </h5>
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode('view');
                      setExceptionError(null);
                    }}
                    className="text-xs font-medium text-gray-500 hover:text-gray-800 cursor-pointer"
                  >
                    ← Back to Summary
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Actual Departure Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={exceptionDate}
                    onChange={(e) => {
                      setExceptionDate(e.target.value);
                      setExceptionError(null);
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 bg-white text-gray-900 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Actual Departure Time <span className="text-red-500">*</span>
                    </label>
                    {exceptionTime && (
                      <span className="text-xs font-bold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-md border border-purple-200">
                        {formatTimeTo12Hour(exceptionTime)}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="time"
                      value={formatTimeTo24Hour(exceptionTime)}
                      onChange={(e) => {
                        setExceptionTime(e.target.value);
                        setExceptionError(null);
                      }}
                      placeholder="e.g. 14:00 or 02:00 PM"
                      className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900 bg-white text-gray-900 cursor-pointer"
                      autoFocus
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Check-in was at: {formatRecordedTime(selectedWorkerForModal.checkIn)}. Departure must be strictly later.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reason / Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={exceptionReason}
                    onChange={(e) => setExceptionReason(e.target.value)}
                    placeholder="e.g. Approved early departure"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                {exceptionError && (
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{exceptionError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode('view');
                      setExceptionError(null);
                    }}
                    disabled={isSubmittingException}
                    className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingException || !exceptionTime.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-gray-900 hover:bg-black disabled:bg-gray-300 rounded-xl transition-colors shadow-2xs cursor-pointer"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
