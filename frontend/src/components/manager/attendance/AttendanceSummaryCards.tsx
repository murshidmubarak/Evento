import React from 'react';
import { Users, UserCheck, Clock, UserX, CalendarClock, ShieldCheck } from 'lucide-react';

interface AttendanceSummaryCardsProps {
  totalAssigned: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  latestReportingTime: string;
  canFinalizeCheckIn: boolean;
  checkInFinalized: boolean;
}

export const AttendanceSummaryCards: React.FC<AttendanceSummaryCardsProps> = ({
  totalAssigned,
  presentCount,
  lateCount,
  absentCount,
  latestReportingTime,
  canFinalizeCheckIn,
  checkInFinalized,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {/* 1. Total Assigned */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Total Assigned</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
            <Users size={15} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{totalAssigned}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Staff roster pool</div>
        </div>
      </div>

      {/* 2. Default Present */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-emerald-600 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Default Present</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
            <UserCheck size={15} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-emerald-700 tracking-tight">{presentCount}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">On time by default</div>
        </div>
      </div>

      {/* 3. Late Exceptions */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-amber-600 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Late Arrivals</span>
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
            <Clock size={15} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-amber-700 tracking-tight">{lateCount}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Actual time logged</div>
        </div>
      </div>

      {/* 4. Absent Exceptions */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-rose-600 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Absent</span>
          <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100">
            <UserX size={15} />
          </div>
        </div>
        <div>
          <div className="text-2xl font-extrabold text-rose-700 tracking-tight">{absentCount}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">No check-in created</div>
        </div>
      </div>

      {/* 5. Latest Reporting Time */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-blue-600 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Latest Shift</span>
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
            <CalendarClock size={15} />
          </div>
        </div>
        <div>
          <div className="text-lg font-extrabold text-gray-900 tracking-tight truncate">
            {latestReportingTime || '—'}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">Barrier threshold</div>
        </div>
      </div>

      {/* 6. Check-in Finalization Status */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-4 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between text-gray-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Check-in State</span>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
            <ShieldCheck size={15} />
          </div>
        </div>
        <div>
          <div className="text-sm font-extrabold tracking-tight">
            {checkInFinalized ? (
              <span className="text-emerald-700">Finalized</span>
            ) : canFinalizeCheckIn ? (
              <span className="text-blue-700">Eligible Now</span>
            ) : (
              <span className="text-amber-700">Locked</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {checkInFinalized
              ? 'Persisted'
              : canFinalizeCheckIn
              ? 'Ready to submit'
              : 'Awaiting shift'}
          </div>
        </div>
      </div>
    </div>
  );
};

