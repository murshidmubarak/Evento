import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, Search, Filter, CalendarX2, ArrowRight } from 'lucide-react';

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight">
            Event Requests
          </h1>
          <p className="text-gray-500 mt-1">Manage incoming event requests from clients</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white/50 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-sm">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white/50 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all sm:text-sm"
            placeholder="Search by event title or client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-48 pl-3 pr-10 py-2.5 text-base border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-white/50"
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="awaiting_payment">Awaiting Payment</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 shadow-sm">
          <p className="font-medium text-lg">{error}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-sm border border-gray-100 p-16 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 transform rotate-3">
            <CalendarX2 className="w-10 h-10 text-indigo-500" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No event requests</h3>
          <p className="text-gray-500 max-w-md">There are no events matching your current filters.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <div 
              key={event._id} 
              className="group bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wider
                  ${event.status === 'requested' ? 'bg-amber-100 text-amber-800' : 
                    event.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 
                    'bg-gray-100 text-gray-800'}`}
                >
                  {event.status}
                </span>
                <span className="text-sm text-gray-400 font-medium">{new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                {event.title}
              </h3>
              <p className="text-sm text-gray-500 mb-4 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                {event.clientInfo?.name || (event.clientId as any)?.name || 'Unknown Client'}
              </p>

              <div className="space-y-3 mb-6 bg-gray-50/50 p-4 rounded-2xl">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date</span>
                  <span className="font-semibold text-gray-900">{new Date(event.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Time</span>
                  <span className="font-semibold text-gray-900">{event.startTime} - {event.endTime}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Guests</span>
                  <span className="font-semibold text-gray-900">{event.guestCount} pax</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Manager</span>
                  <span className={`font-semibold ${event.eventManagerId ? 'text-gray-900' : 'text-amber-600'}`}>
                    {(event.eventManagerId as any)?.name || 'Not Assigned Yet'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-6">
                {event.selectedServices?.map((s: any, idx: number) => (
                  <span key={s.serviceId?._id?.toString() || s.serviceId?.toString() || idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-lg font-medium">
                    {s.serviceName || 'Service'}
                  </span>
                ))}
              </div>

              <Link
                to={`/admin/events/${event._id}`}
                className="flex items-center justify-center w-full gap-2 bg-gray-900 hover:bg-indigo-600 text-white px-4 py-3 rounded-xl transition-colors font-medium shadow-sm"
              >
                View Details
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
