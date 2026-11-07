import React from 'react';
import type { AttendanceRosterItem, WorkerCheckOutExceptionType } from '../../../features/attendance/attendance.types';
import {
  calculateEarlyDepartureMinutes,
  calculateOvertimeMinutes,
  parseTimeToMinutes,
} from '../../../features/attendance/attendanceApi';
import {
  Clock,
  AlertCircle,
  Sparkles,
  Search,
} from 'lucide-react';

export interface WorkerCheckOutExceptionState {
  type: WorkerCheckOutExceptionType;
  actualCheckoutTime?: string;
  error?: string;
  previewText?: string;
}

interface CheckoutRosterTableProps {
  roster: AttendanceRosterItem[];
  defaultFinishTime: string;
  categoryFinishTimes?: Record<string, string>;
  overrides: Record<string, string>;
  exceptions: Record<string, WorkerCheckOutExceptionState>;
  onExceptionChange: (workerId: string, state: WorkerCheckOutExceptionState) => void;
  disabled?: boolean;
}

export const CheckoutRosterTable: React.FC<CheckoutRosterTableProps> = ({
  roster,
  defaultFinishTime,
  categoryFinishTimes,
  overrides,
  exceptions,
  onExceptionChange,
  disabled = false,
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const formatRecordedTime = (timeVal: string | Date | null | undefined): string => {
    if (!timeVal) return '—';
    try {
      const d = new Date(timeVal);
      if (isNaN(d.getTime())) return String(timeVal);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(timeVal);
    }
  };

  const handleTypeToggle = (worker: AttendanceRosterItem, newType: WorkerCheckOutExceptionType) => {
    if (disabled || worker.arrivalStatus === 'absent' || worker.status === 'absent') return;

    const applicableFinish =
      overrides[worker.requirementId] ||
      categoryFinishTimes?.[worker.workerType] ||
      defaultFinishTime ||
      '';
    const checkInStr = formatRecordedTime(worker.checkIn);

    if (newType === 'normal') {
      onExceptionChange(worker.workerId, {
        type: 'normal',
      });
      return;
    }

    const currentExc = exceptions[worker.workerId];
    const timeVal = currentExc?.actualCheckoutTime || '';

    if (newType === 'early') {
      const calc = timeVal ? calculateEarlyDepartureMinutes(applicableFinish, timeVal, checkInStr) : { isValid: true, earlyMinutes: 0 };
      onExceptionChange(worker.workerId, {
        type: 'early',
        actualCheckoutTime: timeVal,
        error: calc.error,
        previewText: calc.previewText,
      });
    } else if (newType === 'overtime') {
      const calc = timeVal ? calculateOvertimeMinutes(applicableFinish, timeVal, checkInStr) : { isValid: true, overtimeMinutes: 0 };
      onExceptionChange(worker.workerId, {
        type: 'overtime',
        actualCheckoutTime: timeVal,
        error: calc.error,
        previewText: calc.previewText,
      });
    }
  };

  const handleTimeInputChange = (worker: AttendanceRosterItem, timeVal: string) => {
    if (disabled) return;
    const applicableFinish =
      overrides[worker.requirementId] ||
      categoryFinishTimes?.[worker.workerType] ||
      defaultFinishTime ||
      '';
    const checkInStr = formatRecordedTime(worker.checkIn);
    const currentExc = exceptions[worker.workerId];
    const type = currentExc?.type || 'early';

    if (type === 'early') {
      const calc = calculateEarlyDepartureMinutes(applicableFinish, timeVal, checkInStr);
      onExceptionChange(worker.workerId, {
        type: 'early',
        actualCheckoutTime: timeVal,
        error: calc.error,
        previewText: calc.previewText,
      });
    } else if (type === 'overtime') {
      const calc = calculateOvertimeMinutes(applicableFinish, timeVal, checkInStr);
      onExceptionChange(worker.workerId, {
        type: 'overtime',
        actualCheckoutTime: timeVal,
        error: calc.error,
        previewText: calc.previewText,
      });
    }
  };

  const filteredRoster = React.useMemo(() => {
    if (!searchTerm.trim()) return roster;
    const query = searchTerm.toLowerCase().trim();
    return roster.filter(
      (r) =>
        r.workerName.toLowerCase().includes(query) ||
        r.workerType.toLowerCase().includes(query) ||
        (r.businessId || '').toLowerCase().includes(query)
    );
  }, [roster, searchTerm]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Checkout Roster & Exceptions</h3>
          <p className="text-xs text-gray-500">
            Workers default to normal checkout at their applicable finishing time unless flagged early or overtime.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search workers or roles..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Roster Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Staff Member</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Check-in Status</th>
              <th className="py-3 px-3">Applicable Finish Time</th>
              <th className="py-3 px-4">Checkout Exception Selection</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-medium">
            {filteredRoster.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400 text-xs">
                  No workers found matching your search.
                </td>
              </tr>
            ) : (
              filteredRoster.map((worker) => {
                const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';
                const exc = exceptions[worker.workerId];
                const selectedType: WorkerCheckOutExceptionType = exc?.type || 'normal';
                const applicableFinish =
                  overrides[worker.requirementId] ||
                  categoryFinishTimes?.[worker.workerType] ||
                  defaultFinishTime ||
                  '—';
                const hasOverride = Boolean(overrides[worker.requirementId]);
                const hasCategoryFinish = Boolean(!hasOverride && categoryFinishTimes?.[worker.workerType]);

                return (
                  <tr
                    key={worker.workerId}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isAbsent ? 'bg-gray-50/40 text-gray-400' : ''
                    }`}
                  >
                    {/* Worker Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isAbsent
                              ? 'bg-gray-100 text-gray-400'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                          }`}
                        >
                          {worker.workerName.charAt(0)}
                        </div>
                        <div>
                          <span
                            className={`font-bold block ${
                              isAbsent ? 'text-gray-400 line-through' : 'text-gray-900'
                            }`}
                          >
                            {worker.workerName}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {worker.businessId || 'WRK-AUTO'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-3">
                      <span className="text-gray-700 font-medium block">{worker.workerType}</span>
                      <span className="text-[10px] text-gray-400">Rep: {worker.reportingTime}</span>
                    </td>

                    {/* Check-in Status */}
                    <td className="py-3.5 px-3">
                      {isAbsent ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Absent
                        </span>
                      ) : worker.arrivalStatus === 'late' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Late ({worker.delayMinutes}m delay)
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            In: {formatRecordedTime(worker.checkIn)}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            On Time
                          </span>
                          <span className="text-[10px] text-gray-500 block">
                            In: {formatRecordedTime(worker.checkIn)}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Applicable Normal Finish Time */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-0.5">
                        <span className="font-bold text-gray-900 text-xs inline-flex items-center gap-1">
                          {applicableFinish}
                          {(() => {
                            const repMins = parseTimeToMinutes(worker.reportingTime);
                            const finMins = parseTimeToMinutes(applicableFinish);
                            if (repMins !== null && finMins !== null && finMins <= repMins) {
                              return (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                  +1 Day
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </span>
                        {hasOverride ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 block w-fit">
                            Override
                          </span>
                        ) : hasCategoryFinish ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 block w-fit">
                            Category
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Checkout Selection Controls */}
                    <td className="py-3.5 px-4">
                      {isAbsent ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-semibold italic">
                          <span>Absent — Excluded from checkout</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Segmented Button Group */}
                          <div className="inline-flex rounded-xl bg-gray-100 p-0.5 border border-gray-200/80">
                            {/* Normal / Default Button */}
                            <button
                              type="button"
                              onClick={() => handleTypeToggle(worker, 'normal')}
                              disabled={disabled}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                                selectedType === 'normal'
                                  ? 'bg-white text-emerald-800 shadow-2xs font-extrabold'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Normal (Default)
                            </button>

                            {/* Early Departure Button */}
                            <button
                              type="button"
                              onClick={() => handleTypeToggle(worker, 'early')}
                              disabled={disabled}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                                selectedType === 'early'
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Early Departure
                            </button>

                            {/* Overtime Button */}
                            <button
                              type="button"
                              onClick={() => handleTypeToggle(worker, 'overtime')}
                              disabled={disabled}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                                selectedType === 'overtime'
                                  ? 'bg-purple-600 text-white shadow-2xs'
                                  : 'text-gray-600 hover:text-gray-900'
                              }`}
                            >
                              Overtime
                            </button>
                          </div>

                          {/* Normal Default Subtext */}
                          {selectedType === 'normal' && (
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold">
                              <Sparkles size={11} className="text-emerald-600" />
                              <span>
                                System default checkout at <strong>{applicableFinish}</strong>
                              </span>
                            </div>
                          )}

                          {/* Early Departure Input */}
                          {selectedType === 'early' && (
                            <div className="space-y-1 max-w-xs">
                              <div className="relative">
                                <Clock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="text"
                                  value={exc?.actualCheckoutTime || ''}
                                  onChange={(e) => handleTimeInputChange(worker, e.target.value)}
                                  disabled={disabled}
                                  placeholder="Departure Time (e.g. 15:30)"
                                  className={`w-full pl-7 pr-3 py-1 text-xs rounded-lg border bg-white focus:outline-none ${
                                    exc?.error
                                      ? 'border-rose-300 text-rose-900'
                                      : 'border-amber-300 text-gray-900'
                                  }`}
                                />
                              </div>
                              {exc?.error ? (
                                <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                                  <AlertCircle size={10} />
                                  {exc.error}
                                </p>
                              ) : exc?.previewText ? (
                                <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1">
                                  <Clock size={10} />
                                  {exc.previewText}
                                </p>
                              ) : null}
                            </div>
                          )}

                          {/* Overtime Input */}
                          {selectedType === 'overtime' && (
                            <div className="space-y-1 max-w-xs">
                              <div className="relative">
                                <Clock size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="text"
                                  value={exc?.actualCheckoutTime || ''}
                                  onChange={(e) => handleTimeInputChange(worker, e.target.value)}
                                  disabled={disabled}
                                  placeholder="Checkout Time (e.g. 21:00)"
                                  className={`w-full pl-7 pr-3 py-1 text-xs rounded-lg border bg-white focus:outline-none ${
                                    exc?.error
                                      ? 'border-rose-300 text-rose-900'
                                      : 'border-purple-300 text-gray-900'
                                  }`}
                                />
                              </div>
                              {exc?.error ? (
                                <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                                  <AlertCircle size={10} />
                                  {exc.error}
                                </p>
                              ) : exc?.previewText ? (
                                <p className="text-[10px] text-purple-700 font-bold flex items-center gap-1">
                                  <Clock size={10} />
                                  {exc.previewText}
                                </p>
                              ) : null}
                            </div>
                          )}
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
    </div>
  );
};
