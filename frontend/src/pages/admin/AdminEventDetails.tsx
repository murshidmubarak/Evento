import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, Calendar, Clock, MapPin, Users, Mail, Phone, ArrowLeft, FileText, ImageIcon } from 'lucide-react';
import { ReadOnlyMap } from '../../components/common/ReadOnlyMap';

export const AdminEventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const data = await getEventById(id);
          setEvent(data);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load event details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 max-w-2xl mx-auto mt-8 shadow-sm">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error || 'Event not found'}</p>
        <Link to="/admin/events" className="inline-block mt-4 text-indigo-600 hover:underline font-medium">
          ← Back to Events
        </Link>
      </div>
    );
  }

  const client = event.clientId as any;
  const manager = event.eventManagerId as any;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/events" className="p-2 hover:bg-white/50 rounded-xl transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-500" />
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">{event.title}</h1>
              <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider
                ${event.status === 'requested' ? 'bg-amber-100 text-amber-800' : 
                  event.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 
                  'bg-gray-100 text-gray-800'}`}
              >
                {event.status}
              </span>
            </div>
            <p className="text-gray-500 font-medium">Event ID: {event._id}</p>
          </div>
        </div>
        <div>
          <Link
            to={`/admin/events/${event._id}/quotation/create`}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-xl font-semibold"
          >
            <FileText className="w-5 h-5" />
            Create Quotation
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Services Section */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 border border-white/40 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Selected Services</h2>
            
            {event.selectedServices && event.selectedServices.length > 0 ? (
              <div className="space-y-6">
                {event.selectedServices.map((service: any) => (
                  <div key={service.serviceId} className="bg-gray-50/80 rounded-2xl p-6 border border-gray-100">
                    <h3 className="text-xl font-bold text-indigo-900 mb-2">{service.serviceName}</h3>
                    {service.serviceDescription && (
                      <p className="text-gray-600 mb-4">{service.serviceDescription}</p>
                    )}
                    
                    {/* Preferences */}
                    {Object.keys(service.preferences || {}).length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Client Preferences</h4>
                        <div className="grid sm:grid-cols-2 gap-4">
                          {Object.entries(service.preferences).map(([key, value]: [string, any]) => (
                            <div key={key} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                              <span className="block text-xs text-gray-500 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                              <span className="font-medium text-gray-900">
                                {Array.isArray(value) ? value.join(', ') : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reference Images */}
                    {service.referenceImages && service.referenceImages.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4 text-gray-500" />
                          Reference Images
                        </h4>
                        <div className="flex gap-4 overflow-x-auto pb-2">
                          {service.referenceImages.map((img: any) => (
                            <a href={img.url} target="_blank" rel="noopener noreferrer" key={img.publicId} className="shrink-0">
                              <img 
                                src={img.url} 
                                alt="Reference" 
                                className="w-32 h-32 object-cover rounded-xl shadow-sm border border-gray-200 hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">No services selected.</p>
            )}
          </div>

          {/* Notes */}
          {event.notes && (
            <div className="bg-amber-50/80 backdrop-blur-xl rounded-3xl p-8 border border-amber-100/50 shadow-sm">
              <h2 className="text-xl font-bold text-amber-900 mb-4">Event Notes</h2>
              <p className="text-amber-800 whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
        </div>

        {/* Right Column - Meta Info */}
        <div className="space-y-6">
          
          {/* Event Particulars */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-white/40 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Event Particulars</h3>
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Date</p>
                  <p className="font-semibold text-gray-900">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Time</p>
                  <p className="font-semibold text-gray-900">{event.startTime} – {event.endTime}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 font-medium">Location</p>
                  <p className="font-semibold text-gray-900 mb-4">{event.location?.address || 'Not specified'}</p>
                  {event.location?.lat !== undefined && event.location?.lng !== undefined && (
                    <div className="w-full h-48 mt-2">
                      <ReadOnlyMap lat={event.location.lat} lng={event.location.lng} />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 mt-0.5">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Expected Guests</p>
                  <p className="font-semibold text-gray-900">{event.guestCount} pax</p>
                </div>
              </div>
            </div>
          </div>

          {/* Client Info */}
          <div className="bg-gray-900 rounded-3xl p-6 shadow-sm text-white">
            <h3 className="text-lg font-bold text-white mb-6">Client Information</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 font-medium mb-1">Host Name</p>
                <p className="font-semibold text-lg">{client?.name || 'Unknown'}</p>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">{client?.email || 'No email provided'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">{client?.phone || 'No phone provided'}</span>
              </div>
            </div>
          </div>

          {/* Manager Info */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-white/40 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Event Manager</h3>
            {manager ? (
              <div>
                <p className="font-semibold text-gray-900 text-lg">{manager.name}</p>
                <p className="text-gray-500">{manager.email}</p>
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-700 p-4 rounded-xl border border-amber-100 font-medium">
                Not Assigned Yet
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
