import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { managerApi, type ManagerEvent } from '../../features/manager/managerApi';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Loader2,
  CalendarX,
  ArrowRight,
  ShieldCheck,
  User,
  Briefcase,
} from 'lucide-react';

export const ManagerEventList: React.FC = () => {
  const [events, setEvents] = useState<ManagerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEvents = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await managerApi.getManagerEvents();
      setEvents(data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to retrieve assigned events.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Status filter
      if (selectedStatus !== 'all' && ev.status !== selectedStatus) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const clientName = (ev.clientId?.name || ev.clientInfo?.name || '').toLowerCase();
        const title = (ev.title || '').toLowerCase();
        const eventType = (ev.eventType || '').toLowerCase();
        const address = (ev.location?.address || '').toLowerCase();
        return (
          title.includes(query) ||
          clientName.includes(query) ||
          eventType.includes(query) ||
          address.includes(query)
        );
      }
      return true;
    });
  }, [events, selectedStatus, searchQuery]);

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
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <ShieldCheck size={14} className="text-emerald-600" />
                Operations Management
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Assigned Events
            </h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              Overview and field access for confirmed events assigned to your management account.
            </p>
          </div>

          <button
            onClick={fetchEvents}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-emerald-600' : ''} />
            Refresh
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-6 pt-6 border-t border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selectedStatus === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by title, host, venue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-semibold">Error:</span> {error}
          </div>
          <button
            onClick={fetchEvents}
            className="text-xs font-semibold text-red-700 hover:text-red-900 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-16 text-center flex flex-col items-center justify-center">
          <Loader2 className="w-9 h-9 text-emerald-600 animate-spin mb-4" />
          <h3 className="text-base font-bold text-gray-900">Loading Events...</h3>
          <p className="text-sm text-gray-500 mt-1">Retrieving assigned event records.</p>
        </div>
      ) : events.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-10 sm:p-16 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-xs border border-emerald-100">
            <CalendarX size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Events Assigned</h2>
          <p className="text-gray-600 mt-2 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
            No events have been assigned to you yet. Your assigned events will appear here when the Admin assigns them.
          </p>
          <div className="mt-8">
            <button
              onClick={fetchEvents}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors"
            >
              <RefreshCw size={16} />
              Check for Assignments
            </button>
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        /* Filter Empty State */
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-12 text-center">
          <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-800">No Matching Events Found</h3>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your search query or selected status filter.
          </p>
          <button
            onClick={() => {
              setSelectedStatus('all');
              setSearchQuery('');
            }}
            className="mt-4 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        /* Events Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const client = event.clientId || event.clientInfo;
            return (
              <div
                key={event._id}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="text-xs font-bold px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md uppercase tracking-wider">
                      {event.eventType}
                    </span>
                    {getStatusBadge(event.status)}
                  </div>

                  <h3 className="font-bold text-gray-900 text-lg mb-3 line-clamp-1">
                    {event.title}
                  </h3>

                  <div className="space-y-2.5 text-xs text-gray-600 mb-5">
                    <div className="flex items-center gap-2.5">
                      <Calendar size={15} className="text-gray-400 shrink-0" />
                      <span className="font-medium text-gray-800">
                        {new Date(event.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Clock size={15} className="text-gray-400 shrink-0" />
                      <span>{event.startTime} – {event.endTime}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <MapPin size={15} className="text-gray-400 shrink-0" />
                      <span className="truncate">{event.location?.address || 'Location TBA'}</span>
                    </div>

                    {client?.name && (
                      <div className="flex items-center gap-2.5">
                        <User size={15} className="text-gray-400 shrink-0" />
                        <span className="truncate">Host: {client.name}</span>
                      </div>
                    )}

                    {event.guestCount !== undefined && (
                      <div className="flex items-center gap-2.5">
                        <Users size={15} className="text-gray-400 shrink-0" />
                        <span>{event.guestCount} Expected Guests</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-gray-400">
                    ID: {event._id.slice(-6).toUpperCase()}
                  </span>
                  <div className="flex items-center gap-2">
                    {event.status === 'confirmed' && (
                      <Link
                        to={`/manager/events/${event._id}?tab=requirements`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs rounded-lg transition-colors"
                        title="Work Requirements"
                      >
                        <Briefcase size={13} />
                        Requirements
                      </Link>
                    )}
                    <Link
                      to={`/manager/events/${event._id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-lg transition-colors"
                    >
                      View Details
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
