import React from 'react';
import type { WorkRequirement } from '../../features/work-requirements/workRequirementsApi';
import {
  Users,
  FileText,
  Clock,
  Layers,
  CheckCircle2,
  Radio,
  Sparkles,
} from 'lucide-react';

interface WorkRequirementsSummaryProps {
  requirements: WorkRequirement[];
}

export const WorkRequirementsSummary: React.FC<WorkRequirementsSummaryProps> = ({ requirements }) => {
  // Active staffing count excludes cancelled requirements per business rules (§10)
  const activeRequirements = requirements.filter((r) => r.status !== 'cancelled');
  const totalActiveWorkers = activeRequirements.reduce((sum, r) => sum + (r.requiredCount || 0), 0);
  const totalAssignedWorkers = activeRequirements.reduce(
    (sum, r) => sum + (r.assignedWorkers?.length || r.filled || 0),
    0
  );
  const draftCount = requirements.filter((r) => r.status === 'draft').length;
  const openCount = requirements.filter(
    (r) => r.status === 'open' || r.status === 'selection_in_progress'
  ).length;

  // Staffing fulfillment percentage
  const fillPercentage =
    totalActiveWorkers > 0 ? Math.min(100, Math.round((totalAssignedWorkers / totalActiveWorkers) * 100)) : 0;

  // Breakdown by worker type (active count)
  const workerTypeBreakdown: Record<string, { required: number; assigned: number }> = {};
  for (const r of activeRequirements) {
    if (!workerTypeBreakdown[r.workerType]) {
      workerTypeBreakdown[r.workerType] = { required: 0, assigned: 0 };
    }
    workerTypeBreakdown[r.workerType].required += r.requiredCount || 0;
    workerTypeBreakdown[r.workerType].assigned += r.assignedWorkers?.length || r.filled || 0;
  }

  const workerTypeEntries = Object.entries(workerTypeBreakdown);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden transition-all duration-200">
      {/* Header Strip */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 bg-linear-to-r from-emerald-50/40 via-white to-gray-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-600/10 border border-emerald-600/20 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
            <Layers size={18} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              Staffing Demand Summary
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
              Real-time aggregate staffing demand derived from verified event requirements.
            </p>
          </div>
        </div>

        {totalActiveWorkers > 0 && (
          <div className="flex items-center justify-between sm:justify-start gap-2.5 px-3.5 py-1.5 rounded-xl bg-gray-50 border border-gray-200/80 w-full sm:w-auto shrink-0">
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Staffing Fulfilled
              </div>
              <div className="text-xs font-black text-gray-900">
                {totalAssignedWorkers} of {totalActiveWorkers} ({fillPercentage}%)
              </div>
            </div>
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 flex items-center justify-center text-[10px] font-black text-emerald-800 bg-emerald-50 shrink-0">
              {fillPercentage}%
            </div>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Metrics KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Active Workers Needed */}
          <div className="p-3 sm:p-4 rounded-xl border border-emerald-100/90 bg-linear-to-br from-emerald-50/80 to-teal-50/30 shadow-2xs hover:border-emerald-200 transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5 truncate">
                  <Users size={14} className="text-emerald-700 shrink-0" />
                  Active Workers Needed
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-950 tracking-tight">
                {totalActiveWorkers}
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-emerald-700 font-medium mt-1 truncate">
              Total across active roles
            </div>
          </div>

          {/* Card 2: Total Requirements */}
          <div className="p-3 sm:p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 shadow-2xs hover:border-gray-300 transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5 truncate">
                  <FileText size={14} className="text-gray-500 shrink-0" />
                  Total Requirements
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                {requirements.length}
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-gray-500 font-medium mt-1 truncate">
              Defined requirement records
            </div>
          </div>

          {/* Card 3: Draft Requirements */}
          <div className="p-3 sm:p-4 rounded-xl border border-amber-200/70 bg-linear-to-br from-amber-50/70 to-orange-50/30 shadow-2xs hover:border-amber-300 transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-amber-900 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5 truncate">
                  <Clock size={14} className="text-amber-700 shrink-0" />
                  Draft Requirements
                </span>
                {draftCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">
                {draftCount}
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-amber-800 font-medium mt-1 truncate">
              {draftCount > 0 ? 'Editable prior to recruitment' : 'All announced'}
            </div>
          </div>

          {/* Card 4: Recruitment Active */}
          <div className="p-3 sm:p-4 rounded-xl border border-blue-200/70 bg-linear-to-br from-blue-50/70 to-indigo-50/30 shadow-2xs hover:border-blue-300 transition-colors flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-blue-900 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5 truncate">
                  <Radio size={14} className="text-blue-700 shrink-0" />
                  Recruitment Active
                </span>
                {openCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-950 tracking-tight">
                {openCount}
              </div>
            </div>
            <div className="text-[10px] sm:text-[11px] text-blue-800 font-medium mt-1 truncate">
              Awaiting worker selection
            </div>
          </div>
        </div>

        {/* Demanded Roles Breakdown */}
        {workerTypeEntries.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] sm:text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-emerald-600" />
              Demanded Roles Breakdown
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-2.5">
              {workerTypeEntries.map(([workerType, stats]) => {
                const isFullyAssigned = stats.assigned >= stats.required && stats.required > 0;

                return (
                  <div
                    key={workerType}
                    className="inline-flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-gray-50 hover:bg-gray-100/80 border border-gray-200/90 rounded-xl text-xs font-semibold text-gray-800 shadow-2xs transition-colors"
                  >
                    <span className="font-extrabold text-emerald-800 bg-emerald-50 px-1.5 sm:px-2 py-0.5 rounded-md border border-emerald-200 text-xs">
                      {stats.required}
                    </span>
                    <span className="truncate">{workerType}</span>
                    {stats.assigned > 0 && (
                      <span className="text-[10px] font-medium text-gray-500 border-l border-gray-200 pl-2 shrink-0">
                        {stats.assigned} assigned
                      </span>
                    )}
                    {isFullyAssigned && (
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0 ml-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
