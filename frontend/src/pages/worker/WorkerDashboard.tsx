import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import {
  workRequirementsApi,
  type WorkerOpportunity,
  type WorkerAssignment,
} from '../../features/work-requirements/workRequirementsApi';
import {
  ShieldCheck,
  RefreshCw,
  Briefcase,
  CheckCircle2,
  CalendarClock,
  CalendarX,
  Mail,
  Phone,
  MapPin,
  Sparkles,
  AlertCircle,
  Clock,
  Send,
  Calendar,
  ArrowRight,
  Compass,
  HeartHandshake,
} from 'lucide-react';

export const formatDisplayTime = (timeStr?: string): string => {
  if (!timeStr) return 'Not specified';
  const trimmed = timeStr.trim();
  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    let hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  }
  return trimmed;
};

export const formatDisplayDate = (dateStr?: string): string => {
  if (!dateStr) return 'Date TBA';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export const WorkerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  const [activeTab, setActiveTab] = useState<'opportunities' | 'assignments'>('opportunities');
  const [opportunities, setOpportunities] = useState<WorkerOpportunity[]>([]);
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [submittingInterestId, setSubmittingInterestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const hasValidLocation = Boolean(
    user?.location?.lat !== undefined &&
    user?.location?.lng !== undefined &&
    Number.isFinite(user?.location?.lat) &&
    Number.isFinite(user?.location?.lng) &&
    user.location.lat >= -90 &&
    user.location.lat <= 90 &&
    user.location.lng >= -180 &&
    user.location.lng <= 180
  );

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!hasValidLocation) {
        // Location required to access opportunities: fetch confirmed assignments only
        const assignsData = await workRequirementsApi.getWorkerAssignments();
        setAssignments(assignsData || []);
        setOpportunities([]);
        return;
      }

      const [oppsData, assignsData] = await Promise.all([
        workRequirementsApi.getWorkerOpportunities(),
        workRequirementsApi.getWorkerAssignments(),
      ]);
      setOpportunities(oppsData || []);
      setAssignments(assignsData || []);
    } catch (err: any) {
      if (err.response?.data?.errors?.includes('LOCATION_REQUIRED')) {
        setOpportunities([]);
      } else {
        setError(
          err.response?.data?.message ||
            'Failed to load worker opportunities and assignments.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [hasValidLocation]);

  const triggerSuccessNotice = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => {
      setSuccessNotice((current) => (current === msg ? null : current));
    }, 4500);
  };

  const handleExpressInterest = async (requirementId: string) => {
    try {
      setSubmittingInterestId(requirementId);
      setError(null);
      const result = await workRequirementsApi.expressInterest(requirementId);
      triggerSuccessNotice(result.message || 'Interest recorded successfully!');

      // Update local opportunity state immediately
      setOpportunities((prev) =>
        prev.map((opp) =>
          opp.id === requirementId
            ? {
                ...opp,
                hasExpressedInterest: true,
                myResponseStatus: 'interested',
              }
            : opp
        )
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Failed to submit interest. Please try again.'
      );
    } finally {
      setSubmittingInterestId(null);
    }
  };

  // Filter to show only opportunities where the worker can express interest (exclude confirmed and rejected)
  const availableOpportunities = opportunities.filter(
    (o) => !o.isAssigned && o.myResponseStatus !== 'selected' && o.myResponseStatus !== 'not_selected'
  );
  const pendingCount = availableOpportunities.filter(
    (o) => o.hasExpressedInterest && o.myResponseStatus === 'interested'
  ).length;
  const availableCount = availableOpportunities.filter(
    (o) => !o.hasExpressedInterest
  ).length;

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
              {hasValidLocation ? (
                <Link
                  to="/worker/location"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full border border-emerald-200 transition-colors"
                  title="Click to view or update your location"
                >
                  <MapPin size={12} className="text-emerald-600" />
                  <span className="max-w-[160px] truncate">{user?.location?.address || 'Location Confirmed'}</span>
                  <span className="text-[10px] text-emerald-600 underline">Change</span>
                </Link>
              ) : (
                <Link
                  to="/worker/location"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-full border border-amber-300 transition-colors animate-pulse"
                >
                  <MapPin size={12} className="text-amber-700" />
                  Set Location &rarr;
                </Link>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Welcome back, {user?.name || 'Worker'}!
            </h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              Logged in as <span className="font-semibold text-gray-800">{user?.name}</span> ({user?.email}) &bull; Specialty: <strong className="text-amber-700 font-semibold">{user?.workerType || 'General Staff'}</strong>
            </p>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-amber-600' : ''} />
            Refresh Opportunities
          </button>
        </div>
      </div>

      {/* Global Success / Error Banners */}
      {successNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mandatory Location Selection Gate Banner */}
      {!hasValidLocation && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin size={22} className="text-amber-700 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-950">
                Mandatory Location Setup Required
              </h3>
              <p className="text-xs sm:text-sm text-amber-900/90 mt-1 max-w-2xl leading-relaxed">
                Before browsing available work opportunities and expressing interest, you must configure your current work location. EventOps uses this to calculate venue distances and verify eligibility against manager distance limits.
              </p>
            </div>
          </div>
          <Link
            to="/worker/location"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors shrink-0"
          >
            <MapPin size={15} />
            Set Up Location
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Confirmed Shifts</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{assignments.length}</div>
          <div className="text-xs text-gray-500 mt-1">Confirmed worker assignments</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Open Opportunities</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{availableCount}</div>
          <div className="text-xs text-gray-500 mt-1">Available for expressing interest</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Pending Selection</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Send size={16} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{pendingCount}</div>
          <div className="text-xs text-gray-500 mt-1">Awaiting deadline selection</div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            type="button"
            onClick={() => setActiveTab('opportunities')}
            className={`py-3 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'opportunities'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Compass size={16} />
            Available Opportunities
            <span
              className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'opportunities'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {availableOpportunities.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('assignments')}
            className={`py-3 px-1 border-b-2 font-bold text-sm transition-colors flex items-center gap-2 ${
              activeTab === 'assignments'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CalendarClock size={16} />
            My Confirmed Shifts
            <span
              className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'assignments'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {assignments.length}
            </span>
          </button>
        </nav>
      </div>

      {/* TAB 1: AVAILABLE WORK OPPORTUNITIES */}
      {activeTab === 'opportunities' && (
        <div className="space-y-4">
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3">
            <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">How Worker Selection Works:</span> Express interest in any matching requirement before its deadline. When the window closes, EventOps deterministically selects workers based on distance and tie-breakers. Once selected, your assignment is confirmed and locked.
            </div>
          </div>

          {!hasValidLocation ? (
            <div className="bg-white rounded-2xl border border-amber-200/90 shadow-xs p-8 sm:p-14 text-center max-w-2xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs border border-amber-200">
                <MapPin size={32} />
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Location Configuration Required
              </h2>

              <p className="text-gray-600 text-sm leading-relaxed max-w-lg mx-auto">
                You cannot view work opportunities or express interest until your location is confirmed. Managers define a maximum allowable travel distance for each requirement, and your location is checked against event venues.
              </p>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-left text-xs text-gray-600 space-y-2 max-w-md mx-auto">
                <div className="flex items-center gap-2 text-gray-800 font-semibold">
                  <ShieldCheck size={14} className="text-amber-600" />
                  Location Rules &amp; Privacy:
                </div>
                <ul className="list-disc list-inside space-y-1 text-gray-600 pl-1">
                  <li>Choose your location via browser GPS or by selecting manually on a map.</li>
                  <li>No continuous background GPS tracking is ever performed.</li>
                  <li>Your exact coordinates are kept private and never shown to clients.</li>
                </ul>
              </div>

              <div className="pt-3">
                <Link
                  to="/worker/location"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-xl shadow-sm transition-colors"
                >
                  <MapPin size={16} />
                  Set Up Location Now
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : availableOpportunities.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-10 sm:p-16 text-center max-w-2xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-xs border border-amber-100">
                <CalendarX size={32} />
              </div>

              <h2 className="text-xl font-bold text-gray-900">No Eligible Opportunities Found</h2>

              <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
                There are currently no active requirements matching your worker category (<strong className="text-amber-800">{user?.workerType || 'General'}</strong>) within your permitted travel distance.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={fetchDashboardData}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors disabled:opacity-60"
                >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                  Refresh Listings
                </button>
                <Link
                  to="/worker/location"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg shadow-sm transition-colors"
                >
                  <MapPin size={16} />
                  Update Location
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableOpportunities.map((opp) => {
                const isSubmitting = submittingInterestId === opp.id;
                const isExpressed = opp.hasExpressedInterest;
                const isAssigned = Boolean(opp.isAssigned) || opp.myResponseStatus === 'selected';
                const isNotSelected = opp.myResponseStatus === 'not_selected';
                const isPending = isExpressed && opp.myResponseStatus === 'interested';
                const isOverDistance =
                  typeof opp.distanceKm === 'number' &&
                  typeof opp.maxDistanceKm === 'number' &&
                  opp.distanceKm > opp.maxDistanceKm;

                return (
                  <div
                    key={opp.id}
                    className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between shadow-xs ${
                      isAssigned
                        ? 'border-emerald-300 ring-2 ring-emerald-500/20'
                        : isNotSelected
                        ? 'border-rose-200/90 bg-rose-50/15 hover:border-rose-300'
                        : isPending
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Bar: Worker Type & Status Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Briefcase size={12} className="text-amber-600" />
                            {opp.workerType}
                          </span>
                          <h3 className="text-base font-bold text-gray-900 mt-1.5">
                            {opp.eventTitle}
                          </h3>
                        </div>

                        {isAssigned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            Assigned to You
                          </span>
                        ) : isNotSelected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <HeartHandshake size={13} className="text-rose-600" />
                            Not Selected
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                            <Send size={12} className="text-blue-600" />
                            Interest Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                            {opp.requiredCount} positions needed
                          </span>
                        )}
                      </div>

                      {/* Event Details Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 pt-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400 shrink-0" />
                          <span>{formatDisplayDate(opp.eventDate)}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-gray-400 shrink-0" />
                          <span>Report: <strong className="text-gray-800">{formatDisplayTime(opp.reportingTime)}</strong></span>
                        </div>

                        <div className="flex items-center gap-1.5 col-span-2">
                          <MapPin size={13} className="text-gray-400 shrink-0" />
                          <span className="truncate">
                            {opp.eventLocation?.address || 'Venue location confirmed'}
                          </span>
                        </div>
                      </div>

                      {/* Distance & Limits */}
                      <div className="p-2.5 bg-gray-50/80 rounded-xl border border-gray-100 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-1 text-gray-700">
                          <Compass size={13} className="text-amber-600 shrink-0" />
                          <span>
                            Distance:{' '}
                            <strong className="text-gray-900">
                              {typeof opp.distanceKm === 'number'
                                ? `${opp.distanceKm} km`
                                : 'Calculating...'}
                            </strong>
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium">
                          Max permitted: {opp.maxDistanceKm ?? '—'} km
                        </div>
                      </div>

                      {/* Interest Deadline */}
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                        <span className="flex items-center gap-1">
                          <CalendarClock size={12} className="text-gray-400" />
                          Deadline:
                        </span>
                        <span className="font-semibold text-gray-800">
                          {opp.interestDeadlineAt
                            ? new Date(opp.interestDeadlineAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'TBA'}
                        </span>
                      </div>

                      {opp.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 italic pt-1 border-t border-gray-100">
                          "{opp.description}"
                        </p>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="pt-4 mt-3 border-t border-gray-100">
                      {isAssigned ? (
                        <div className="text-center py-2 px-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-800 border border-emerald-200">
                          You are officially confirmed for this shift!
                        </div>
                      ) : isNotSelected ? (
                        <div className="text-center py-2.5 px-3.5 bg-rose-50/90 rounded-xl text-xs text-rose-800 border border-rose-200 shadow-2xs space-y-0.5">
                          <div className="flex items-center justify-center gap-1.5 font-bold text-rose-900">
                            <HeartHandshake size={14} className="text-rose-600" />
                            <span>Not selected for this shift</span>
                          </div>
                          <p className="text-rose-700/90 text-[11px] sm:text-xs">
                            Thank you for applying! Another candidate was selected this round. We appreciate your readiness and hope to work with you on upcoming events!
                          </p>
                        </div>
                      ) : isPending ? (
                        <div className="flex items-center justify-between text-xs text-blue-800 bg-blue-50/80 px-3 py-2 rounded-xl border border-blue-200">
                          <span className="flex items-center gap-1.5 font-medium">
                            <CheckCircle2 size={13} className="text-blue-600" />
                            Interest registered & pending selection
                          </span>
                        </div>
                      ) : isOverDistance ? (
                        <div className="text-center py-2 px-3 bg-rose-50 rounded-xl text-xs font-semibold text-rose-700 border border-rose-200">
                          Exceeds maximum permitted distance ({opp.distanceKm} km &gt; {opp.maxDistanceKm} km)
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleExpressInterest(opp.id)}
                          disabled={isSubmitting}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              Submitting Interest...
                            </>
                          ) : (
                            <>
                              <Send size={14} />
                              Express Interest
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY CONFIRMED ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-12 text-center">
              <RefreshCw size={24} className="text-amber-600 animate-spin mx-auto mb-2" />
              <p className="text-xs font-semibold text-gray-600">Loading assignments...</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200/80 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
                <CalendarClock size={20} />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No Work Assigned Yet</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                No work has been assigned to you yet. Your assignments will appear here when work becomes available.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('opportunities')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors mt-2"
              >
                Browse Open Opportunities
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Confirmed Staffing Schedule ({assignments.length})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Official shift assignments selected by the deterministic EventOps engine.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Event & Title</th>
                      <th className="py-3 px-4">Worker Role</th>
                      <th className="py-3 px-4">Event Date</th>
                      <th className="py-3 px-4">Reporting Time</th>
                      <th className="py-3 px-4">Venue Location</th>
                      <th className="py-3 px-4">Assigned On</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assignments.map((assign, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-gray-900">
                          {assign.eventTitle}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Briefcase size={12} className="text-amber-600" />
                            {assign.workerType}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-medium text-gray-700">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-gray-400 shrink-0" />
                            <span>{formatDisplayDate(assign.eventDate)}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-gray-800">
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-gray-400 shrink-0" />
                            <span>{formatDisplayTime(assign.reportingTime)}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-gray-400 shrink-0" />
                            <span className="truncate">
                              {assign.eventLocation?.address || 'Confirmed Venue'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-gray-500 font-mono text-[11px]">
                          {assign.assignedAt
                            ? new Date(assign.assignedAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            Confirmed
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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

          <div className="sm:col-span-2 p-3 bg-gray-50/80 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Base / Current Work Location
              </span>
              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                <MapPin size={14} className={hasValidLocation ? "text-emerald-600 shrink-0" : "text-amber-600 shrink-0"} />
                {hasValidLocation ? (
                  user?.location?.address || `Lat: ${user?.location?.lat?.toFixed(4)}, Lng: ${user?.location?.lng?.toFixed(4)}`
                ) : (
                  <span className="text-amber-700 italic font-medium">Not configured — action required</span>
                )}
              </p>
            </div>
            <Link
              to="/worker/location"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors shrink-0"
            >
              <MapPin size={13} />
              {hasValidLocation ? 'Update Location' : 'Set Up Location'}
            </Link>
          </div>
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
