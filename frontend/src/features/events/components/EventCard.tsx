import { Link } from 'react-router-dom';
import type { ClientEvent } from '../event.types';
import { Calendar, MapPin, Users, IndianRupee, Clock, ArrowRight } from 'lucide-react';

interface EventCardProps {
  event: ClientEvent;
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  requested: { bg: 'bg-amber-50 border-amber-200/70', text: 'text-amber-700', label: 'Requested' },
  quoted: { bg: 'bg-blue-50 border-blue-200/70', text: 'text-blue-700', label: 'Quoted' },
  awaiting_payment: { bg: 'bg-orange-50 border-orange-200/70', text: 'text-orange-700', label: 'Awaiting Payment' },
  confirmed: { bg: 'bg-emerald-50 border-emerald-200/70', text: 'text-emerald-700', label: 'Confirmed' },
  in_progress: { bg: 'bg-purple-50 border-purple-200/70', text: 'text-purple-700', label: 'In Progress' },
  completed: { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-700', label: 'Completed' },
  cancelled: { bg: 'bg-rose-50 border-rose-200/70', text: 'text-rose-700', label: 'Cancelled' },
};

export const EventCard = ({ event }: EventCardProps) => {
  const status = statusConfig[event.status] || {
    bg: 'bg-gray-100 border-gray-200',
    text: 'text-gray-700',
    label: event.status.replace(/_/g, ' ')
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-gray-200/90 hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden flex flex-col group">
      <div className="p-5 flex-grow">
        <div className="flex justify-between items-start gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
              {event.title}
            </h3>
            <p className="text-xs font-semibold text-indigo-600 mt-0.5">{event.eventType}</p>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        </div>

        <div className="space-y-2.5 mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center text-xs text-gray-600 gap-2.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
          </div>
          
          <div className="flex items-center text-xs text-gray-600 gap-2.5">
            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{event.startTime} – {event.endTime}</span>
          </div>

          <div className="flex items-start text-xs text-gray-600 gap-2.5">
            <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            <span className="line-clamp-1">{event.location.address}</span>
          </div>

          <div className="flex items-center text-xs text-gray-600 gap-2.5">
            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{event.guestCount} guests</span>
          </div>

          {event.budget !== undefined && event.budget > 0 && (
            <div className="flex items-center text-xs text-gray-600 gap-2.5">
              <IndianRupee className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>₹{event.budget.toLocaleString()} budget</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50/70 border-t border-gray-100">
        <Link 
          to={`/client/events/${event._id}`} 
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center justify-between w-full"
        >
          <span>View Details</span>
          <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};
