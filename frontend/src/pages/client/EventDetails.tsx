import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, ArrowLeft, Calendar, MapPin, Users, IndianRupee, Clock, CheckCircle } from 'lucide-react';

const statusColors: Record<string, { bg: string, text: string }> = {
  requested: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  quoted: { bg: 'bg-blue-100', text: 'text-blue-800' },
  awaiting_payment: { bg: 'bg-orange-100', text: 'text-orange-800' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-800' },
  completed: { bg: 'bg-gray-100', text: 'text-gray-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
};

export const EventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) return;
      try {
        const data = await getEventById(id);
        setEvent(data);
      } catch (err: any) {
        if (err.response?.status === 404 || err.response?.status === 403) {
          setError(err.response?.data?.message || 'Event not found or access denied.');
        } else {
          setError('An unexpected error occurred while loading event details.');
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-3xl mx-auto mt-8 bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200 text-center">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="font-medium mb-6">{error}</p>
        <Link to="/client/events" className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to My Events
        </Link>
      </div>
    );
  }

  const renderPreferences = (preferences: any, serviceName: string) => {
    if (!preferences || Object.keys(preferences).length === 0) {
      return <p className="text-sm text-gray-500 mt-1">No special preferences added.</p>;
    }
    if (Object.keys(preferences).length === 1 && preferences.notes) {
      return <p className="text-sm text-gray-700 mt-2 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">{preferences.notes}</p>;
    }

    const isCat = serviceName.toLowerCase().includes('catering');
    if (isCat) {
      return (
        <div className="mt-2 text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
          {preferences.serviceMode?.length > 0 && (
            <div><span className="font-semibold text-gray-900 block mb-1">Service Mode</span><ul className="list-disc pl-5">{preferences.serviceMode.map((m:string)=><li key={m}>{m}</li>)}</ul></div>
          )}
          {preferences.mainDishes?.length > 0 && (
            <div><span className="font-semibold text-gray-900 block mb-1">Main Dishes</span><ul className="list-disc pl-5">{preferences.mainDishes.map((m:string)=><li key={m}>{m}</li>)}</ul></div>
          )}
          {preferences.juices?.length > 0 && (
            <div><span className="font-semibold text-gray-900 block mb-1">Juices & Drinks</span><ul className="list-disc pl-5">{preferences.juices.map((m:string)=><li key={m}>{m}</li>)}</ul></div>
          )}
          {preferences.desserts?.length > 0 && (
            <div><span className="font-semibold text-gray-900 block mb-1">Desserts</span><ul className="list-disc pl-5">{preferences.desserts.map((m:string)=><li key={m}>{m}</li>)}</ul></div>
          )}
        </div>
      );
    }
    const isDec = serviceName.toLowerCase().includes('decoration');
    if (isDec) {
      return (
        <div className="mt-2 text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
          {preferences.style && <div><span className="font-semibold text-gray-900">Style: </span>{preferences.style}</div>}
          {(preferences.stageRequired || preferences.entranceRequired) && (
            <div><span className="font-semibold text-gray-900 block mb-1">Requirements:</span><ul className="list-disc pl-5">{preferences.stageRequired && <li>Stage Decoration</li>}{preferences.entranceRequired && <li>Entrance Decoration</li>}</ul></div>
          )}
          {preferences.themeNotes && <div><span className="font-semibold text-gray-900 block mb-1">Theme Notes:</span><p>{preferences.themeNotes}</p></div>}
          {preferences.additionalNotes && <div><span className="font-semibold text-gray-900 block mb-1">Additional Notes:</span><p>{preferences.additionalNotes}</p></div>}
        </div>
      );
    }
    const isPhoto = serviceName.toLowerCase().includes('photo') || serviceName.toLowerCase().includes('video');
    if (isPhoto) {
      return (
        <div className="mt-2 text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
          {preferences.package && <div><span className="font-semibold text-gray-900">Package: </span>{preferences.package}</div>}
          {preferences.requirements && <div><span className="font-semibold text-gray-900 block mb-1">Requirements:</span><p>{preferences.requirements}</p></div>}
        </div>
      );
    }
    return (
      <div className="mt-2 text-sm text-gray-700 bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3">
         {Object.entries(preferences).map(([key, value]) => {
           const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
           return (
             <div key={key}>
               <span className="font-semibold text-gray-900 block mb-1">{label}:</span>
               <p>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
             </div>
           );
         })}
      </div>
    );
  };

  const statusFormat = statusColors[event.status] || { bg: 'bg-gray-100', text: 'text-gray-800' };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <button 
          onClick={() => navigate('/client/events')} 
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Events
        </button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{event.title}</h1>
            <p className="text-lg font-medium text-indigo-600 mt-1">{event.eventType}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-bold capitalize ${statusFormat.bg} ${statusFormat.text}`}>
            {event.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Event Schedule</h2>
          
          <div className="flex items-center gap-3">
            <div className="bg-indigo-50 p-2 rounded-lg">
              <Calendar className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Date</p>
              <p className="text-base font-semibold text-gray-900">
                {new Date(event.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Time</p>
              <p className="text-base font-semibold text-gray-900">
                {event.startTime} - {event.endTime}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mb-2 border-b border-gray-100 pb-2">Event Details</h2>
          
          <div className="flex items-start gap-3">
            <div className="bg-green-50 p-2 rounded-lg">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Location</p>
              <p className="text-base font-semibold text-gray-900">{event.location.address}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-2 rounded-lg">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Guest Count</p>
              <p className="text-base font-semibold text-gray-900">{event.guestCount} guests</p>
            </div>
          </div>

          {event.budget !== undefined && event.budget > 0 && (
            <div className="flex items-center gap-3">
              <div className="bg-purple-50 p-2 rounded-lg">
                <IndianRupee className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Budget</p>
                <p className="text-base font-semibold text-gray-900">{event.budget.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Requested Services</h2>
        {event.selectedServices.length > 0 ? (
          <div className="space-y-4">
            {event.selectedServices.map((svc: any, idx) => (
              <div key={idx} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                <div className="mt-1">
                  <CheckCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <div className="mb-2">
                    <h4 className="text-base font-bold text-gray-900">{svc.serviceName || 'Unknown Service'}</h4>
                    {svc.serviceDescription && <p className="text-xs text-gray-500 mt-0.5">{svc.serviceDescription}</p>}
                  </div>
                  {renderPreferences(svc.preferences, svc.serviceName || '')}
                  
                  {/* Reference Images */}
                  <div className="mt-4 pt-3 border-t border-gray-200/60">
                    <span className="font-semibold text-sm text-gray-900 block mb-3">Reference Images</span>
                    {svc.referenceImages && svc.referenceImages.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {svc.referenceImages.map((img: any, i: number) => (
                          <a 
                            key={i} 
                            href={img.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer group"
                          >
                            <img 
                              src={img.url} 
                              alt={img.fileName || 'Reference image'} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="%23f3f4f6"><rect width="100%" height="100%"/></svg>';
                                (e.target as HTMLImageElement).title = 'Image failed to load';
                              }}
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No reference images uploaded.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No services requested.</p>
        )}
      </div>

      {event.notes && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Additional Notes</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{event.notes}</p>
        </div>
      )}

      {event.eventManagerId && (
        <div className="bg-indigo-50 rounded-2xl p-6 shadow-sm border border-indigo-100">
          <h2 className="text-lg font-bold text-indigo-900 mb-2">Assigned Event Manager</h2>
          <p className="text-indigo-800">Your event has been assigned to a manager. They will coordinate with you shortly.</p>
        </div>
      )}
    </div>
  );
};
