import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import type { RootState } from '../../store';
import { getMyEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, Plus, List, Calendar, Clock, CheckCircle } from 'lucide-react';
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
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Welcome back, {user?.name}</h1>
          <p className="text-gray-500 mt-1">Here's what's happening with your events today.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/client/events" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm inline-flex items-center gap-2">
            <List className="w-4 h-4" />
            All Events
          </Link>
          <Link to="/client/events/create" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors shadow-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Event
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="bg-indigo-50 p-3 rounded-xl">
                <Calendar className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total Events</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{totalEvents}</h3>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="bg-blue-50 p-3 rounded-xl">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Events</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{activeEvents}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="bg-orange-50 p-3 rounded-xl">
                <CheckCircle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Action Required</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{pendingActionEvents}</h3>
                <p className="text-xs text-gray-500 mt-1">Awaiting payment</p>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Recent Active Events</h2>
            {upcomingEvents.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map(event => (
                  <EventCard key={event._id} event={event} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500">
                You have no active events. Start planning your next celebration!
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
