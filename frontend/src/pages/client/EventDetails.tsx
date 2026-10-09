import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import type { ClientEvent } from '../../features/events/event.types';
import { Loader2, ArrowLeft, Calendar, MapPin, Users, IndianRupee, Clock, CheckCircle2, User, Mail, Phone, Sparkles } from 'lucide-react';

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  requested: { bg: 'bg-amber-50 border-amber-200/70', text: 'text-amber-700', label: 'Requested' },
  quoted: { bg: 'bg-blue-50 border-blue-200/70', text: 'text-blue-700', label: 'Quoted' },
  awaiting_payment: { bg: 'bg-orange-50 border-orange-200/70', text: 'text-orange-700', label: 'Awaiting Payment' },
  confirmed: { bg: 'bg-emerald-50 border-emerald-200/70', text: 'text-emerald-700', label: 'Confirmed' },
  in_progress: { bg: 'bg-purple-50 border-purple-200/70', text: 'text-purple-700', label: 'In Progress' },
  completed: { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-700', label: 'Completed' },
  cancelled: { bg: 'bg-rose-50 border-rose-200/70', text: 'text-rose-700', label: 'Cancelled' },
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
      <div className="flex justify-center items-center py-24 bg-white rounded-xl border border-gray-200/80">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl mx-auto my-8 bg-rose-50 text-rose-700 p-8 rounded-xl border border-rose-200 text-center">
        <h2 className="text-lg font-bold mb-2">Event Not Available</h2>
        <p className="text-sm font-medium mb-6 text-rose-600">{error || 'Event details could not be found.'}</p>
        <Link to="/client/events" className="inline-flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 text-xs sm:text-sm font-semibold transition-colors shadow-xs">
          <ArrowLeft className="w-4 h-4" />
          Back to My Events
        </Link>
      </div>
    );
  }

  const renderRequirementList = (items: any) => {
    if (!items) return null;
    if (typeof items === 'string') {
      return <p className="text-gray-600">{items}</p>;
    }
    if (Array.isArray(items)) {
      if (items.length === 0) return null;
      return (
        <div className="mt-1 space-y-1">
          {items.map((item: any, idx: number) => {
            if (typeof item === 'string') {
              return (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="font-bold text-indigo-600">•</span>
                  <span>{item}</span>
                </div>
              );
            }
            if (typeof item === 'object' && item !== null) {
              const title = (item.title || item.name || '').trim();
              const desc = (item.description || item.details || '').trim();
              if (!title && !desc) return null;
              return (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <span className="font-bold text-indigo-600">•</span>
                  <span>
                    <span className="font-semibold text-gray-900">{title}</span>
                    {desc ? <span className="text-gray-500">: {desc}</span> : null}
                  </span>
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }
    return <p className="text-gray-600">{String(items)}</p>;
  };

  const renderPreferences = (preferences: any, serviceName: string) => {
    if (!preferences || Object.keys(preferences).length === 0) {
      return <p className="text-xs text-gray-500 mt-1 italic">No special preferences specified.</p>;
    }
    if (Object.keys(preferences).length === 1 && preferences.notes) {
      return <p className="text-xs text-gray-700 mt-2 bg-white p-3 rounded-lg border border-gray-200 shadow-xs">{preferences.notes}</p>;
    }

    const isCat = serviceName.toLowerCase().includes('catering');
    if (isCat) {
      return (
        <div className="mt-2 text-xs text-gray-700 bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs space-y-2.5">
          {preferences.serviceMode?.length > 0 && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Service Mode:</span><span className="text-gray-600">{preferences.serviceMode.join(', ')}</span></div>
          )}
          {preferences.starters?.length > 0 && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Starters:</span><span className="text-gray-600">{preferences.starters.map((d: any) => typeof d === 'object' && d !== null ? (d.title || JSON.stringify(d)) : d).join(', ')}</span></div>
          )}
          {preferences.mainDishes?.length > 0 && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Main Dishes:</span><span className="text-gray-600">{preferences.mainDishes.map((d: any) => typeof d === 'object' && d !== null ? (d.title || JSON.stringify(d)) : d).join(', ')}</span></div>
          )}
          {preferences.juices?.length > 0 && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Juices & Drinks:</span><span className="text-gray-600">{preferences.juices.map((d: any) => typeof d === 'object' && d !== null ? (d.title || JSON.stringify(d)) : d).join(', ')}</span></div>
          )}
          {preferences.desserts?.length > 0 && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Desserts:</span><span className="text-gray-600">{preferences.desserts.map((d: any) => typeof d === 'object' && d !== null ? (d.title || JSON.stringify(d)) : d).join(', ')}</span></div>
          )}
          {preferences.otherPreferences?.length > 0 && (
            <div>
              <span className="font-bold text-gray-900 block mb-0.5">Other Preferences:</span>
              <div className="space-y-1.5 mt-1 pl-1">
                {preferences.otherPreferences.map((pref: any, i: number) => {
                  if (typeof pref === 'string') {
                    return <div key={i} className="text-gray-600 text-sm">• {pref}</div>;
                  }
                  if (typeof pref === 'object' && pref !== null) {
                    const heading = pref.heading || pref.name || pref.title;
                    const items = Array.isArray(pref.items)
                      ? pref.items.map((d: any) => typeof d === 'object' && d !== null ? (d.title || d.name || JSON.stringify(d)) : String(d)).join(', ')
                      : String(pref.items || '');
                    return (
                      <div key={i} className="text-sm">
                        <span className="font-semibold text-gray-800">{heading}:</span>{' '}
                        <span className="text-gray-600">{items || 'None'}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          )}
          {preferences.customCategories?.map((cat: any, i: number) => 
            cat.items && cat.items.length > 0 ? (
              <div key={`cat-${i}`}>
                <span className="font-bold text-gray-900 block mb-0.5">{cat.name}:</span>
                <span className="text-gray-600">
                  {Array.isArray(cat.items)
                    ? cat.items.map((d: any) => typeof d === 'object' && d !== null ? (d.title || d.name || JSON.stringify(d)) : String(d)).join(', ')
                    : String(cat.items)}
                </span>
              </div>
            ) : null
          )}
          {preferences.otherRequirements && (
            <div>
              <span className="font-bold text-gray-900 block mb-0.5">Other Requests:</span>
              {renderRequirementList(preferences.otherRequirements)}
            </div>
          )}
          {preferences.notes && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Notes:</span><p className="text-gray-600">{preferences.notes}</p></div>
          )}
        </div>
      );
    }
    const isDec = serviceName.toLowerCase().includes('decoration');
    if (isDec) {
      return (
        <div className="mt-2 text-xs text-gray-700 bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs space-y-2">
          {preferences.style && <div><span className="font-bold text-gray-900">Style: </span><span className="text-gray-600">{preferences.style}</span></div>}
          {(preferences.stageRequired || preferences.entranceRequired) && (
            <div><span className="font-bold text-gray-900 block mb-0.5">Requirements:</span><span className="text-gray-600">{[preferences.stageRequired && 'Stage Decoration', preferences.entranceRequired && 'Entrance Decoration'].filter(Boolean).join(', ')}</span></div>
          )}
          {preferences.requirements && (
            <div>
              <span className="font-bold text-gray-900 block mb-0.5">Requirements:</span>
              {renderRequirementList(preferences.requirements)}
            </div>
          )}
          {preferences.themeNotes && <div><span className="font-bold text-gray-900 block mb-0.5">Theme Notes:</span><p className="text-gray-600">{preferences.themeNotes}</p></div>}
          {preferences.additionalNotes && <div><span className="font-bold text-gray-900 block mb-0.5">Additional Notes:</span><p className="text-gray-600">{preferences.additionalNotes}</p></div>}
        </div>
      );
    }
    const isPhoto = serviceName.toLowerCase().includes('photo') || serviceName.toLowerCase().includes('video');
    if (isPhoto) {
      return (
        <div className="mt-2 text-xs text-gray-700 bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs space-y-2">
          {preferences.package && <div><span className="font-bold text-gray-900">Package: </span><span className="text-gray-600">{preferences.package}</span></div>}
          {preferences.requirements && (
            <div>
              <span className="font-bold text-gray-900 block mb-0.5">Requirements:</span>
              {renderRequirementList(preferences.requirements)}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="mt-2 text-xs text-gray-700 bg-white p-3.5 rounded-lg border border-gray-200 shadow-xs space-y-2">
        {Object.entries(preferences).map(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
          return (
            <div key={key}>
              <span className="font-bold text-gray-900 block mb-0.5">{label}:</span>
              {Array.isArray(value) ? (
                renderRequirementList(value)
              ) : (
                <p className="text-gray-600">{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const status = statusConfig[event.status] || {
    bg: 'bg-gray-100 border-gray-200',
    text: 'text-gray-700',
    label: event.status.replace(/_/g, ' ')
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Top Header & Breadcrumb */}
      <div>
        <button
          onClick={() => navigate('/client/events')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to My Events
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{event.title}</h1>
            <p className="text-sm font-semibold text-indigo-600 mt-0.5">{event.eventType}</p>
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold border self-start sm:self-center ${status.bg} ${status.text}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Schedule */}
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-200/90 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Event Schedule</h2>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Time Window</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {event.startTime} – {event.endTime}
              </p>
            </div>
          </div>
        </div>

        {/* Details & Location */}
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-200/90 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Venue & Scale</h2>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Location</p>
              <p className="text-xs sm:text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{event.location.address}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Expected Guests</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">{event.guestCount} guests</p>
            </div>
          </div>

          {event.budget !== undefined && event.budget > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                <IndianRupee className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Allocated Budget</p>
                <p className="text-xs sm:text-sm font-bold text-gray-900">₹{event.budget.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Contact Info */}
        <div className="bg-white rounded-xl p-5 shadow-xs border border-gray-200/90 space-y-4 md:col-span-2 lg:col-span-1">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Client Information</h2>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">{event.clientInfo?.name || (event.clientId as any)?.name || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Phone</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">{event.clientInfo?.phone || (event.clientId as any)?.phone || 'Not provided'}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-gray-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Email</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{event.clientInfo?.email || (event.clientId as any)?.email || 'Not provided'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Requested Services Card */}
      <div className="bg-white rounded-xl p-5 sm:p-6 shadow-xs border border-gray-200/90">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Requested Services ({event.selectedServices.length})
          </h2>
        </div>

        {event.selectedServices.length > 0 ? (
          <div className="space-y-4">
            {event.selectedServices.map((svc: any, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50">
                <div className="flex items-start gap-3 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-gray-900">{svc.serviceName || 'Service Item'}</h4>
                    {svc.serviceDescription && <p className="text-xs text-gray-500 mt-0.5">{svc.serviceDescription}</p>}
                  </div>
                </div>

                {renderPreferences(svc.preferences, svc.serviceName || '')}

                {/* Reference Images Gallery */}
                {svc.referenceImages && svc.referenceImages.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200/60">
                    <span className="font-bold text-xs text-gray-700 block mb-2.5">
                      Reference Images ({svc.referenceImages.length})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {svc.referenceImages.map((img: any, i: number) => (
                        <a
                          key={i}
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white shadow-xs hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer group"
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
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic py-2">No specific services added to this event.</p>
        )}
      </div>

      {/* Additional Notes */}
      {event.notes && (
        <div className="bg-amber-50/60 rounded-xl p-5 shadow-xs border border-amber-200/80">
          <h2 className="text-sm font-bold text-amber-900 mb-2">Additional Client Notes</h2>
          <p className="text-xs sm:text-sm text-amber-800 whitespace-pre-wrap leading-relaxed">{event.notes}</p>
        </div>
      )}

      {/* Assigned Manager Banner */}
      {event.eventManagerId && (
        <div className="bg-indigo-50/80 rounded-xl p-5 shadow-xs border border-indigo-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            EM
          </div>
          <div>
            <h3 className="text-sm font-bold text-indigo-900">Event Manager Assigned</h3>
            <p className="text-xs text-indigo-700 mt-0.5">An Event Manager has been designated for your celebration and will coordinate the operations.</p>
          </div>
        </div>
      )}
    </div>
  );
};
