import React, { useState } from 'react';
import type { AttendanceRosterRequirementItem } from '../../../features/attendance/attendance.types';
import { parseTimeToMinutes } from '../../../features/attendance/attendanceApi';
import { Clock, Plus, Trash2, Sliders, CheckCircle2, AlertCircle } from 'lucide-react';

interface CheckoutFinishingTimeCardProps {
  defaultFinishTime: string;
  onDefaultFinishTimeChange: (time: string) => void;
  defaultFinishTimeError?: string;
  categoryFinishTimes?: Record<string, string>; // workerType -> finishTime
  onCategoryFinishTimesChange?: (categoryTimes: Record<string, string>) => void;
  categoryErrors?: Record<string, string>;
  overrides: Record<string, string>; // requirementId -> finishTime
  onOverridesChange: (overrides: Record<string, string>) => void;
  requirements: AttendanceRosterRequirementItem[];
  disabled?: boolean;
}

export const CheckoutFinishingTimeCard: React.FC<CheckoutFinishingTimeCardProps> = ({
  defaultFinishTime,
  onDefaultFinishTimeChange,
  defaultFinishTimeError,
  categoryFinishTimes = {},
  onCategoryFinishTimesChange,
  categoryErrors = {},
  overrides,
  onOverridesChange,
  requirements,
  disabled = false,
}) => {
  const [selectedReqId, setSelectedReqId] = useState<string>('');
  const [overrideTimeInput, setOverrideTimeInput] = useState<string>('');
  const [overrideInputError, setOverrideInputError] = useState<string | null>(null);

  // Distinct worker categories with assigned workers
  const distinctCategories = React.useMemo(() => {
    const map = new Map<string, { workerType: string; assignedCount: number; reportingTimes: string[] }>();
    requirements.forEach((req) => {
      const key = req.workerType;
      if (!map.has(key)) {
        map.set(key, {
          workerType: key,
          assignedCount: req.assignedCount,
          reportingTimes: [req.reportingTime],
        });
      } else {
        const existing = map.get(key)!;
        existing.assignedCount += req.assignedCount;
        if (!existing.reportingTimes.includes(req.reportingTime)) {
          existing.reportingTimes.push(req.reportingTime);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.workerType.localeCompare(b.workerType));
  }, [requirements]);

  const handleCategoryChange = (workerType: string, time: string) => {
    if (!onCategoryFinishTimesChange) return;
    onCategoryFinishTimesChange({
      ...categoryFinishTimes,
      [workerType]: time,
    });
  };

  const handleApplyDefaultToAllCategories = () => {
    if (!onCategoryFinishTimesChange || !defaultFinishTime.trim()) return;
    const newCatTimes: Record<string, string> = {};
    distinctCategories.forEach((cat) => {
      newCatTimes[cat.workerType] = defaultFinishTime.trim();
    });
    onCategoryFinishTimesChange(newCatTimes);
  };

  const handleAddOverride = () => {
    if (!selectedReqId) {
      setOverrideInputError('Please select a work requirement');
      return;
    }
    if (!overrideTimeInput.trim() || parseTimeToMinutes(overrideTimeInput) === null) {
      setOverrideInputError('Please enter a valid finish time (e.g. 19:00 or 07:00 PM)');
      return;
    }

    setOverrideInputError(null);
    onOverridesChange({
      ...overrides,
      [selectedReqId]: overrideTimeInput.trim(),
    });
    setSelectedReqId('');
    setOverrideTimeInput('');
  };

  const handleRemoveOverride = (reqId: string) => {
    const updated = { ...overrides };
    delete updated[reqId];
    onOverridesChange(updated);
  };

  // Requirements that do not yet have an override configured
  const availableReqsForOverride = requirements.filter((r) => !overrides[r.requirementId]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/80 shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Normal Work Finishing Time</h3>
            <p className="text-xs text-gray-500">
              Set the event-level default finishing time and optional requirement-level overrides.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold rounded-full self-start sm:self-auto">
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span>Hybrid Finishing Time Model</span>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* Event-Level Default Finishing Time Input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="event-default-finish" className="block text-xs font-bold text-gray-900">
              Event Default Normal Finishing Time <span className="text-rose-600">*</span>
            </label>
            <span className="text-[11px] text-gray-400">Applies to all workers without an override</span>
          </div>

          <div className="flex items-center gap-3 max-w-sm">
            <div className="relative flex-1">
              <input
                id="event-default-finish"
                type="text"
                value={defaultFinishTime}
                onChange={(e) => onDefaultFinishTimeChange(e.target.value)}
                disabled={disabled}
                placeholder="e.g. 17:00 or 05:00 PM"
                className={`w-full px-3.5 py-2 text-xs font-semibold rounded-xl border bg-white focus:outline-none focus:ring-2 transition-all ${
                  defaultFinishTimeError
                    ? 'border-rose-300 focus:ring-rose-500/20 text-rose-900'
                    : 'border-gray-200 focus:ring-emerald-500/20 focus:border-emerald-500 text-gray-900'
                }`}
              />
            </div>
            {defaultFinishTime && parseTimeToMinutes(defaultFinishTime) !== null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                <CheckCircle2 size={13} />
                Valid Time
              </span>
            )}
          </div>

          {defaultFinishTimeError && (
            <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
              <AlertCircle size={12} />
              {defaultFinishTimeError}
            </p>
          )}
        </div>

        {/* Category-Wise Finishing Times Section */}
        {distinctCategories.length > 0 && (
          <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-emerald-600" />
                <h4 className="text-xs font-bold text-gray-900">
                  Category-Wise Normal Finishing Times ({distinctCategories.length})
                </h4>
              </div>
              {defaultFinishTime.trim() && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleApplyDefaultToAllCategories}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 self-start sm:self-auto hover:underline"
                >
                  Apply "{defaultFinishTime}" to all categories
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              Each distinct worker category can have its own scheduled end time. Workers in the same category share the category finishing time.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {distinctCategories.map((cat) => {
                const val = categoryFinishTimes[cat.workerType] ?? defaultFinishTime ?? '';
                const err = categoryErrors[cat.workerType];
                const isValid = val && parseTimeToMinutes(val) !== null;

                return (
                  <div
                    key={cat.workerType}
                    className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900">{cat.workerType}</span>
                      <span className="text-[11px] text-gray-500 font-medium bg-white px-2 py-0.5 rounded border border-gray-200">
                        {cat.assignedCount} staff
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled={disabled}
                        value={val}
                        onChange={(e) => handleCategoryChange(cat.workerType, e.target.value)}
                        placeholder="Category finish (e.g. 23:00)"
                        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg border bg-white focus:outline-none focus:ring-1 transition-all ${
                          err
                            ? 'border-rose-400 focus:ring-rose-400 text-rose-900'
                            : 'border-gray-200 focus:border-emerald-500 focus:ring-emerald-500 text-gray-800'
                        }`}
                      />
                      {isValid && (
                        <span className="text-emerald-600 shrink-0" title="Valid Time">
                          <CheckCircle2 size={16} />
                        </span>
                      )}
                    </div>

                    {err && (
                      <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                        <AlertCircle size={11} />
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Requirement Overrides Section */}
        <div className="pt-4 border-t border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-gray-500" />
              <h4 className="text-xs font-bold text-gray-900">
                Work Requirement Overrides (Optional)
              </h4>
            </div>
            <span className="text-[11px] text-gray-500">
              {Object.keys(overrides).length} override(s) configured
            </span>
          </div>

          {/* Add Override Form */}
          {!disabled && availableReqsForOverride.length > 0 && (
            <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex-1">
                <select
                  value={selectedReqId}
                  onChange={(e) => {
                    setSelectedReqId(e.target.value);
                    setOverrideInputError(null);
                  }}
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select Requirement to Override...</option>
                  {availableReqsForOverride.map((req) => (
                    <option key={req.requirementId} value={req.requirementId}>
                      {req.workerType} (Report: {req.reportingTime}, Staff: {req.assignedCount})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-44">
                <input
                  type="text"
                  value={overrideTimeInput}
                  onChange={(e) => {
                    setOverrideTimeInput(e.target.value);
                    setOverrideInputError(null);
                  }}
                  placeholder="Override Time (e.g. 19:30)"
                  className="w-full px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={handleAddOverride}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0"
              >
                <Plus size={14} />
                <span>Add Override</span>
              </button>
            </div>
          )}

          {overrideInputError && (
            <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
              <AlertCircle size={12} />
              {overrideInputError}
            </p>
          )}

          {/* Existing Overrides List */}
          {Object.keys(overrides).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {Object.entries(overrides).map(([reqId, time]) => {
                const req = requirements.find((r) => r.requirementId === reqId);
                return (
                  <div
                    key={reqId}
                    className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-200/70 rounded-xl"
                  >
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-indigo-950 block">
                        {req?.workerType || 'Requirement'}
                      </span>
                      <span className="text-[11px] text-indigo-700 inline-flex items-center gap-1.5">
                        Finish Time: <strong className="font-semibold">{time}</strong>
                        {(() => {
                          const repMins = req ? parseTimeToMinutes(req.reportingTime) : null;
                          const ovMins = parseTimeToMinutes(time);
                          if (repMins !== null && ovMins !== null && ovMins <= repMins) {
                            return (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                +1 Day
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </span>
                    </div>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(reqId)}
                        className="p-1.5 text-indigo-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Remove override"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolved Finishing Time Table Summary */}
        {requirements.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-900 mb-2">Resolved Finishing Times per Requirement</h4>
            <div className="border border-gray-200/70 rounded-xl overflow-hidden bg-gray-50/30">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gray-100/60 text-gray-500 font-semibold border-b border-gray-200/70">
                    <th className="py-2 px-3">Role / Requirement</th>
                    <th className="py-2 px-3">Reporting Time</th>
                    <th className="py-2 px-3">Resolved Finish Time</th>
                    <th className="py-2 px-3">Resolution Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requirements.map((req) => {
                    const hasOverride = Boolean(overrides[req.requirementId]);
                    const resolvedTime = overrides[req.requirementId] || defaultFinishTime || '—';
                    return (
                      <tr key={req.requirementId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-2 px-3 font-medium text-gray-900">{req.workerType}</td>
                        <td className="py-2 px-3 text-gray-600">{req.reportingTime}</td>
                        <td className="py-2 px-3 font-bold text-gray-900">
                          <span className="inline-flex items-center gap-1.5">
                            {resolvedTime}
                            {(() => {
                              const repMins = parseTimeToMinutes(req.reportingTime);
                              const finMins = parseTimeToMinutes(resolvedTime);
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
                        </td>
                        <td className="py-2 px-3">
                          {hasOverride ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              Requirement Override
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                              Event Default
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

