import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AttendanceRosterItem, AttendanceSession } from '../../../features/attendance/attendance.types';
import { formatDurationMinutes, isOvernightCheckout } from '../../../features/attendance/attendanceApi';
import {
  Clock,
  UserX,
  UserCheck,
  Search,
  Filter,
  ShieldCheck,
  Phone,
  Calendar,
  CheckCircle2,
  XCircle,
  RotateCw,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';

interface FinalizedAttendanceViewProps {
  session: AttendanceSession | {
    checkInFinalized: boolean;
    checkInFinalizedAt?: string;
    actualNormalFinishTime?: string;
    requirementFinishOverrides?: Array<{ requirementId: string; normalFinishTime: string; normalFinishDate?: string }>;
    checkOutFinalized?: boolean;
    checkOutFinalizedAt?: string;
    verificationStatus?: string;
    verifiedBy?: string;
    verifiedAt?: string;
    rejectionReason?: string;
    lifecycleStatus: string;
  };
  roster: AttendanceRosterItem[];
  openConcernsCount?: number;
  onRefresh?: () => void;
  onOpenCorrection?: (worker: AttendanceRosterItem) => void;
  onOpenVerification?: (action: 'approve' | 'reject') => void;
}

export const FinalizedAttendanceView: React.FC<FinalizedAttendanceViewProps> = ({
  session,
  roster,
  openConcernsCount = 0,
  onRefresh,
  onOpenCorrection,
  onOpenVerification,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const isCheckoutFinalized = Boolean((session as any).checkOutFinalized);

  // Compute metrics
  const counts = useMemo(() => {
    let onTime = 0;
    let late = 0;
    let absent = 0;
    let normalCheckout = 0;
    let earlyDeparture = 0;
    let overtime = 0;
    let totalDurationMinutes = 0;

    roster.forEach((r) => {
      const arr = r.arrivalStatus?.toLowerCase();
      if (arr === 'on_time' || r.status === 'present') onTime++;
      else if (arr === 'late' || r.status === 'late') late++;
      else if (arr === 'absent' || r.status === 'absent') absent++;
      else onTime++;

      if (isCheckoutFinalized) {
        const dep = r.departureStatus?.toLowerCase();
        if (dep === 'early_departure') earlyDeparture++;
        else if (dep === 'overtime') overtime++;
        else if (dep === 'normal') normalCheckout++;

        if (r.durationMinutes) {
          totalDurationMinutes += r.durationMinutes;
        }
      }
    });

    return {
      total: roster.length,
      onTime,
      late,
      absent,
      normalCheckout,
      earlyDeparture,
      overtime,
      totalDurationMinutes,
    };
  }, [roster, isCheckoutFinalized]);

  // Unique worker types in roster
  const uniqueWorkerTypes = useMemo(() => {
    const set = new Set<string>();
    roster.forEach((r) => {
      if (r.workerType) set.add(r.workerType);
    });
    return Array.from(set).sort();
  }, [roster]);

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

      // 2. Status filter
      const arr = item.arrivalStatus?.toLowerCase();
      const dep = item.departureStatus?.toLowerCase();

      if (statusFilter === 'on_time') {
        if (arr !== 'on_time' && item.status !== 'present') return false;
      } else if (statusFilter === 'late') {
        if (arr !== 'late' && item.status !== 'late') return false;
      } else if (statusFilter === 'absent') {
        if (arr !== 'absent' && item.status !== 'absent') return false;
      } else if (statusFilter === 'early_departure') {
        if (dep !== 'early_departure') return false;
      } else if (statusFilter === 'overtime') {
        if (dep !== 'overtime') return false;
      } else if (statusFilter === 'normal') {
        if (dep !== 'normal') return false;
      }

      // 3. Worker type filter
      if (typeFilter !== 'all' && item.workerType !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [roster, searchTerm, statusFilter, typeFilter]);

  const formattedFinalizedAt = isCheckoutFinalized
    ? (session as any).checkOutFinalizedAt
      ? new Date((session as any).checkOutFinalizedAt).toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        })
      : 'Recently'
    : session.checkInFinalizedAt
    ? new Date(session.checkInFinalizedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      })
    : 'Recently';

  const formatRecordedTime = (timeVal: string | Date | null | undefined): string => {
    if (!timeVal) return '—';
    try {
      const d = new Date(timeVal);
      if (isNaN(d.getTime())) return String(timeVal);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return String(timeVal);
    }
  };

  const getSourceBadge = (source: string | undefined) => {
    switch (source) {
      case 'system_default':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            System default
          </span>
        );
      case 'manager_actual':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Manager actual
          </span>
        );
      case 'not_recorded':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
            Not recorded
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck size={26} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-emerald-950">
                  {isCheckoutFinalized
                    ? 'Attendance & Checkout Finalized'
                    : 'Check-in Complete & Persisted'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-200/80 text-emerald-900 border border-emerald-300">
                  {isCheckoutFinalized ? 'Checkout Committed' : 'Check-in Finalized'}
                </span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed max-w-xl">
                {isCheckoutFinalized
                  ? 'All staff check-in and checkout timestamps, departures, and working durations are permanently recorded.'
                  : 'Attendance check-in records have been committed to the database. Shift reporting is locked.'}
              </p>
              <div className="flex items-center gap-4 pt-1 text-[11px] text-emerald-700">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} />
                  {isCheckoutFinalized ? 'Checkout Finalized on: ' : 'Finalized on: '}
                  <strong>{formattedFinalizedAt}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-white/80 p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
            <div className="text-center px-2 border-r border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-gray-500">Total</div>
              <div className="text-base font-extrabold text-gray-900">{counts.total}</div>
            </div>
            <div className="text-center px-2 border-r border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-emerald-600">On Time</div>
              <div className="text-base font-extrabold text-emerald-700">{counts.onTime}</div>
            </div>
            <div className="text-center px-2 border-r border-emerald-100">
              <div className="text-[10px] uppercase font-bold text-amber-600">Late</div>
              <div className="text-base font-extrabold text-amber-700">{counts.late}</div>
            </div>
            <div className="text-center px-2">
              <div className="text-[10px] uppercase font-bold text-rose-600">Absent</div>
              <div className="text-base font-extrabold text-rose-700">{counts.absent}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Summary Card (if checkout is finalized) */}
      {isCheckoutFinalized && (
        <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-emerald-700" />
              <h4 className="text-sm font-bold text-gray-900">Checkout & Shift Duration Metrics</h4>
            </div>
            {(session as any).actualNormalFinishTime && (
              <span className="text-xs text-gray-600">
                Default Finish Time: <strong>{(session as any).actualNormalFinishTime}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl">
              <span className="text-[10px] font-bold text-emerald-700 block uppercase">Normal Checkout</span>
              <span className="text-lg font-black text-emerald-950">{counts.normalCheckout}</span>
              <span className="text-[10px] text-emerald-700 block">System Default</span>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl">
              <span className="text-[10px] font-bold text-amber-700 block uppercase">Early Departures</span>
              <span className="text-lg font-black text-amber-950">{counts.earlyDeparture}</span>
              <span className="text-[10px] text-amber-700 block">Departed Early</span>
            </div>

            <div className="p-3 bg-purple-50/70 border border-purple-200/70 rounded-xl">
              <span className="text-[10px] font-bold text-purple-700 block uppercase">Overtime Shifts</span>
              <span className="text-lg font-black text-purple-950">{counts.overtime}</span>
              <span className="text-[10px] text-purple-700 block">Extra Working Hours</span>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-200/70 rounded-xl">
              <span className="text-[10px] font-bold text-indigo-700 block uppercase">Total Staff Hours</span>
              <span className="text-lg font-black text-indigo-950">
                {Math.round(counts.totalDurationMinutes / 60)} hrs
              </span>
              <span className="text-[10px] text-indigo-700 block">{counts.totalDurationMinutes} total mins</span>
            </div>
          </div>
        </div>
      )}

      {/* Open Concerns Blocker Alert Banner (§13) */}
      {isCheckoutFinalized && openConcernsCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950">
                {openConcernsCount === 1
                  ? '1 Open Attendance Concern Requires Resolution'
                  : `${openConcernsCount} Open Attendance Concerns Require Resolution`}
              </h4>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed max-w-2xl">
                Assigned staff have raised attendance concerns that are currently open. In accordance with system policy, all open concerns must be reviewed and resolved (accepted or rejected) before official attendance verification can proceed.
              </p>
            </div>
          </div>
          <Link
            to="/manager/concerns"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs shrink-0 transition-colors"
          >
            Review Concerns
          </Link>
        </div>
      )}

      {/* Verification Status & Manager Sign-off Action Bar (when checkout is finalized) */}
      {isCheckoutFinalized && (
        <div
          className={`rounded-2xl border p-5 shadow-xs transition-all ${
            (session as any).verificationStatus === 'approved'
              ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-emerald-200'
              : (session as any).verificationStatus === 'rejected'
              ? 'bg-gradient-to-r from-rose-50 via-red-50 to-rose-50 border-rose-200'
              : 'bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border-amber-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-xs ${
                  (session as any).verificationStatus === 'approved'
                    ? 'bg-emerald-600'
                    : (session as any).verificationStatus === 'rejected'
                    ? 'bg-rose-600'
                    : 'bg-amber-600'
                }`}
              >
                {(session as any).verificationStatus === 'approved' ? (
                  <ShieldCheck size={22} />
                ) : (session as any).verificationStatus === 'rejected' ? (
                  <XCircle size={22} />
                ) : (
                  <Clock size={22} />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-gray-900">
                    {(session as any).verificationStatus === 'approved'
                      ? 'Attendance Verified & Approved'
                      : (session as any).verificationStatus === 'rejected'
                      ? 'Attendance Verification Rejected'
                      : 'Final Manager Review & Attendance Approval'}
                  </h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      (session as any).verificationStatus === 'approved'
                        ? 'bg-emerald-200 text-emerald-950 border border-emerald-300'
                        : (session as any).verificationStatus === 'rejected'
                        ? 'bg-rose-200 text-rose-950 border border-rose-300'
                        : 'bg-amber-200 text-amber-950 border border-amber-300'
                    }`}
                  >
                    {(session as any).verificationStatus || 'Pending Review'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed max-w-xl">
                  {(session as any).verificationStatus === 'approved'
                    ? 'Attendance records have been officially reviewed and signed off by the Event Manager. Corrections can still be applied if errors are discovered, which will return status to Pending Review.'
                    : (session as any).verificationStatus === 'rejected'
                    ? `Rejected with reason: "${(session as any).rejectionReason || 'Attendance details require correction.'}". Apply necessary corrections below and re-submit for approval.`
                    : 'Checkout has been finalized. Review all timestamps, recorded working hours, and exceptions before officially approving the event attendance.'}
                </p>
              </div>
            </div>

            {/* Verification Actions */}
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              {(session as any).verificationStatus === 'rejected' ? (
                <button
                  type="button"
                  onClick={() => onOpenVerification?.('approve')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  <ShieldCheck size={14} />
                  Re-Submit & Approve
                </button>
              ) : (session as any).verificationStatus === 'approved' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 rounded-xl border border-emerald-200">
                  <CheckCircle2 size={14} />
                  Verified
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onOpenVerification?.('reject')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold rounded-xl shadow-xs transition-colors"
                  >
                    <XCircle size={14} />
                    Reject Attendance
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenVerification?.('approve')}
                    disabled={openConcernsCount > 0}
                    title={
                      openConcernsCount > 0
                        ? 'Resolve all open attendance concerns before final verification'
                        : 'Approve Attendance'
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck size={14} />
                    Approve Attendance
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finalized Roster Card */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900 tracking-tight">
                Finalized Attendance Records ({roster.length})
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Official timestamps, arrival and departure provenance for all assigned workers.
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Quick Search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, role, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-gray-800"
                />
              </div>

              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shrink-0"
                  title="Refresh attendance records"
                >
                  <RotateCw size={13} />
                  <span>Refresh</span>
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
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
                onClick={() => setStatusFilter('on_time')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                  statusFilter === 'on_time'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 border border-emerald-200/60'
                }`}
              >
                On Time ({counts.onTime})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('late')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                  statusFilter === 'late'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100/80 border border-amber-200/60'
                }`}
              >
                Late ({counts.late})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('absent')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                  statusFilter === 'absent'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100/80 border border-rose-200/60'
                }`}
              >
                Absent ({counts.absent})
              </button>
              {isCheckoutFinalized && (
                <>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('early_departure')}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                      statusFilter === 'early_departure'
                        ? 'bg-amber-700 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-900 hover:bg-amber-100/80 border border-amber-200/60'
                    }`}
                  >
                    Early Departure ({counts.earlyDeparture})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('overtime')}
                    className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                      statusFilter === 'overtime'
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-purple-50 text-purple-900 hover:bg-purple-100/80 border border-purple-200/60'
                    }`}
                  >
                    Overtime ({counts.overtime})
                  </button>
                </>
              )}
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

        {/* Table */}
        {filteredRoster.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-sm font-semibold">No records match the current filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200/80 text-gray-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 sm:px-6">Worker</th>
                  <th className="py-3.5 px-3">Role</th>
                  <th className="py-3.5 px-3">Check-in</th>
                  <th className="py-3.5 px-3">Check-in Provenance</th>
                  {isCheckoutFinalized ? (
                    <>
                      <th className="py-3.5 px-3">Checkout</th>
                      <th className="py-3.5 px-3">Checkout Provenance</th>
                      <th className="py-3.5 px-3">Working Duration</th>
                      <th className="py-3.5 px-3">Verification</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3.5 px-4 sm:px-6">Arrival Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRoster.map((worker) => {
                  const isAbsent = worker.arrivalStatus === 'absent' || worker.status === 'absent';
                  return (
                    <tr key={worker.workerId} className="hover:bg-gray-50/60 transition-colors">
                      {/* Worker */}
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
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">
                          {worker.workerType}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">Rep: {worker.reportingTime}</span>
                      </td>

                      {/* Check-in */}
                      <td className="py-4 px-3">
                        {isAbsent ? (
                          <span className="text-rose-600 font-bold text-xs">Absent</span>
                        ) : worker.arrivalStatus === 'late' ? (
                          <div className="space-y-0.5">
                            <span className="font-bold text-gray-900">{formatRecordedTime(worker.checkIn)}</span>
                            <span className="text-[10px] text-amber-700 block font-semibold">
                              Late ({worker.delayMinutes} min)
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="font-bold text-gray-900">{formatRecordedTime(worker.checkIn)}</span>
                            <span className="text-[10px] text-emerald-700 block font-semibold">On Time</span>
                          </div>
                        )}
                      </td>

                      {/* Check-in Provenance */}
                      <td className="py-4 px-3">
                        {getSourceBadge(worker.checkInSource)}
                      </td>

                      {/* Check-out Columns (when checkout finalized) */}
                      {isCheckoutFinalized ? (
                        <>
                          {/* Checkout Time & Status */}
                          <td className="py-4 px-3">
                            {isAbsent ? (
                              <span className="text-gray-400 font-medium">—</span>
                            ) : (() => {
                              const isNextDay = isOvernightCheckout(worker.checkIn, worker.checkOut);

                              if (worker.departureStatus === 'early_departure') {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="font-bold text-gray-900 inline-flex items-center gap-1">
                                      {formatRecordedTime(worker.checkOut)}
                                      {isNextDay && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                          +1 Day
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-amber-700 block font-semibold">
                                      Early (-{worker.earlyDepartureMinutes}m)
                                    </span>
                                  </div>
                                );
                              }
                              if (worker.departureStatus === 'overtime') {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="font-bold text-gray-900 inline-flex items-center gap-1">
                                      {formatRecordedTime(worker.checkOut)}
                                      {isNextDay && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                          +1 Day
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-purple-700 block font-semibold">
                                      Overtime (+{worker.overtimeMinutes}m)
                                    </span>
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-0.5">
                                  <span className="font-bold text-gray-900 inline-flex items-center gap-1">
                                    {formatRecordedTime(worker.checkOut)}
                                    {isNextDay && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                        +1 Day
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-emerald-700 block font-semibold">Normal Finish</span>
                                </div>
                              );
                            })()}
                          </td>

                          {/* Checkout Provenance */}
                          <td className="py-4 px-3">
                            {getSourceBadge(worker.checkOutSource)}
                          </td>

                          {/* Working Duration */}
                          <td className="py-4 px-3">
                            {isAbsent ? (
                              <span className="text-gray-400 font-medium">—</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-900 border border-gray-200">
                                <Clock size={12} className="text-emerald-700" />
                                {formatDurationMinutes(worker.durationMinutes || 0)}
                              </span>
                            )}
                          </td>

                          {/* Verification Status */}
                          <td className="py-4 px-3">
                            {worker.verificationStatus === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 size={10} />
                                Approved
                              </span>
                            ) : worker.verificationStatus === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <XCircle size={10} />
                                Rejected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock size={10} />
                                Pending Review
                              </span>
                            )}
                            {worker.corrections && worker.corrections.length > 0 && (
                              <span className="block text-[9px] text-gray-500 font-medium mt-0.5">
                                {worker.corrections.length} correction{worker.corrections.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </td>

                          {/* Row Actions */}
                          <td className="py-4 px-4 sm:px-6 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenCorrection?.(worker)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors shadow-2xs"
                            >
                              <RotateCcw size={11} className="text-amber-700" />
                              Correct Attendance
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Arrival Status (Pre-checkout) */}
                          <td className="py-4 px-4 sm:px-6">
                            {isAbsent ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300">
                                <UserX size={12} />
                                Absent
                              </span>
                            ) : worker.arrivalStatus === 'late' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                                <Clock size={12} />
                                Late ({worker.delayMinutes}m)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                                <UserCheck size={12} />
                                On Time
                              </span>
                            )}
                          </td>

                          {/* Row Actions (Pre-checkout) */}
                          <td className="py-4 px-4 sm:px-6 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenCorrection?.(worker)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 transition-colors shadow-2xs"
                            >
                              <RotateCcw size={11} className="text-amber-700" />
                              Correct Attendance
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
