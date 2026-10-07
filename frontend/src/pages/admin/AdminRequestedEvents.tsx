import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, Search, Filter, CalendarX2, ArrowRight, MapPin, Users, ChevronRight } from 'lucide-react';

export const AdminRequestedEvents = () => {
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('requested');

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        // We can pass status to getAllEvents, or filter locally if backend returns all
        const data = await getAllEvents({ status: statusFilter });
        setEvents(data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load requested events');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [statusFilter]);

  const filteredEvents = events.filter(e => {
    const clientName = e.clientInfo?.name || (e.clientId as any)?.name || '';
    return e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
           clientName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider rounded-md border border-amber-200/50">Requested</span>;
      case 'confirmed':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-md border border-emerald-200/50">Confirmed</span>;
      case 'awaiting_payment':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md border border-blue-200/50">Awaiting Payment</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-200/50">{status.replace('_', ' ')}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            Event Requests
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Manage incoming client event requests and operational pipeline.</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-gray-400"
            placeholder="Search by event title or client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="awaiting_payment">Awaiting Payment</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[400px] bg-white rounded-xl border border-gray-200">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-100 shadow-sm">
          <p className="font-medium">{error}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <CalendarX2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No event requests found</h3>
          <p className="text-sm text-gray-500 max-w-md">There are no events matching your current filters or search terms.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Event Details</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Client & Services</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Date & Time</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEvents.map((event) => (
                  <tr key={event._id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 align-top">
                      <p className="font-bold text-gray-900 text-sm mb-1">{event.title}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {event.location?.address ? (
                          <span className="truncate max-w-[200px] inline-block align-bottom">{event.location.address}</span>
                        ) : 'Location pending'}
                      </p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <p className="font-semibold text-gray-900 text-sm mb-1">
                        {event.clientInfo?.name || (event.clientId as any)?.name || 'Unknown Client'}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {event.selectedServices?.slice(0, 2).map((s: any, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded uppercase tracking-wider">
                            {s.serviceName?.split(' ')[0]}
                          </span>
                        ))}
                        {event.selectedServices && event.selectedServices.length > 2 && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-semibold rounded">
                            +{event.selectedServices.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top text-sm">
                      <p className="font-semibold text-gray-900 mb-1">
                        {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500">
                        {event.startTime} - {event.endTime}
                      </p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      {getStatusBadge(event.status)}
                    </td>
                    <td className="px-6 py-4 align-top text-right">
                      <Link
                        to={`/admin/events/${event._id}`}
                        className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredEvents.map((event) => (
              <div key={event._id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900 text-sm truncate pr-4">{event.title}</h3>
                  {getStatusBadge(event.status)}
                </div>
                <p className="text-xs text-gray-500 mb-3 font-medium">
                  {event.clientInfo?.name || (event.clientId as any)?.name || 'Unknown Client'}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4">
                  <div className="flex items-center gap-1.5">
                    <CalendarX2 className="w-3.5 h-3.5" />
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {event.guestCount} pax
                  </div>
                </div>
                <Link
                  to={`/admin/events/${event._id}`}
                  className="flex items-center justify-center w-full gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-lg transition-colors font-medium text-xs"
                >
                  Manage Event
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
