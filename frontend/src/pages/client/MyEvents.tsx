import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMyEvents } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { EventCard } from '../../features/events/components/EventCard';
import { Loader2, Plus, CalendarX2 } from 'lucide-react';

export const MyEvents = () => {
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getMyEvents();
        setEvents(data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load events');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">My Events</h1>
        <Link 
          to="/client/events/create" 
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-5 h-5" />
          Request New Event
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        </div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
          <p className="font-medium">{error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
            <CalendarX2 className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No events found</h3>
          <p className="text-gray-500 mb-6 max-w-md">You haven't requested any events yet. Start by requesting a new event to get a quotation.</p>
          <Link 
            to="/client/events/create" 
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <Plus className="w-5 h-5" />
            Request New Event
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <EventCard key={event._id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
};
