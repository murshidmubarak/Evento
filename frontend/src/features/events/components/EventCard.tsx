import { Link } from 'react-router-dom';
import type { ClientEvent } from '../event.types';
import { Calendar, MapPin, Users, IndianRupee, Clock } from 'lucide-react';

interface EventCardProps {
  event: ClientEvent;
}

const statusColors: Record<string, { bg: string, text: string }> = {
  requested: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  quoted: { bg: 'bg-blue-100', text: 'text-blue-800' },
  awaiting_payment: { bg: 'bg-orange-100', text: 'text-orange-800' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-800' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
};

export const EventCard = ({ event }: EventCardProps) => {
  const statusFormat = statusColors[event.status] || { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden flex flex-col group">
      <div className="p-6 flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
              {event.title}
            </h3>
            <p className="text-sm font-medium text-indigo-600">{event.eventType}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusFormat.bg} ${statusFormat.text}`}>
            {event.status.replace('_', ' ')}
          </span>
        </div>

        <div className="space-y-3 mt-5">
          <div className="flex items-center text-sm text-gray-600 gap-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>{new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          
          <div className="flex items-center text-sm text-gray-600 gap-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>{event.startTime} - {event.endTime}</span>
          </div>

          <div className="flex items-start text-sm text-gray-600 gap-3">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{event.location.address}</span>
          </div>

          <div className="flex items-center text-sm text-gray-600 gap-3">
            <Users className="w-4 h-4 text-gray-400" />
            <span>{event.guestCount} guests expected</span>
          </div>

          {event.budget !== undefined && event.budget > 0 && (
            <div className="flex items-center text-sm text-gray-600 gap-3">
              <IndianRupee className="w-4 h-4 text-gray-400" />
              <span>{event.budget.toLocaleString()} budget</span>
            </div>
          )}
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
        <Link 
          to={`/client/events/${event._id}`} 
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center justify-between w-full"
        >
          View Details
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </div>
  );
};
