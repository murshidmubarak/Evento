import React from 'react';
import type { WorkRequirement } from '../../features/work-requirements/workRequirementsApi';
import { Users, FileText, Clock, AlertTriangle, Layers } from 'lucide-react';

interface WorkRequirementsSummaryProps {
  requirements: WorkRequirement[];
}

export const WorkRequirementsSummary: React.FC<WorkRequirementsSummaryProps> = ({ requirements }) => {
  // Active staffing count excludes cancelled requirements per business rules (§10)
  const activeRequirements = requirements.filter((r) => r.status !== 'cancelled');
  const totalActiveWorkers = activeRequirements.reduce((sum, r) => sum + (r.requiredCount || 0), 0);
  const draftCount = requirements.filter((r) => r.status === 'draft').length;
  const openCount = requirements.filter((r) => r.status === 'open' || r.status === 'selection_in_progress').length;
  const cancelledCount = requirements.filter((r) => r.status === 'cancelled').length;

  // Breakdown by worker type (active count)
  const workerTypeBreakdown: Record<string, number> = {};
  for (const r of activeRequirements) {
    workerTypeBreakdown[r.workerType] = (workerTypeBreakdown[r.workerType] || 0) + (r.requiredCount || 0);
  }

  const workerTypeEntries = Object.entries(workerTypeBreakdown);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-emerald-600" />
            Staffing Demand Summary
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time aggregate staffing demand derived from verified event requirements.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
            <Users size={14} className="text-emerald-600" />
            Active Workers Needed
          </div>
          <div className="text-2xl font-black text-emerald-950">{totalActiveWorkers}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">Total across active roles</div>
        </div>

        <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
            <FileText size={14} className="text-gray-500" />
            Total Requirements
          </div>
          <div className="text-2xl font-black text-gray-900">{requirements.length}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Defined requirement records</div>
        </div>

        <div className="p-4 bg-amber-50/70 border border-amber-100 rounded-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
            <Clock size={14} className="text-amber-600" />
            Draft Requirements
          </div>
          <div className="text-2xl font-black text-amber-950">{draftCount}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">Editable prior to recruitment</div>
        </div>

        <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">
            <Users size={14} className="text-blue-600" />
            Recruitment Active
          </div>
          <div className="text-2xl font-black text-blue-950">{openCount}</div>
          <div className="text-[11px] text-blue-700 mt-0.5">
            {cancelledCount > 0 ? `${cancelledCount} cancelled` : 'Awaiting worker selection'}
          </div>
        </div>
      </div>

      {/* Breakdown by Worker Type Pills */}
      {workerTypeEntries.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Demanded Roles Breakdown
          </div>
          <div className="flex flex-wrap gap-2">
            {workerTypeEntries.map(([workerType, count]) => (
              <div
                key={workerType}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200/90 rounded-lg text-xs font-medium text-gray-800"
              >
                <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                  {count}
                </span>
                <span>{workerType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notice about cancelled requirements */}
      {cancelledCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50/80 px-3 py-2 rounded-lg border border-rose-100">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            {cancelledCount} requirement record{cancelledCount > 1 ? 's are' : ' is'} marked as cancelled and excluded from active staffing totals.
          </span>
        </div>
      )}
    </div>
  );
};
