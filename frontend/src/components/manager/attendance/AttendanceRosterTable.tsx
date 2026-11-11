import React, { useState, useMemo } from 'react';
import type {
  AttendanceRosterItem,
  WorkerCheckInExceptionType,
  IndividualCheckInPayload,
  CorrectAttendancePayload,
} from '../../../features/attendance/attendance.types';
import { calculateDelayMinutes } from '../../../features/attendance/attendanceApi';
import {
  Search,
  Filter,
  Clock,
  UserX,
  AlertCircle,
  Loader2,
  CheckCircle2,
  X,
  Lock,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

export interface WorkerExceptionState {
  type: WorkerCheckInExceptionType;
  actualArrivalTime?: string;
  delayMinutes?: number;
  error?: string;
}

export const formatLateDuration = (delayMinutes?: number | null): string => {
  if (!delayMinutes || delayMinutes <= 0) return 'Late';
  const hours = Math.floor(delayMinutes / 60);
  const mins = delayMinutes % 60;
  if (hours === 0) {
    return `${mins}m late`;
  }
  if (mins === 0) {
    return `${hours}h late`;
  }
  return `${hours}h ${mins}m late`;
};

interface AttendanceRosterTableProps {
  roster: AttendanceRosterItem[];
  exceptions: Record<string, WorkerExceptionState>;
  onExceptionChange: (workerId: string, exception: WorkerExceptionState) => void;
  onSaveWorkerCheckIn?: (workerId: string, payload: IndividualCheckInPayload) => Promise<void>;
  onCorrectAttendance?: (attendanceId: string, payload: CorrectAttendancePayload) => Promise<void>;
  disabled?: boolean;
  isEventDay?: boolean;
  eventDateFormatted?: string;
  isBeforeEventDay?: boolean;
  isAfterEventDay?: boolean;
  canNormalCorrect?: boolean;
  isAfterCorrectionDeadline?: boolean;
  eventStatus?: string;
}

export const AttendanceRosterTable: React.FC<AttendanceRosterTableProps> = ({
  roster,
  exceptions,
  onExceptionChange,
  onSaveWorkerCheckIn,
  onCorrectAttendance,
  disabled = false,
  isEventDay: _isEventDay = true,
  eventDateFormatted: _eventDateFormatted,
  isBeforeEventDay: _isBeforeEventDay,
  isAfterEventDay: _isAfterEventDay,
  canNormalCorrect: _canNormalCorrect,
  isAfterCorrectionDeadline = false,
  eventStatus: _eventStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [savedWorkerIds, setSavedWorkerIds] = useState<Set<string>>(new Set());

  // Modal State for Changing Status
  const [selectedWorkerForModal, setSelectedWorkerForModal] = useState<AttendanceRosterItem | null>(null);
  const [modalType, setModalType] = useState<WorkerCheckInExceptionType>('present');
  const [modalArrivalTime, setModalArrivalTime] = useState('');
  const [modalDelayMinutes, setModalDelayMinutes] = useState<number | null>(null);
  const [modalReason, setModalReason] = useState('Reporting time confirmed on time / exception cleared');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);

  // Unique worker types in roster
  const uniqueWorkerTypes = useMemo(() => {
    const set = new Set<string>();
    roster.forEach((r) => {
      if (r.workerType) set.add(r.workerType);
    });
    return Array.from(set).sort();
  }, [roster]);

  // Counts for filter tabs
  const counts = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;

    roster.forEach((r) => {
      const exc = exceptions[r.workerId]?.type || 'present';
      if (exc === 'present') present++;
      else if (exc === 'late') late++;
      else if (exc === 'absent') absent++;
    });

    return { total: roster.length, present, late, absent };
  }, [roster, exceptions]);

  // Filtered workers
  const filteredRoster = useMemo(() => {
    return roster.filter((item) => {
      // 1. Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = item.workerName.toLowerCase().includes(query);
        const matchesType = item.workerType.toLowerCase().includes(query);
        const matchesBid = (item.businessId || '').toLowerCase().includes(query);
        const matchesEmail = (item.workerEmail || '').toLowerCase().includes(query);
        const matchesPhone = (item.workerPhone || '').toLowerCase().includes(query);
        if (!matchesName && !matchesType && !matchesBid && !matchesEmail && !matchesPhone) {
          return false;
        }
      }

      // 2. Exception status filter
      if (statusFilter !== 'all') {
        const itemType = exceptions[item.workerId]?.type || 'present';
        if (itemType !== statusFilter) {
          return false;
        }
      }

      // 3. Worker role/type filter
      if (typeFilter !== 'all' && item.workerType !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [roster, searchTerm, statusFilter, typeFilter, exceptions]);

  // ---------------------------------------------------------
  // Modal Handlers
  // ---------------------------------------------------------
  const handleOpenModal = (worker: AttendanceRosterItem) => {
    if (disabled || worker.isStatusLocked || isAfterCorrectionDeadline) return;
    setSelectedWorkerForModal(worker);

    const currentExc = exceptions[worker.workerId] || { type: 'present' };
    setModalType(currentExc.type);

    let arrTime = currentExc.actualArrivalTime || '';
    let delay = currentExc.delayMinutes ?? null;

    if (!arrTime && worker.checkIn && worker.arrivalStatus === 'late') {
      try {
        arrTime = new Date(worker.checkIn).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        });
        delay = worker.delayMinutes ?? null;
      } catch {
        arrTime = '';
      }
    }

    setModalArrivalTime(arrTime);
    setModalDelayMinutes(delay);
    setModalReason('Reporting time confirmed on time / exception cleared');
    setModalError(null);
  };

  const handleCloseModal = () => {
    if (isSubmittingModal) return;
    setSelectedWorkerForModal(null);
    setModalError(null);
  };

  const handleModalArrivalTimeChange = (timeVal: string) => {
    setModalArrivalTime(timeVal);
    if (!selectedWorkerForModal) return;

    if (!timeVal.trim()) {
      setModalDelayMinutes(null);
      setModalError('Arrival time is required for late exceptions');
      return;
    }

    const res = calculateDelayMinutes(selectedWorkerForModal.reportingTime, timeVal);
    if (res.isValid && res.delayMinutes !== undefined && res.delayMinutes > 0) {
      setModalDelayMinutes(res.delayMinutes);
      setModalError(null);
    } else {
      setModalDelayMinutes(null);
      setModalError(res.error || `Arrival time must be after scheduled reporting time (${selectedWorkerForModal.reportingTime})`);
    }
  };

  const handleModalSubmit = async () => {
    if (!selectedWorkerForModal) return;
    const worker = selectedWorkerForModal;
    const hasSavedRecord = Boolean(worker.attendanceId || savedWorkerIds.has(worker.workerId));

    if (modalType === 'late') {
      if (!modalArrivalTime.trim()) {
        setModalError('Arrival time is required for late exceptions');
        return;
      }
      const res = calculateDelayMinutes(worker.reportingTime, modalArrivalTime);
      if (!res.isValid || !res.delayMinutes || res.delayMinutes <= 0) {
        setModalError(res.error || `Arrival time must be after scheduled reporting time (${worker.reportingTime})`);
        return;
      }
    }

    if (hasSavedRecord && modalReason.trim().length < 5) {
      setModalError('Correction reason must be at least 5 characters');
      return;
    }

    setIsSubmittingModal(true);
    setModalError(null);

    try {
      if (modalType === 'present') {
        if (hasSavedRecord && worker.attendanceId && onCorrectAttendance) {
          await onCorrectAttendance(worker.attendanceId, {
            arrivalStatus: 'on_time',
            status: 'checked_in',
            applyDefaultCheckout: true,
            reason: modalReason.trim(),
          });
        }
        onExceptionChange(worker.workerId, { type: 'present' });
        setSavedWorkerIds((prev) => new Set(prev).add(worker.workerId));
      } else if (modalType === 'late') {
        const res = calculateDelayMinutes(worker.reportingTime, modalArrivalTime);
        const delay = res.delayMinutes || 0;
        if (hasSavedRecord && worker.attendanceId && onCorrectAttendance) {
          await onCorrectAttendance(worker.attendanceId, {
            arrivalStatus: 'late',
            actualArrivalTime: modalArrivalTime.trim(),
            status: 'checked_in',
            applyDefaultCheckout: true,
            reason: modalReason.trim(),
          });
        } else if (onSaveWorkerCheckIn) {
          await onSaveWorkerCheckIn(worker.workerId, {
            arrivalStatus: 'late',
            actualArrivalTime: modalArrivalTime.trim(),
            status: 'checked_in',
          });
        }
        onExceptionChange(worker.workerId, {
          type: 'late',
          actualArrivalTime: modalArrivalTime.trim(),
          delayMinutes: delay,
        });
        setSavedWorkerIds((prev) => new Set(prev).add(worker.workerId));
      } else if (modalType === 'absent') {
        if (hasSavedRecord && worker.attendanceId && onCorrectAttendance) {
          await onCorrectAttendance(worker.attendanceId, {
            arrivalStatus: 'absent',
            status: 'absent',
            applyDefaultCheckout: true,
            reason: modalReason.trim(),
          });
        } else if (onSaveWorkerCheckIn) {
          await onSaveWorkerCheckIn(worker.workerId, {
            arrivalStatus: 'absent',
            actualArrivalTime: undefined,
            status: 'absent',
          });
        }
        onExceptionChange(worker.workerId, { type: 'absent' });
        setSavedWorkerIds((prev) => new Set(prev).add(worker.workerId));
      }

      setSelectedWorkerForModal(null);
    } catch (err: any) {
      setModalError(err.response?.data?.message || err.message || 'Failed to update attendance status');
    } finally {
      setIsSubmittingModal(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-xs">
      {/* Header & Subtitle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight">
            Assigned Workers ({roster.length})
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Click any row to record an exception if a worker arrived late or was absent.
          </p>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, type, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-lg text-xs font-normal text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2">
          <Filter size={15} className="text-gray-400 shrink-0" />
          <div className="relative flex-1 sm:flex-none sm:w-auto min-w-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full sm:w-auto appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none cursor-pointer truncate"
              aria-label="Filter by attendance status"
            >
              <option value="all">All Statuses ({counts.total})</option>
              <option value="present">On Time ({counts.present})</option>
              <option value="late">Late ({counts.late})</option>
              <option value="absent">Absent ({counts.absent})</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {uniqueWorkerTypes.length > 1 && (
            <div className="relative flex-1 sm:flex-none sm:w-auto min-w-0">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full sm:w-auto appearance-none pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none cursor-pointer truncate"
                aria-label="Filter by worker role"
              >
                <option value="all">All Roles</option>
                {uniqueWorkerTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          )}
        </div>
      </div>

      {/* Roster Table Content */}
      {filteredRoster.length === 0 ? (
        <div className="p-8 sm:p-12 text-center text-gray-500">
          <p className="text-sm font-semibold">No workers match the selected filters.</p>
          <p className="text-xs text-gray-400 mt-1">Try resetting your search query or filter options.</p>
        </div>
      ) : (
        <div className="overflow-x-auto no-scrollbar rounded-lg border border-gray-200">
          <table className="w-full text-left text-xs border-collapse min-w-[540px]">
            <thead>
              <tr className="bg-gray-50/75 border-b border-gray-200/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6">WORKER</th>
                <th className="py-3 px-3 sm:px-4">ROLE</th>
                <th className="py-3 px-3 sm:px-4">SCHEDULED SHIFT</th>
                <th className="py-3 px-3 sm:px-4">ATTENDANCE STATUS</th>
                <th className="py-3 px-3 pr-4 sm:pr-6 text-right w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRoster.map((worker) => {
                const currentExc = exceptions[worker.workerId] || { type: 'present' };
                const currentType = currentExc.type;
                const isLocked = Boolean(worker.isStatusLocked || disabled || isAfterCorrectionDeadline);

                return (
                  <tr
                    key={worker.workerId}
                    onClick={() => !isLocked && handleOpenModal(worker)}
                    className={`group transition-colors ${isLocked ? 'bg-gray-50/30 cursor-default' : 'cursor-pointer hover:bg-gray-50/70'
                      } ${currentType === 'absent'
                        ? 'bg-rose-50/15'
                        : currentType === 'late'
                          ? 'bg-amber-50/15'
                          : ''
                      }`}
                  >
                    {/* Worker Details */}
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-bold text-gray-900 text-sm group-hover:text-emerald-900 transition-colors">
                        {worker.workerName}
                      </div>
                      {worker.businessId && (
                        <div className="text-gray-500 text-xs font-mono mt-0.5">
                          {worker.businessId}
                        </div>
                      )}
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-3 sm:px-4">
                      <span className="text-xs text-gray-700 leading-tight block">
                        {worker.workerType}
                      </span>
                    </td>

                    {/* Scheduled Shift (Clean text matching mockup) */}
                    <td className="py-3.5 px-3 sm:px-4">
                      <span className="text-xs font-semibold text-gray-900">
                        {worker.reportingTime}
                      </span>
                    </td>

                    {/* Attendance Status Badge */}
                    <td className="py-3.5 px-3 sm:px-4 whitespace-nowrap">
                      {worker.isStatusLocked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-600 border border-gray-200">
                          <Lock size={12} />
                          <span>Locked</span>
                        </span>
                      ) : (
                        (worker.attendanceId || savedWorkerIds.has(worker.workerId) || worker.status === 'checked_in' || worker.status === 'absent') ? (
                          worker.status === 'absent' || worker.arrivalStatus === 'absent' ? (
                            <span className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                              <UserX size={12} className="text-rose-600" />
                              <span>Absent</span>
                            </span>
                          ) : worker.arrivalStatus === 'late' ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                              <Clock size={12} className="text-amber-600" />
                              <span>{formatLateDuration(worker.delayMinutes)}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              <span>Saved On-Time</span>
                            </span>
                          )
                        ) : currentType === 'present' ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                            <span>Present</span>
                          </span>
                        ) : currentType === 'late' ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                            <Clock size={12} className="text-amber-600" />
                            <span>{currentExc.delayMinutes ? formatLateDuration(currentExc.delayMinutes) : 'Late'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 border border-rose-200/70 px-2.5 py-1 rounded-md text-xs font-semibold">
                            <UserX size={12} className="text-rose-600" />
                            <span>Absent</span>
                          </span>
                        )
                      )}
                    </td>

                    {/* Arrow Mark / Details Button to identify user to click */}
                    <td className="py-3.5 px-3 pr-4 sm:pr-6 text-right whitespace-nowrap">
                      {!worker.isStatusLocked && (
                        <button
                          type="button"
                          aria-label="Change Status"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(worker);
                          }}
                          disabled={isLocked}
                          className="inline-flex items-center justify-center w-7 h-7 text-gray-400 group-hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Click to change status"
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Helpful Operational Disclaimer Footer */}
      <div className="p-4 sm:p-5 bg-gray-50/70 border border-gray-200 rounded-xl flex items-start gap-3">
        <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <h4 className="text-xs font-bold text-gray-900">
            Exception-Based Check-in
          </h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            By default, all workers are assumed present and on time. Click any row to record an exception if a worker arrived late or was absent.
          </p>
        </div>
      </div>

      {/* Formal Status Change Modal */}
      {selectedWorkerForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="status-modal-title"
          onClick={() => !isSubmittingModal && handleCloseModal()}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg my-auto overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/80 shrink-0">
              <div>
                <h3 id="status-modal-title" className="text-base font-bold text-gray-900">
                  Update Attendance Status
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Modify reporting status for this assigned staff member.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmittingModal}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Worker Summary Banner */}
            <div className="p-4 sm:p-5 pb-0 shrink-0">
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-900 font-bold text-sm flex items-center justify-center shrink-0 border border-emerald-200">
                    {selectedWorkerForModal.workerName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate">
                      {selectedWorkerForModal.workerName}
                    </h4>
                    <p className="text-xs text-gray-500 truncate">
                      {selectedWorkerForModal.workerType}
                      {selectedWorkerForModal.businessId ? ` · ${selectedWorkerForModal.businessId}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-gray-400 font-medium block uppercase tracking-wider">Scheduled</span>
                  <span className="text-xs font-bold text-gray-900 inline-flex items-center gap-1">
                    <Clock size={12} className="text-emerald-600" />
                    {selectedWorkerForModal.reportingTime}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Body / Status Options */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <label className="block text-xs font-bold text-gray-700">
                Select Reporting Status <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Option 1: Present (On Time) */}
                <button
                  type="button"
                  onClick={() => setModalType('present')}
                  className={`w-full text-left p-3.5 rounded-xl border cursor-pointer transition-all ${modalType === 'present'
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/10'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalType === 'present' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
                        }`}>
                        {modalType === 'present' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">
                          {Boolean(selectedWorkerForModal.attendanceId || savedWorkerIds.has(selectedWorkerForModal.workerId))
                            ? 'Change to Present'
                            : 'Present / On Time'}
                        </span>
                        <span className="text-[11px] text-gray-500">
                          Worker reported on time for scheduled shift ({selectedWorkerForModal.reportingTime}).
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      On Time
                    </span>
                  </div>
                </button>

                {/* Option 2: Late Arrival */}
                <div
                  onClick={() => setModalType('late')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${modalType === 'late'
                      ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/10'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalType === 'late' ? 'border-amber-600 bg-amber-600' : 'border-gray-300'
                        }`}>
                        {modalType === 'late' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => setModalType('late')}
                          className="text-xs font-bold text-gray-900 block text-left"
                        >
                          Mark Late
                        </button>
                        <span className="text-[11px] text-gray-500">
                          Worker arrived after scheduled reporting time.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* If Late selected: show time input */}
                  {modalType === 'late' && (
                    <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-amber-950">
                          Actual Arrival Time (HH:mm) <span className="text-rose-500">*</span>
                        </label>
                        {modalDelayMinutes !== null && modalDelayMinutes > 0 && (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-md">
                            {formatLateDuration(modalDelayMinutes)}
                          </span>
                        )}
                      </div>
                      <input
                        type="time"
                        value={modalArrivalTime}
                        onChange={(e) => handleModalArrivalTimeChange(e.target.value)}
                        placeholder="HH:mm"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-900 font-medium"
                      />
                    </div>
                  )}
                </div>

                {/* Option 3: Absent */}
                <button
                  type="button"
                  onClick={() => setModalType('absent')}
                  className={`w-full text-left p-3.5 rounded-xl border cursor-pointer transition-all ${modalType === 'absent'
                      ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/10'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${modalType === 'absent' ? 'border-rose-600 bg-rose-600' : 'border-gray-300'
                        }`}>
                        {modalType === 'absent' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-gray-900 block">Mark Absent</span>
                        <span className="text-[11px] text-gray-500">
                          Staff member did not attend this event.
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Reason field (mandatory if correcting an existing saved record in database) */}
              {Boolean(selectedWorkerForModal.attendanceId || savedWorkerIds.has(selectedWorkerForModal.workerId)) && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700">
                      Correction Reason <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-gray-400">Required for audit history</span>
                  </div>
                  <input
                    type="text"
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    placeholder="e.g. Worker arrival delayed due to traffic / reporting verified"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-800"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmittingModal}
                className="h-9 px-4 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors inline-flex items-center justify-center"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleModalSubmit}
                disabled={
                  isSubmittingModal ||
                  (modalType === 'late' && (!modalArrivalTime || modalDelayMinutes === null || modalDelayMinutes <= 0)) ||
                  (Boolean(selectedWorkerForModal.attendanceId || savedWorkerIds.has(selectedWorkerForModal.workerId)) && modalReason.trim().length < 5)
                }
                className="h-9 inline-flex items-center justify-center gap-1.5 px-4 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors"
              >
                {isSubmittingModal ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>
                    {modalType === 'present' && Boolean(selectedWorkerForModal.attendanceId || savedWorkerIds.has(selectedWorkerForModal.workerId))
                      ? 'Confirm Present'
                      : 'Confirm and Save'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
