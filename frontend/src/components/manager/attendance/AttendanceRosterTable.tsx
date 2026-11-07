import React, { useState, useMemo } from 'react';
import type {
  AttendanceRosterItem,
  WorkerCheckInExceptionType,
  IndividualCheckInPayload,
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
  disabled?: boolean;
}

export const AttendanceRosterTable: React.FC<AttendanceRosterTableProps> = ({
  roster,
  exceptions,
  onExceptionChange,
  onSaveWorkerCheckIn,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [workerRowError, setWorkerRowError] = useState<{ workerId: string; message: string } | null>(null);
  const [savedWorkerIds, setSavedWorkerIds] = useState<Set<string>>(new Set());

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
    if (!onSaveWorkerCheckIn) return;
    const currentExc = exceptions[worker.workerId] || { type: 'present' };

    if (currentExc.type === 'late' && (!currentExc.actualArrivalTime || currentExc.error)) {
      return;
    }

    setSavingWorkerId(worker.workerId);
    setWorkerRowError(null);

    try {
      const payload: IndividualCheckInPayload = {
        arrivalStatus: currentExc.type === 'present' ? 'on_time' : currentExc.type === 'late' ? 'late' : 'absent',
        actualArrivalTime: currentExc.type === 'late' ? currentExc.actualArrivalTime?.trim() : undefined,
        status: currentExc.type === 'absent' ? 'absent' : 'checked_in',
      };
      await onSaveWorkerCheckIn(worker.workerId, payload);
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

                    {/* Exception Toggle (Present, Late, Absent) */}
                    <td className="py-4 px-4">
                      <div className="inline-flex items-center p-0.5 bg-gray-100 rounded-lg border border-gray-200">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelectType(worker, 'present')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            currentType === 'present'
                              ? 'bg-white text-emerald-700 shadow-2xs font-bold border border-emerald-200'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                          title="No exception — Worker arrived on time"
                        >
                          On Time
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelectType(worker, 'late')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            currentType === 'late'
                              ? 'bg-amber-500 text-white shadow-2xs font-bold'
                              : 'text-gray-600 hover:text-amber-800'
                          }`}
                          title="Record late arrival exception"
                        >
                          Late
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelectType(worker, 'absent')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                            currentType === 'absent'
                              ? 'bg-rose-600 text-white shadow-2xs font-bold'
                              : 'text-gray-600 hover:text-rose-800'
                          }`}
                          title="Mark worker as absent"
                        >
                          Absent
                        </button>
                      </div>
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

                      {currentType === 'present' && (
                        <div className="text-gray-500 text-xs flex items-center gap-1.5">
                          <UserCheck size={14} className="text-emerald-600" />
                          <span>Will be recorded as {worker.reportingTime} (Default)</span>
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
                      {onSaveWorkerCheckIn && (
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
    </div>
  );
};
