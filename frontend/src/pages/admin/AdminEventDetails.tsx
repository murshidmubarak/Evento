import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { ClientEvent } from '../../features/events/event.types';
import type { Quotation } from '../../features/quotations/quotation.types';
import { Loader2, Calendar, Clock, MapPin, Users, Mail, Phone, ArrowLeft, FileText, ImageIcon, Eye, Building2, User } from 'lucide-react';
import { ReadOnlyMap } from '../../components/common/ReadOnlyMap';

export const AdminEventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const eventData = await getEventById(id);
          setEvent(eventData);

          try {
            const quotationsData = await getQuotations(id);
            if (quotationsData && quotationsData.length > 0) {
              setQuotation(quotationsData[0]);
            }
          } catch (qErr) {
            console.error('Failed to fetch quotation for this event', qErr);
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load event details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEventData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 max-w-2xl mx-auto shadow-sm">
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p>{error || 'Unable to load event details.'}</p>
        <div className="mt-6">
          <Link to="/admin/events" className="inline-flex items-center gap-2 bg-white text-red-700 px-4 py-2 border border-red-200 rounded-lg hover:bg-red-50 font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Link>
        </div>
      </div>
    );
  }

  const client = event.clientId as any;
  const manager = event.eventManagerId as any;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider rounded-md border border-amber-200/50">Requested</span>;
      case 'confirmed':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-md border border-emerald-200/50">Confirmed</span>;
      case 'awaiting_payment':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md border border-blue-200/50">Awaiting Payment</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-200/50">{status.replace('_', ' ')}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">

      {/* Breadcrumbs & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link to="/admin/events" className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors text-gray-500 shadow-sm shrink-0 mt-0.5 sm:mt-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex flex-wrap items-center gap-2.5">
              <span>{event.title}</span>
              {getStatusBadge(event.status)}
            </h1>
            <p className="text-gray-400 text-xs mt-1 font-mono truncate">{event._id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!quotation || quotation.status === 'draft' ? (
            <Link
              to={`/admin/events/${event._id}/quotation/create${quotation?._id ? `?draftId=${quotation._id}` : ''}`}
              className="flex items-center gap-2 bg-[#111827] text-white px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
            >
              <FileText className="w-4 h-4" />
              {quotation?.status === 'draft' ? 'Continue Draft Quotation' : 'Create Quotation'}
            </Link>
          ) : quotation.status === 'changes_requested' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/admin/events/${event._id}/quotation/create?revise=${quotation._id}`}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 sm:px-5 py-2.5 rounded-lg transition-colors shadow-sm font-bold text-xs sm:text-sm"
              >
                <FileText className="w-4 h-4" />
                Review & Edit Changes
              </Link>
              <Link
                to={`/admin/quotations/${quotation._id}`}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
              >
                <Eye className="w-4 h-4 text-gray-500" />
                View Quotation
              </Link>
            </div>
          ) : (
            <Link
              to={`/admin/quotations/${quotation._id}`}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
            >
              <Eye className="w-4 h-4 text-gray-500" />
              View Quotation
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left Column - Main Details */}
        <div className="xl:col-span-2 space-y-6">

          {/* Selected Services Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Selected Services</h2>
            </div>

            <div className="p-6">
              {event.selectedServices && event.selectedServices.length > 0 ? (
                <div className="space-y-6">
                  {event.selectedServices.map((service: any) => (
                    <div key={service.serviceId} className="border border-gray-200 rounded-lg p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-1">{service.serviceName}</h3>
                          {service.serviceDescription && (
                            <p className="text-sm text-gray-500">{service.serviceDescription}</p>
                          )}
                        </div>
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-widest rounded border border-indigo-100">
                          Service
                        </span>
                      </div>

                      {/* Client Preferences */}
                      {Object.keys(service.preferences || {}).length > 0 && (
                        <div className="mb-5 bg-gray-50 rounded-lg p-4 border border-gray-100">
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Client Preferences</h4>
                          <div className="grid sm:grid-cols-2 gap-y-3 gap-x-4">
                            {Object.entries(service.preferences).map(([key, value]: [string, any]) => {
                              const renderVal = (v: any): React.ReactNode => {
                                if (v === null || v === undefined) return 'None';
                                if (Array.isArray(v)) {
                                  if (v.length === 0) return 'None';
                                  return (
                                    <div className="space-y-1 mt-0.5">
                                      {v.map((item: any, idx: number) => {
                                        if (typeof item === 'string') {
                                          return <div key={idx} className="text-xs text-gray-800">• {item}</div>;
                                        }
                                        if (typeof item === 'object' && item !== null) {
                                          const headingName = item.heading || item.name || item.title;
                                          if (headingName && Array.isArray(item.items)) {
                                            return (
                                              <div key={idx} className="text-xs text-gray-800">
                                                <span className="font-semibold">• {headingName}:</span> {item.items.join(', ')}
                                              </div>
                                            );
                                          }
                                          const title = item.title || item.name || '';
                                          const desc = item.description || item.details || '';
                                          return (
                                            <div key={idx} className="text-xs text-gray-800">
                                              <span className="font-semibold">• {title}</span>
                                              {desc && <span className="text-gray-500">: {desc}</span>}
                                            </div>
                                          );
                                        }
                                        return <div key={idx} className="text-xs text-gray-800">• {String(item)}</div>;
                                      })}
                                    </div>
                                  );
                                }
                                if (typeof v === 'object' && v !== null) {
                                  return JSON.stringify(v);
                                }
                                return String(v);
                              };

                              return (
                                <div key={key}>
                                  <span className="block text-[11px] font-medium text-gray-500 mb-0.5 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {renderVal(value)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Reference Images */}
                      {service.referenceImages && service.referenceImages.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Reference Images
                          </h4>
                          <div className="flex gap-3 overflow-x-auto pb-2">
                            {service.referenceImages.map((img: any) => (
                              <a href={img.url} target="_blank" rel="noopener noreferrer" key={img.publicId} className="shrink-0 group">
                                <img
                                  src={img.url}
                                  alt="Reference"
                                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-90 transition-opacity shadow-sm"
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
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 italic">This event does not contain any selected services.</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes Card */}
          {event.notes && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-200 bg-amber-100/50">
                <h2 className="text-base font-bold text-amber-900">Client Notes</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{event.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Meta Info */}
        <div className="space-y-6">

          {/* Client Information */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Client Information</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Host Name</p>
                  <p className="font-bold text-gray-900 truncate">{event.clientInfo?.name || client?.name || 'Unknown'}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700 truncate">{event.clientInfo?.email || client?.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{event.clientInfo?.phone || client?.phone || 'No phone provided'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Event Particulars */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Event Information</h3>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Date</p>
                  <p className="text-sm font-semibold text-gray-900">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Time</p>
                  <p className="text-sm font-semibold text-gray-900">{event.startTime} – {event.endTime}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Expected Guests</p>
                  <p className="text-sm font-semibold text-gray-900">{event.guestCount} pax</p>
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Location</h3>
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-gray-900">{event.location?.address || 'Not specified'}</p>
              </div>
              {event.location?.lat !== undefined && event.location?.lng !== undefined && (
                <div className="w-full h-40 rounded-lg overflow-hidden border border-gray-200">
                  <ReadOnlyMap lat={event.location.lat} lng={event.location.lng} />
                </div>
              )}
            </div>
          </div>

          {/* Manager Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Event Manager</h3>
            </div>
            <div className="p-5">
              {manager ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{manager.name}</p>
                    <p className="text-xs text-gray-500">{manager.email}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                  <p className="text-sm font-medium text-gray-500">Not Assigned Yet</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
