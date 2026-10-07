import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMyEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { EventCard } from '../../features/events/components/EventCard';
import { Loader2, Plus, CalendarX2, Search, Filter, RefreshCw } from 'lucide-react';

export const MyEvents = () => {
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEvents = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getMyEvents();
      setEvents(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = events.filter((ev) => {
    const title = ev.title || '';
    const type = ev.eventType || '';
    const address = ev.location?.address || '';
    const q = searchTerm.toLowerCase();

    const matchesSearch =
      title.toLowerCase().includes(q) ||
      type.toLowerCase().includes(q) ||
      address.toLowerCase().includes(q);

    const matchesStatus = statusFilter ? ev.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">My Events</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Track and manage all your requested and ongoing events.</p>
        </div>
        <Link 
          to="/client/events/create" 
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs text-xs sm:text-sm font-semibold shrink-0"
        >
          <Plus className="w-4 h-4" />
          Request New Event
        </Link>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by event title, type, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Filter className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-8 pr-8 py-2 border border-gray-200 rounded-lg text-xs sm:text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="requested">Requested</option>
              <option value="quoted">Quoted</option>
              <option value="awaiting_payment">Awaiting Payment</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {(searchTerm || statusFilter) && (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter(''); }}
              className="text-xs text-gray-500 hover:text-gray-900 underline whitespace-nowrap px-2"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-xl border border-gray-200/80">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-rose-50 text-rose-700 p-6 rounded-xl border border-rose-200 text-center">
          <p className="font-semibold text-sm mb-3">{error}</p>
          <button
            onClick={fetchEvents}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition-colors shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl shadow-xs border border-gray-200/90 p-8 sm:p-12 text-center flex flex-col items-center">
          <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <CalendarX2 className="w-7 h-7 text-indigo-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No events requested yet</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-6 max-w-sm">
            You haven't requested any events yet. Request an event to get an itemized commercial quotation.
          </p>
          <Link 
            to="/client/events/create" 
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs text-xs sm:text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Request New Event
          </Link>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-xl shadow-xs border border-gray-200/90 p-8 text-center">
          <p className="text-sm font-semibold text-gray-800">No events matching your filter</p>
          <p className="text-xs text-gray-500 mt-1">Try changing your search query or status filter.</p>
          <button
            onClick={() => { setSearchTerm(''); setStatusFilter(''); }}
            className="mt-4 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map(event => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
};
