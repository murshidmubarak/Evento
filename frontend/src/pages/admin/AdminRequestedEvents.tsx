import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAllEvents } from '../../features/events/eventsApi';
import type { ClientEvent, EventStatus } from '../../features/events/event.types';
import { Loader2, Search, Filter, CalendarX2, Eye } from 'lucide-react';

export const AdminRequestedEvents = () => {
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const data = await getAllEvents({ status: statusFilter });
        setEvents(data);
        setCurrentPage(1);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load event requests');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [statusFilter]);

  const filteredEvents = events.filter((e) => {
    const clientName = e.clientInfo?.name || (typeof e.clientId === 'object' && (e.clientId as any)?.name) || '';
    const title = e.title || '';
    const query = searchTerm.toLowerCase();
    return title.toLowerCase().includes(query) || clientName.toLowerCase().includes(query);
  });

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: EventStatus | string) => {
    switch (status) {
      case 'requested':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Requested
          </span>
        );
      case 'quoted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-full border border-purple-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Quoted
          </span>
        );
      case 'awaiting_payment':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            Awaiting Payment
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Confirmed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            {status.replace('_', ' ')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111827] tracking-tight">
            Event Requests
          </h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Manage incoming client event requests and operational bookings.
          </p>
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
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="block w-full sm:w-48 pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="quoted">Quoted</option>
            <option value="awaiting_payment">Awaiting Payment</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
      </div>

      {/* Main Table Area */}
      {isLoading ? (
        <div className="flex justify-center items-center min-h-[380px] bg-white rounded-xl border border-gray-200 shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 shadow-sm">
          <p className="font-medium text-sm">{error}</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center flex flex-col items-center shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <CalendarX2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No event requests found</h3>
          <p className="text-sm text-gray-500 max-w-md">There are no events matching your current search or status filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600">Event</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600">Client</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600">Guests</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600 text-center">Status</th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedEvents.map((event) => {
                  const clientName = event.clientInfo?.name || (typeof event.clientId === 'object' && (event.clientId as any)?.name) || 'Unknown Client';
                  return (
                    <tr key={event._id} className="hover:bg-gray-50/60 transition-colors group">
                      <td className="px-6 py-3.5">
                        <span className="font-semibold text-gray-900 text-sm">{event.title}</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="text-sm text-gray-700">{clientName}</span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-600">
                        {new Date(event.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-600">
                        {event.guestCount}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-center">
                        {getStatusBadge(event.status)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-right">
                        <Link
                          to={`/admin/events/${event._id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-lg transition-colors shadow-2xs"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500 group-hover:text-indigo-600" />
                          <span>View</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50/70 flex items-center justify-between sm:justify-end gap-4">
              <span className="text-xs sm:text-sm text-gray-500">
                Page <span className="font-semibold text-gray-900">{currentPage}</span> of{' '}
                <span className="font-semibold text-gray-900">{totalPages}</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-200 bg-white rounded-lg text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
