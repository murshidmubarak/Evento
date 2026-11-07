import React from 'react';
import { Clock, CheckCircle2, Lock } from 'lucide-react';

interface AttendanceTimingBannerProps {
  latestReportingTime: string;
  canFinalizeCheckIn: boolean;
  checkInFinalized: boolean;
  totalAssigned: number;
}

export const AttendanceTimingBanner: React.FC<AttendanceTimingBannerProps> = ({
  latestReportingTime,
  canFinalizeCheckIn,
  checkInFinalized,
  totalAssigned,
}) => {
  if (checkInFinalized) {
    return (
      <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-5 flex items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
          <CheckCircle2 size={20} />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-emerald-900">Check-in Finalized</h4>
          <p className="text-xs text-emerald-700">
            Attendance check-in records have been permanently persisted. All assigned workers have been accounted for.
          </p>
        </div>
      </div>
    );
  }

  if (totalAssigned === 0) {
    return (
      <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-5 flex items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
          <Lock size={20} />
        </div>
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold text-amber-900">No Assigned Workers</h4>
          <p className="text-xs text-amber-700">
            There are currently no confirmed worker assignments for this event. Work requirements must be staffed before check-in can be finalized.
          </p>
        </div>
      </div>
    );
  }

  if (!canFinalizeCheckIn) {
    return (
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-blue-50/90 border border-blue-200 rounded-2xl p-5 flex items-start sm:items-center gap-4 shadow-xs">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200 shadow-2xs">
          <Clock size={20} className="animate-pulse" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-blue-950">
              Check-in Finalization Locked Until Latest Shift
            </h4>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-200/80 text-blue-900 text-[11px] font-semibold rounded-full border border-blue-300">
              Available after {latestReportingTime || 'scheduled time'}
            </span>
          </div>
          <p className="text-xs text-blue-800 leading-relaxed">
            Finalization will become available once the latest scheduled shift starts (<strong>{latestReportingTime}</strong>).
            You can prepare late and absent exceptions now. Final submission requires the backend timing guard to pass.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-emerald-50/90 to-teal-50/80 border border-emerald-200 rounded-2xl p-5 flex items-start sm:items-center gap-4 shadow-xs">
      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200 shadow-2xs">
        <CheckCircle2 size={20} />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-emerald-950">
            Ready for Check-in Finalization
          </h4>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-200/80 text-emerald-900 text-[11px] font-semibold rounded-full border border-emerald-300">
            All Shifts Commenced
          </span>
        </div>
        <p className="text-xs text-emerald-800 leading-relaxed">
          The latest scheduled shift time (<strong>{latestReportingTime}</strong>) has arrived.
          Any worker without an explicit late or absent exception will be automatically recorded as Present / On Time.
        </p>
      </div>
    </div>
  );
};

