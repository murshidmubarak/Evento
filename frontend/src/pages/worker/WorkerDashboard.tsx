import React, { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import {
  ShieldCheck,
  CalendarX,
  RefreshCw,
  Briefcase,
  CheckCircle2,
  PlayCircle,
  CalendarClock,
  Mail,
  Phone,
  MapPin,
  Sparkles,
} from 'lucide-react';

export const WorkerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  const [isLoading, setIsLoading] = useState(false);

  const stats = {
    totalAssigned: 0,
    upcoming: 0,
    ongoing: 0,
    completed: 0,
  };

  const fetchDashboardData = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner / Welcome Header (Theme: Warm Amber & Bronze) */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-50 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/80">
                <ShieldCheck size={14} className="text-amber-600" />
                Worker Dashboard
              </span>
              {user?.businessId && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                  ID: W-{user.businessId}
                </span>
              )}
              {user?.workerType && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-orange-50 text-orange-800 text-xs font-semibold rounded-full border border-orange-200">
                  <Briefcase size={12} className="text-orange-600" />
                  {user.workerType}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Welcome back, {user?.name || 'Worker'}!
            </h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              Logged in as <span className="font-semibold text-gray-800">{user?.name}</span> ({user?.email}) &bull; Role: <strong className="text-amber-700 font-semibold">{user?.workerType || 'General Staff'}</strong>
            </p>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-amber-600' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Cards (Mirrors Manager Dashboard layout in Amber Theme) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Assigned</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{stats.totalAssigned}</div>
          <div className="text-xs text-gray-500 mt-1">All-time assignments</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Upcoming Shifts</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <CalendarClock size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{stats.upcoming}</div>
          <div className="text-xs text-gray-500 mt-1">Confirmed & ready</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">In Progress</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <PlayCircle size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{stats.ongoing}</div>
          <div className="text-xs text-gray-500 mt-1">Currently active</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Completed</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{stats.completed}</div>
          <div className="text-xs text-gray-500 mt-1">Successfully concluded</div>
        </div>
      </div>

      {/* Main Content Area: Empty State Card (Mirrors Manager Dashboard Empty State) */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-10 sm:p-16 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xs border border-amber-100">
          <CalendarX size={32} />
        </div>

        <h2 className="text-xl font-bold text-gray-900">No Work Assigned Yet</h2>

        <p className="text-gray-600 mt-2 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
          No work has been assigned to you yet. Your assignments will appear here when work becomes available.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
          >
            <RefreshCw size={16} />
            Check for Assignments
          </button>
        </div>
      </div>

      {/* Worker Profile Summary Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs max-w-2xl mx-auto">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Briefcase size={18} className="text-amber-600" />
            Worker Profile Information
          </h2>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            Verified Worker
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Full Name
            </span>
            <p className="font-semibold text-gray-800">{user?.name || '—'}</p>
          </div>

          <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Worker Role / Category
            </span>
            <p className="font-semibold text-amber-700 flex items-center gap-1.5">
              <Briefcase size={14} />
              {user?.workerType || 'General Staff'}
            </p>
          </div>

          <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Email Address
            </span>
            <p className="font-semibold text-gray-800 flex items-center gap-1.5 truncate">
              <Mail size={14} className="text-gray-400 shrink-0" />
              <span className="truncate">{user?.email || '—'}</span>
            </p>
          </div>

          <div className="p-3 bg-gray-50/80 rounded-xl border border-gray-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
              Contact Phone
            </span>
            <p className="font-semibold text-gray-800 flex items-center gap-1.5">
              <Phone size={14} className="text-gray-400 shrink-0" />
              {user?.phone || <span className="text-gray-400 font-normal italic">Not provided</span>}
            </p>
          </div>

          {user?.location?.address && (
            <div className="sm:col-span-2 p-3 bg-gray-50/80 rounded-xl border border-gray-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Base Location
              </span>
              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                <MapPin size={14} className="text-gray-400 shrink-0" />
                {user.location.address}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl text-xs text-amber-900 flex items-start gap-2">
          <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p>
            Your account is active in the EventOps shared workforce pool. When Event Managers schedule events matching your specialization, your shift assignments will appear here.
          </p>
        </div>
      </div>
    </div>
  );
};
