import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { managerApi, type ManagerEvent, type ManagerStats } from '../../features/manager/managerApi';
import {
  ShieldCheck,
  CalendarX,
  RefreshCw,
  AlertCircle,
  Loader2,
  MapPin,
  Calendar,
  Clock,
  Users,
  Briefcase,
  ArrowRight,
  CheckCircle2,
  PlayCircle,
  CalendarClock,
  User,
} from 'lucide-react';

export const ManagerDashboard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);

  const [events, setEvents] = useState<ManagerEvent[]>([]);
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const computeFallbackStats = (eventList: ManagerEvent[]) => {
    setStats({
      totalAssigned: eventList.length,
      upcoming: eventList.filter((e) => e.status === 'confirmed').length,
      ongoing: eventList.filter((e) => e.status === 'in_progress').length,
      completed: eventList.filter((e) => e.status === 'completed').length,
    });
  };

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const eventsData = await managerApi.getManagerEvents();
      setEvents(eventsData || []);

      try {
        if (typeof managerApi.getDashboardStats === 'function') {
          const statsRes = await managerApi.getDashboardStats();
          if (statsRes && typeof statsRes.totalAssigned === 'number') {
            setStats(statsRes);
          } else {
            computeFallbackStats(eventsData || []);
          }
        } else {
          computeFallbackStats(eventsData || []);
        }
      } catch {
        computeFallbackStats(eventsData || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Confirmed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            {status?.replace('_', ' ')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner / Welcome Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-50 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <ShieldCheck size={14} className="text-emerald-600" />
                Event Manager
              </span>
              {user?.businessId && (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-700 rounded border border-gray-200">
                  ID: EM-{user.businessId}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Event Manager Dashboard
            </h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              Welcome back, <span className="font-semibold text-gray-800">{user?.name}</span> ({user?.email})
            </p>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-emerald-600' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Assigned</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Briefcase size={16} />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-gray-900">{stats.totalAssigned}</div>
            <div className="text-xs text-gray-500 mt-1">All-time assignments</div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Upcoming</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
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
            <div className="text-xs text-gray-500 mt-1">Currently executing</div>
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
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-semibold">Unable to load dashboard data:</span> {error}
          </div>
          <button
            onClick={fetchDashboardData}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-16 text-center flex flex-col items-center justify-center">
          <Loader2 className="w-9 h-9 text-emerald-600 animate-spin mb-4" />
          <h3 className="text-base font-bold text-gray-900">Loading Assigned Events...</h3>
          <p className="text-sm text-gray-500 mt-1">Fetching your operational assignments from the server.</p>
        </div>
      ) : events.length === 0 ? (
        /* Empty State (Part C Requirement) */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-10 sm:p-16 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xs border border-emerald-100">
            <CalendarX size={32} />
          </div>

          <h2 className="text-xl font-bold text-gray-900">No Events Assigned</h2>

          <p className="text-gray-600 mt-2 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
            No events have been assigned to you yet. Your assigned events will appear here when the Admin assigns them.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
            >
              <RefreshCw size={16} />
              Check for Assignments
            </button>
          </div>
        </div>
      ) : (
        /* Assigned Events List (When events exist) */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Briefcase size={20} className="text-emerald-600" />
              Assigned Events ({events.length})
            </h2>

            <Link
              to="/manager/events"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              View All Events
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {events.map((event) => {
              const client = event.clientId || event.clientInfo;
              return (
                <div
                  key={event._id}
                  className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className="text-xs font-semibold px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded uppercase tracking-wider">
                        {event.eventType}
                      </span>
                      {getStatusBadge(event.status)}
                    </div>

                    <h3 className="font-bold text-gray-900 text-base mb-3 line-clamp-1">
                      {event.title}
                    </h3>

                    <div className="space-y-2 text-xs text-gray-600 mb-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400 shrink-0" />
                        <span>
                          {new Date(event.date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400 shrink-0" />
                        <span>{event.startTime} – {event.endTime}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-400 shrink-0" />
                        <span className="truncate">{event.location?.address || 'Location TBA'}</span>
                      </div>

                      {client?.name && (
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-gray-400 shrink-0" />
                          <span className="truncate">Host: {client.name}</span>
                        </div>
                      )}

                      {event.guestCount !== undefined && (
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-gray-400 shrink-0" />
                          <span>{event.guestCount} guests</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-gray-400">
                      ID: {event._id.slice(-6).toUpperCase()}
                    </span>
                    <Link
                      to={`/manager/events/${event._id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      View Details
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
