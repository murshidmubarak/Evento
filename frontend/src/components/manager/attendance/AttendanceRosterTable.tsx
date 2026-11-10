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
  UserCheck,
  Clock,
  UserX,
  AlertCircle,
  Phone,
  Mail,
  HelpCircle,
  Check,
  Loader2,
  CheckCircle2,
  X,
  Lock,
} from 'lucide-react';

export interface WorkerExceptionState {
  type: WorkerCheckInExceptionType;
  actualArrivalTime?: string;
  delayMinutes?: number;
  error?: string;
}

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
  isEventDay = true,
  eventDateFormatted,
  isBeforeEventDay = false,
  isAfterEventDay = false,
  canNormalCorrect: _canNormalCorrect,
  isAfterCorrectionDeadline = false,
  eventStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [workerRowError, setWorkerRowError] = useState<{ workerId: string; message: string } | null>(null);
  const [savedWorkerIds, setSavedWorkerIds] = useState<Set<string>>(new Set());

  // Present Confirmation Modal State (§3)
  const [presentConfirmWorker, setPresentConfirmWorker] = useState<AttendanceRosterItem | null>(null);
  const [presentCorrectionReason, setPresentCorrectionReason] = useState(
    'Reporting time confirmed on time / exception cleared'
  );
  const [isSubmittingPresent, setIsSubmittingPresent] = useState(false);
  const [presentConfirmError, setPresentConfirmError] = useState<string | null>(null);

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
      const excType = exceptions[item.workerId]?.type || 'present';
      if (statusFilter !== 'all' && excType !== statusFilter) {
        return false;
      }

      // 3. Worker type filter
      if (typeFilter !== 'all' && item.workerType !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [roster, searchTerm, statusFilter, typeFilter, exceptions]);

  const handleSelectType = (worker: AttendanceRosterItem, newType: WorkerCheckInExceptionType) => {
    if (disabled) return;

    if (workerRowError?.workerId === worker.workerId) {
      setWorkerRowError(null);
    }

    if (newType === 'present') {
      onExceptionChange(worker.workerId, { type: 'present' });
    } else if (newType === 'absent') {
      onExceptionChange(worker.workerId, { type: 'absent' });
    } else if (newType === 'late') {
      // Retain previous arrival time if available
      const prev = exceptions[worker.workerId];
      let initialTime = prev?.actualArrivalTime || '';
      if (!initialTime && worker.checkIn) {
        try {
          initialTime = new Date(worker.checkIn).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          });
        } catch {
          initialTime = '';
        }
      }
      let delayMinutes: number | undefined;
      let error: string | undefined;

      if (initialTime) {
        const res = calculateDelayMinutes(worker.reportingTime, initialTime);
        delayMinutes = res.isValid ? res.delayMinutes : undefined;
        error = res.isValid ? undefined : res.error;
      } else {
        error = 'Arrival time is required for late exceptions';
      }

      onExceptionChange(worker.workerId, {
        type: 'late',
        actualArrivalTime: initialTime,
        delayMinutes,
        error,
      });
    }
  };

  const handleArrivalTimeChange = (worker: AttendanceRosterItem, arrivalTime: string) => {
    if (disabled) return;

    if (workerRowError?.workerId === worker.workerId) {
      setWorkerRowError(null);
    }

    if (!arrivalTime.trim()) {
      onExceptionChange(worker.workerId, {
        type: 'late',
        actualArrivalTime: '',
        delayMinutes: undefined,
        error: 'Arrival time is required for late exceptions',
      });
      return;
    }

    const res = calculateDelayMinutes(worker.reportingTime, arrivalTime);
    onExceptionChange(worker.workerId, {
      type: 'late',
      actualArrivalTime: arrivalTime,
      delayMinutes: res.isValid ? res.delayMinutes : undefined,
      error: res.isValid ? undefined : res.error,
    });
  };

  const handleConfirmAndSave = async (worker: AttendanceRosterItem) => {
    const currentExc = exceptions[worker.workerId] || { type: 'present' };

    if (currentExc.type === 'late' && (!currentExc.actualArrivalTime || currentExc.error)) {
      return;
    }

    setSavingWorkerId(worker.workerId);
    setWorkerRowError(null);

    try {
      if (worker.attendanceId && onCorrectAttendance) {
        // Operation 2: Existing record update -> use correction API!
        await onCorrectAttendance(worker.attendanceId, {
          arrivalStatus: currentExc.type === 'present' ? 'on_time' : currentExc.type === 'late' ? 'late' : 'absent',
          actualArrivalTime: currentExc.type === 'late' ? currentExc.actualArrivalTime?.trim() : undefined,
          status: currentExc.type === 'absent' ? 'absent' : 'checked_in',
          applyDefaultCheckout: true,
          reason: 'Manager adjusted attendance exception in roster',
        });
      } else if (onSaveWorkerCheckIn) {
        // Operation 1: Initial Late/Absent marking -> use initial check-in API!
        const payload: IndividualCheckInPayload = {
          arrivalStatus: currentExc.type === 'present' ? 'on_time' : currentExc.type === 'late' ? 'late' : 'absent',
          actualArrivalTime: currentExc.type === 'late' ? currentExc.actualArrivalTime?.trim() : undefined,
          status: currentExc.type === 'absent' ? 'absent' : 'checked_in',
        };
        await onSaveWorkerCheckIn(worker.workerId, payload);
      }
      setSavedWorkerIds((prev) => new Set(prev).add(worker.workerId));
    } catch (err: any) {
      setWorkerRowError({
        workerId: worker.workerId,
        message: err.response?.data?.message || err.message || 'Failed to save individual check-in',
      });
    } finally {
      setSavingWorkerId(null);
    }
  };

  const handleInitiateChangeToPresent = (worker: AttendanceRosterItem) => {
    if (disabled || worker.isStatusLocked) return;

    const hasSavedRecord = Boolean(worker.attendanceId || savedWorkerIds.has(worker.workerId));
    if (hasSavedRecord) {
      setPresentConfirmWorker(worker);
      setPresentCorrectionReason('Reporting time confirmed on time / exception cleared');
      setPresentConfirmError(null);
    } else {
      // Local draft: directly revert to default present baseline
      handleSelectType(worker, 'present');
    }
  };

  const handleConfirmPresentCorrection = async () => {
    if (!presentConfirmWorker) return;
    if (presentCorrectionReason.trim().length < 5) {
      setPresentConfirmError('Correction reason must be at least 5 characters');
      return;
    }

    setIsSubmittingPresent(true);
    setPresentConfirmError(null);

    try {
      if (presentConfirmWorker.attendanceId && onCorrectAttendance) {
        await onCorrectAttendance(presentConfirmWorker.attendanceId, {
          arrivalStatus: 'on_time',
          status: 'checked_in',
          applyDefaultCheckout: true,
          reason: presentCorrectionReason.trim(),
        });
      }
      onExceptionChange(presentConfirmWorker.workerId, { type: 'present' });
      setSavedWorkerIds((prev) => new Set(prev).add(presentConfirmWorker.workerId));
      setPresentConfirmWorker(null);
    } catch (err: any) {
      setPresentConfirmError(
        err.response?.data?.message || err.message || 'Failed to update attendance to Present'
      );
    } finally {
      setIsSubmittingPresent(false);
    }
  };

  const handleCancelDraft = (worker: AttendanceRosterItem) => {
    if (worker.status === 'absent' || worker.arrivalStatus === 'absent') {
      onExceptionChange(worker.workerId, { type: 'absent' });
    } else if (worker.arrivalStatus === 'late') {
      const arrTime = worker.checkIn
        ? new Date(worker.checkIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
        : '';
      onExceptionChange(worker.workerId, {
        type: 'late',
        actualArrivalTime: arrTime,
        delayMinutes: worker.delayMinutes,
      });
    } else {
      onExceptionChange(worker.workerId, { type: 'present' });
    }
    setWorkerRowError(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
      {/* Event Day Notice Banner */}
      {!isEventDay && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2.5 text-xs text-amber-900">
          <AlertCircle size={16} className="text-amber-700 shrink-0" />
          {isBeforeEventDay ? (
            <span>
              <strong>Notice:</strong> Initial attendance marking is only available on the scheduled event day
              {eventDateFormatted ? ` (${eventDateFormatted})` : ''}. Actions are currently disabled.
            </span>
          ) : isAfterEventDay ? (
            <span>
              <strong>Notice:</strong> Initial attendance marking is closed for this event (event date was
              {eventDateFormatted ? ` ${eventDateFormatted}` : ''}).
            </span>
          ) : (
            <span>
              <strong>Notice:</strong> Attendance exception marking is only permitted on the scheduled event day.
            </span>
          )}
        </div>
      )}

      {/* Completed Event Notice Banner (§4) */}
      {eventStatus === 'completed' && !isAfterCorrectionDeadline && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center gap-2.5 text-xs text-blue-900">
          <Clock size={16} className="text-blue-700 shrink-0" />
          <span>
            <strong>Notice:</strong> This event is completed. Live initial check-in is closed, but existing attendance records can be corrected within the 24-hour correction window.
          </span>
        </div>
      )}

      {/* Correction Deadline Expired Banner (§4) */}
      {isAfterCorrectionDeadline && (
        <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center gap-2.5 text-xs text-gray-800">
          <Lock size={16} className="text-gray-600 shrink-0" />
          <span>
            <strong>Notice:</strong> The 24-hour normal attendance correction period has expired. Records are locked from normal editing.
          </span>
        </div>
      )}

      {/* Header Toolbar: Search & Filters */}
      <div className="p-4 sm:p-5 border-b border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 tracking-tight">
              Assigned Worker Roster ({roster.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Review assigned staff and mark any exceptions. Workers not marked late or absent default to On Time.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name, type, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-gray-800"
            />
          </div>
        </div>

        {/* Filter Tabs & Worker Type Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-gray-900 text-white shadow-2xs'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
              }`}
            >
              All ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('present')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                statusFilter === 'present'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
              }`}
            >
              <UserCheck size={13} />
              Default Present ({counts.present})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('late')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                statusFilter === 'late'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100/80 border border-amber-200/60'
              }`}
            >
              <Clock size={13} />
              Late ({counts.late})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('absent')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                statusFilter === 'absent'
                  ? 'bg-rose-700 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100/80 border border-rose-200/60'
              }`}
            >
              <UserX size={13} />
              Absent ({counts.absent})
            </button>
          </div>

          {/* Type Filter */}
          {uniqueWorkerTypes.length > 1 && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Filter size={13} className="text-gray-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="all">All Worker Roles</option>
                {uniqueWorkerTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Roster Table Content */}
      {filteredRoster.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="text-sm font-semibold">No workers match the selected filters.</p>
          <p className="text-xs text-gray-400 mt-1">Try resetting your search query or filter options.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200/80 text-gray-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 sm:px-6">Worker</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Scheduled Shift</th>
                <th className="py-3.5 px-4">Attendance Exception</th>
                <th className="py-3.5 px-4 sm:px-6">Actual Arrival / Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRoster.map((worker) => {
                const currentExc = exceptions[worker.workerId] || { type: 'present' };
                const currentType = currentExc.type;

                return (
                  <tr
                    key={worker.workerId}
                    className={`transition-colors hover:bg-gray-50/60 ${
                      currentType === 'absent'
                        ? 'bg-rose-50/20'
                        : currentType === 'late'
                        ? 'bg-amber-50/20'
                        : ''
                    }`}
                  >
                    {/* Worker Details */}
                    <td className="py-4 px-4 sm:px-6">
                      <div className="font-bold text-gray-900 text-sm">{worker.workerName}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-gray-500 text-[11px]">
                        {worker.businessId && (
                          <span className="font-mono bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded font-medium">
                            {worker.businessId}
                          </span>
                        )}
                        {worker.workerPhone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={10} className="text-gray-400" />
                            {worker.workerPhone}
                          </span>
                        )}
                        {worker.workerEmail && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[150px]">
                            <Mail size={10} className="text-gray-400" />
                            {worker.workerEmail}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Worker Type */}
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200/80">
                        {worker.workerType}
                      </span>
                    </td>

                    {/* Reporting Time */}
                    <td className="py-4 px-4">
                      <div className="inline-flex items-center gap-1.5 font-semibold text-gray-900 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-200/60">
                        <Clock size={13} className="text-emerald-600" />
                        <span>{worker.reportingTime}</span>
                      </div>
                    </td>

                    {/* Exception Actions (Late, Absent, Present) */}
                    <td className="py-4 px-4">
                      {worker.isStatusLocked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-500 border border-gray-200">
                          <Lock size={12} />
                          <span>Locked</span>
                        </span>
                      ) : currentType === 'present' ? (
                        (worker.attendanceId || savedWorkerIds.has(worker.workerId)) ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-600 text-white shadow-2xs">
                              Present
                            </span>
                            <button
                              type="button"
                              disabled={disabled || isAfterCorrectionDeadline}
                              onClick={() => handleSelectType(worker, 'late')}
                              className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-amber-700 hover:bg-amber-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                              title="Switch to Late"
                            >
                              Change to Late
                            </button>
                            <button
                              type="button"
                              disabled={disabled || isAfterCorrectionDeadline}
                              onClick={() => handleSelectType(worker, 'absent')}
                              className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-rose-700 hover:bg-rose-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                              title="Switch to Absent"
                            >
                              Change to Absent
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={disabled || isEventDay === false || eventStatus === 'completed'}
                              onClick={() => handleSelectType(worker, 'late')}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                eventStatus === 'completed'
                                  ? 'Event is completed'
                                  : isEventDay === false
                                  ? 'Attendance marking is only allowed on event day'
                                  : 'Mark worker as Late'
                              }
                            >
                              Mark Late
                            </button>
                            <button
                              type="button"
                              disabled={disabled || isEventDay === false || eventStatus === 'completed'}
                              onClick={() => handleSelectType(worker, 'absent')}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title={
                                eventStatus === 'completed'
                                  ? 'Event is completed'
                                  : isEventDay === false
                                  ? 'Attendance marking is only allowed on event day'
                                  : 'Mark worker as Absent'
                              }
                            >
                              Mark Absent
                            </button>
                          </div>
                        )
                      ) : currentType === 'late' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-amber-500 text-white shadow-2xs">
                            Late
                          </span>
                          <button
                            type="button"
                            disabled={disabled || isAfterCorrectionDeadline}
                            onClick={() => handleInitiateChangeToPresent(worker)}
                            className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                            title="Change to Present"
                          >
                            Change to Present
                          </button>
                          <button
                            type="button"
                            disabled={disabled || isAfterCorrectionDeadline}
                            onClick={() => handleSelectType(worker, 'absent')}
                            className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-rose-700 hover:bg-rose-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                            title="Switch to Absent"
                          >
                            Change to Absent
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-rose-600 text-white shadow-2xs">
                            Absent
                          </span>
                          <button
                            type="button"
                            disabled={disabled || isAfterCorrectionDeadline}
                            onClick={() => handleInitiateChangeToPresent(worker)}
                            className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                            title="Change to Present"
                          >
                            Change to Present
                          </button>
                          <button
                            type="button"
                            disabled={disabled || isAfterCorrectionDeadline}
                            onClick={() => handleSelectType(worker, 'late')}
                            className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-amber-700 hover:bg-amber-50 rounded border border-gray-200 transition-colors disabled:opacity-40"
                            title="Switch to Late"
                          >
                            Change to Late
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Actual Arrival Time / Status Column */}
                    <td className="py-4 px-4 sm:px-6">
                      {/* Saved Database Status Badge */}
                      {(worker.attendanceId || savedWorkerIds.has(worker.workerId) || worker.status === 'checked_in' || worker.status === 'absent') && (
                        <div className="mb-1.5">
                          {worker.status === 'absent' || worker.arrivalStatus === 'absent' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                              <UserX size={10} /> Saved Absent
                            </span>
                          ) : worker.arrivalStatus === 'late' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={10} /> Saved Late ({worker.delayMinutes}m delay)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 size={10} /> Saved On-Time
                            </span>
                          )}
                        </div>
                      )}

                      {currentType === 'present' && !worker.attendanceId && !savedWorkerIds.has(worker.workerId) && (
                        <div className="text-gray-500 text-xs flex items-center gap-1.5">
                          <UserCheck size={14} className="text-emerald-600" />
                          <span className="font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Present / On Time (Default)
                          </span>
                        </div>
                      )}

                      {currentType === 'absent' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <UserX size={13} />
                          <span>Absent — Check-in omitted</span>
                        </div>
                      )}

                      {currentType === 'late' && (
                        <div className="space-y-1 max-w-xs">
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              disabled={disabled}
                              value={currentExc.actualArrivalTime || ''}
                              onChange={(e) => handleArrivalTimeChange(worker, e.target.value)}
                              className={`px-2 py-1 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 transition-all font-mono font-medium ${
                                currentExc.error
                                  ? 'border-rose-400 focus:ring-rose-400 text-rose-900 bg-rose-50/30'
                                  : 'border-amber-300 focus:ring-amber-500 text-gray-900'
                              }`}
                              placeholder="HH:mm"
                            />
                            {currentExc.delayMinutes !== undefined && !currentExc.error && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                +{currentExc.delayMinutes} min late
                              </span>
                            )}
                          </div>
                          {currentExc.error && (
                            <div className="text-[11px] text-rose-600 flex items-center gap-1 font-medium">
                              <AlertCircle size={12} className="shrink-0" />
                              <span>{currentExc.error}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Confirm and Save / Cancel individual check-in controls */}
                      {onSaveWorkerCheckIn && currentType !== 'present' && (
                        <div className="flex items-center gap-2 mt-2 pt-1 border-t border-gray-100">
                          <button
                            type="button"
                            disabled={
                              disabled ||
                              savingWorkerId === worker.workerId ||
                              (currentType === 'late' && (!!currentExc.error || !currentExc.actualArrivalTime))
                            }
                            onClick={() => handleConfirmAndSave(worker)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {savingWorkerId === worker.workerId ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : (
                              <>
                                <Check size={11} />
                                <span>Confirm and Save</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={disabled || savingWorkerId === worker.workerId}
                            onClick={() => handleCancelDraft(worker)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <X size={11} />
                            <span>Cancel</span>
                          </button>
                        </div>
                      )}

                      {workerRowError && workerRowError.workerId === worker.workerId && (
                        <p className="text-[11px] text-rose-600 mt-1 font-medium">{workerRowError.message}</p>
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
      <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-start gap-2.5 text-xs text-gray-500">
        <HelpCircle size={16} className="text-gray-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Exception-Based Check-in:</strong> By default, all workers are assumed present and on time.
          You only need to log exceptions for workers who arrived late or did not show up.
          During finalization, the backend records default arrival timestamps matching each worker's scheduled shift.
        </p>
      </div>

      {/* Change to Present Confirmation Modal */}
      {presentConfirmWorker && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 size={20} />
                <h3 className="font-bold text-gray-900 text-base">Change to Present (On Time)</h3>
              </div>
              <button
                type="button"
                onClick={() => setPresentConfirmWorker(null)}
                disabled={isSubmittingPresent}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Worker summary */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/70 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Worker:</span>
                  <span className="font-bold text-gray-800">{presentConfirmWorker.workerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Role:</span>
                  <span className="font-semibold text-gray-700">{presentConfirmWorker.workerType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Scheduled Reporting Time:</span>
                  <span className="font-semibold text-emerald-700 font-mono">{presentConfirmWorker.reportingTime}</span>
                </div>
              </div>

              {/* Informative notice */}
              <p className="text-xs text-gray-600 leading-relaxed bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                Changing status to <strong>Present</strong> will record the worker's arrival as on-time (reporting time <span className="font-mono">{presentConfirmWorker.reportingTime}</span>) with <strong>0 minutes delay</strong>, clearing any previously logged absence or late penalties.
              </p>

              {/* Reason input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Correction Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={presentCorrectionReason}
                  onChange={(e) => setPresentCorrectionReason(e.target.value)}
                  disabled={isSubmittingPresent}
                  placeholder="Explain why worker is being marked present (min 5 characters)..."
                  rows={2}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {presentConfirmError && (
                <div className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{presentConfirmError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPresentConfirmWorker(null)}
                disabled={isSubmittingPresent}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPresentCorrection}
                disabled={isSubmittingPresent || presentCorrectionReason.trim().length < 5}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {isSubmittingPresent ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Confirm Present</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
