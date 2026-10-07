import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../../store';
import { getMyEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, Plus, List, Calendar, Clock, AlertCircle } from 'lucide-react';
import { EventCard } from '../../features/events/components/EventCard';

export const ClientDashboard = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getMyEvents();
        setEvents(data);
      } catch (error) {
        console.error("Failed to fetch events", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const totalEvents = events.length;
  const activeEvents = events.filter(e => !['completed', 'cancelled'].includes(e.status)).length;
  const pendingActionEvents = events.filter(e => e.status === 'awaiting_payment').length;
  // Get up to 3 most recent active events
  const upcomingEvents = events.filter(e => !['completed', 'cancelled'].includes(e.status)).slice(0, 3);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
            Welcome back, {user?.name || 'Client'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Here's what's happening with your event requests.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/client/events"
            className="px-3.5 py-2 bg-white border border-gray-200 text-gray-700 text-xs sm:text-sm font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-xs inline-flex items-center gap-2"
          >
            <List className="w-4 h-4 text-gray-500" />
            All Events
          </Link>
          <Link
            to="/client/events/create"
            className="px-4 py-2 bg-indigo-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-xs inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Request Event
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20 bg-white rounded-xl border border-gray-200/80">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Events</p>
                <h3 className="text-2xl font-black text-gray-900 mt-0.5">{totalEvents}</h3>
              </div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Events</p>
                <h3 className="text-2xl font-black text-gray-900 mt-0.5">{activeEvents}</h3>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200/90 shadow-xs flex items-center gap-4 sm:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Action Required</p>
                <h3 className="text-2xl font-black text-gray-900 mt-0.5">{pendingActionEvents}</h3>
                <p className="text-[11px] text-amber-600 font-medium">Awaiting payment</p>
              </div>
            </div>
          </div>

          {/* Recent Events Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-gray-900">Recent Active Events</h2>
              {events.length > 3 && (
                <Link to="/client/events" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                  View all ({events.length}) →
                </Link>
              )}
            </div>

            {upcomingEvents.length > 0 ? (
              <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map(event => (
                  <EventCard key={event._id} event={event} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200/90 p-8 sm:p-12 text-center">
                <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">No active events</h3>
                <p className="text-xs sm:text-sm text-gray-500 mb-5 max-w-sm mx-auto">
                  You don't have any active events currently. Submit an event request to get started.
                </p>
                <Link
                  to="/client/events/create"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs sm:text-sm font-semibold transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Request New Event
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
