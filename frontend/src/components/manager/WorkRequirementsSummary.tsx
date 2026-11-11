import React from 'react';
import type { WorkRequirement } from '../../features/work-requirements/workRequirementsApi';
import { CheckCircle2 } from 'lucide-react';

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
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* Top Header Row with Fulfillment Meter */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 tracking-tight">
            Staffing Demand Summary
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Real-time aggregate staffing demand derived from verified event requirements.
          </p>
        </div>

        <div className="w-full sm:w-48 shrink-0 text-left sm:text-right pt-0.5 sm:pt-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Staffing Fulfilled
          </div>
          <div className="text-sm font-bold text-gray-900 mt-0.5">
            {totalAssignedWorkers} of {totalActiveWorkers} ({fillPercentage}%)
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all duration-300"
              style={{ width: `${fillPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Active Workers Needed */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-gray-50/70 border border-gray-100 flex flex-col justify-between">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider truncate">
            Active Workers Needed
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 my-1">
            {totalActiveWorkers}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 font-normal truncate">
            Total across active roles
          </div>
        </div>

        {/* Card 2: Total Requirements */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-gray-50/70 border border-gray-100 flex flex-col justify-between">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider truncate">
            Total Requirements
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 my-1">
            {requirements.length}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 font-normal truncate">
            Defined requirement records
          </div>
        </div>

        {/* Card 3: Draft Requirements */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-gray-50/70 border border-gray-100 flex flex-col justify-between">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider truncate">
            Draft Requirements
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 my-1">
            {draftCount}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 font-normal truncate">
            {draftCount > 0 ? 'Editable prior to recruitment' : 'All announced'}
          </div>
        </div>

        {/* Card 4: Recruitment Active */}
        <div className="p-3.5 sm:p-4 rounded-lg bg-gray-50/70 border border-gray-100 flex flex-col justify-between">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider truncate">
            Recruitment Active
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-gray-900 my-1">
            {openCount}
          </div>
          <div className="text-[11px] sm:text-xs text-gray-500 font-normal truncate">
            Awaiting worker selection
          </div>
        </div>
      </div>

      {/* Demanded Roles Breakdown */}
      {workerTypeEntries.length > 0 && (
        <div className="pt-1 space-y-2.5">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
            Demanded Roles Breakdown
          </div>
          <div className="flex flex-wrap gap-2.5">
            {workerTypeEntries.map(([workerType, stats]) => {
              const isFullyAssigned = stats.assigned >= stats.required && stats.required > 0;

              return (
                <div
                  key={workerType}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                >
                  <span className="font-bold text-gray-900">
                    {stats.required}
                  </span>
                  <span className="font-medium text-gray-800">
                    {workerType}
                  </span>
                  {stats.assigned > 0 && (
                    <span className="text-xs font-normal text-gray-500 ml-1">
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
  );
};
