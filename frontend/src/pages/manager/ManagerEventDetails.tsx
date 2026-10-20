import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { managerApi, type ManagerEvent } from '../../features/manager/managerApi';
import { ReadOnlyMap } from '../../components/common/ReadOnlyMap';
import { WorkRequirementsSection } from '../../components/manager/WorkRequirementsSection';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  User,
  Mail,
  Phone,
  AlertCircle,
  Loader2,
  FileText,
  Sparkles,
  ShieldAlert,
  Compass,
  Briefcase,
  ArrowRight,
} from 'lucide-react';

export const ManagerEventDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [event, setEvent] = useState<ManagerEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeTab = searchParams.get('tab') === 'requirements' ? 'requirements' : 'overview';

  const setTab = (tab: 'overview' | 'requirements') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'requirements') {
        next.set('tab', 'requirements');
      } else {
        next.delete('tab');
      }
      return next;
    });
  };

  const fetchEventDetails = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setErrorStatus(null);
      setErrorMessage(null);

      const data = await managerApi.getManagerEventById(id);
      setEvent(data);
    } catch (err: any) {
      const status = err.response?.status;
      setErrorStatus(status || 500);
      setErrorMessage(
        err.response?.data?.message || 'Failed to load event operational details. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Confirmed
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-200">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 text-xs font-semibold rounded-full border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full border border-gray-200">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            {status?.replace('_', ' ')}
          </span>
        );
    }
  };

  // Helper to resolve coordinates if present
  const getCoordinates = () => {
    if (!event?.location) return null;
    const loc = event.location as any;
    const lat = loc.lat ?? loc.latitude ?? loc.coordinates?.lat;
    const lng = loc.lng ?? loc.longitude ?? loc.coordinates?.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
    return null;
  };

  // Safe client information accessor
  const getClientContact = () => {
    if (!event) return null;
    const client = event.clientId || event.clientInfo;
    if (!client) return null;
    return {
      name: client.name || 'Not provided',
      email: client.email || '',
      phone: client.phone || '',
    };
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-16 text-center flex flex-col items-center justify-center max-w-3xl mx-auto my-12">
        <Loader2 className="w-9 h-9 text-emerald-600 animate-spin mb-4" />
        <h3 className="text-base font-bold text-gray-900">Loading Event Details...</h3>
        <p className="text-sm text-gray-500 mt-1">Retrieving verified operational schedule and requirements.</p>
      </div>
    );
  }

  if (errorStatus === 403) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-rose-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <ShieldAlert size={28} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Access Prohibited</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          {errorMessage || 'You are not assigned to this event or do not possess authorization to view its details.'}
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/manager/events"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-lg transition-colors shadow-xs"
          >
            <ArrowLeft size={16} />
            Back to Assigned Events
          </Link>
        </div>
      </div>
    );
  }

  if (errorStatus === 404 || !event) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="w-14 h-14 bg-gray-50 text-gray-500 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Event Not Found</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          {errorMessage || 'The requested event record could not be found or has been removed.'}
        </p>
        <Link
          to="/manager/events"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-xs"
        >
          <ArrowLeft size={16} />
          Back to Assigned Events
        </Link>
      </div>
    );
  }

  const coords = getCoordinates();
  const clientContact = getClientContact();

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/manager/events"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Assigned Events
        </Link>
      </div>

      {/* Header Banner with Operational Tabs */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs relative overflow-hidden space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md">
                {event.eventType}
              </span>
              {getStatusBadge(event.status)}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {event.title}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Event Reference: <span className="font-mono text-gray-700 font-medium">{event._id}</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Compass size={15} />
            Event Overview
          </button>
          <button
            type="button"
            onClick={() => setTab('requirements')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'requirements'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Briefcase size={15} />
            Work Requirements
          </button>
        </div>
      </div>

      {activeTab === 'requirements' ? (
        /* Work Requirements Management Workspace */
        <WorkRequirementsSection
          eventId={event._id}
          eventTitle={event.title}
          eventStatus={event.status}
        />
      ) : (
        /* Event Overview Main Grid */
        <div className="space-y-6">
          {/* Quick Staffing Banner (for confirmed events) */}
          {event.status === 'confirmed' && (
            <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/50 rounded-2xl border border-emerald-200/80 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  <Briefcase size={15} className="text-emerald-600" />
                  Staffing & Work Requirements
                </div>
                <p className="text-xs text-gray-600">
                  Define required worker counts, reporting times, and job instructions for this event.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('requirements')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0"
              >
                Manage Work Requirements
                <ArrowRight size={14} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Logistics Overview Card */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6">
                <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Compass size={18} className="text-emerald-600" />
                  Schedule & Logistics
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      <Calendar size={14} className="text-emerald-600" />
                      Event Date
                    </div>
                    <div className="text-base font-bold text-gray-900">
                      {new Date(event.date).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      <Clock size={14} className="text-emerald-600" />
                      Operational Timing
                    </div>
                    <div className="text-base font-bold text-gray-900">
                      {event.startTime} – {event.endTime}
                    </div>
                  </div>

                  {event.guestCount !== undefined && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 sm:col-span-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                        <Users size={14} className="text-emerald-600" />
                        Expected Attendance
                      </div>
                      <div className="text-base font-bold text-gray-900">
                        {event.guestCount} Guests
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Services & Requirements */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6">
                <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Sparkles size={18} className="text-emerald-600" />
                  Services & Operational Specifications ({event.selectedServices?.length || 0})
                </h2>

                {(!event.selectedServices || event.selectedServices.length === 0) ? (
                  <p className="text-sm text-gray-500 italic py-4">No specific service packages linked.</p>
                ) : (
                  <div className="space-y-4">
                    {event.selectedServices.map((svc, idx) => {
                      const serviceObj = typeof svc.serviceId === 'object' && svc.serviceId !== null ? svc.serviceId : null;
                      const serviceName = svc.serviceName || serviceObj?.name || 'Event Service';
                      const serviceCat = serviceObj?.category || 'General';

                      return (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-gray-200/90 bg-gray-50/60 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-gray-900 text-sm">{serviceName}</div>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200/80 text-gray-700 capitalize">
                              {serviceCat}
                            </span>
                          </div>

                          {svc.preferences && Object.keys(svc.preferences).length > 0 && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200 text-xs text-gray-700 space-y-2">
                              <div className="font-semibold text-gray-900 uppercase tracking-wider text-[10px] text-gray-500">
                                Client Preferences & Notes
                              </div>
                              {Object.entries(svc.preferences).map(([k, val]) => (
                                <div key={k} className="flex flex-col sm:flex-row sm:items-start gap-1">
                                  <span className="font-medium text-gray-700 min-w-32 capitalize">
                                    {k.replace(/([A-Z])/g, ' $1')}:
                                  </span>
                                  <span className="text-gray-600">
                                    {Array.isArray(val)
                                      ? val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
                                      : typeof val === 'object' && val !== null
                                      ? JSON.stringify(val)
                                      : String(val)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Operational Notes */}
              {event.notes && (
                <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6">
                  <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    Special Instructions & Notes
                  </h2>
                  <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/70 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {event.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column (1 col): Venue & Host Details */}
            <div className="space-y-6">
              {/* Host / Client Contact Card */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6">
                <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <User size={18} className="text-emerald-600" />
                  Client Contact Information
                </h2>

                {clientContact ? (
                  <div className="space-y-3 text-sm">
                    <div className="font-semibold text-gray-900 text-base">
                      {clientContact.name}
                    </div>

                    {clientContact.email && (
                      <a
                        href={`mailto:${clientContact.email}`}
                        className="flex items-center gap-2 text-gray-600 hover:text-emerald-700 transition-colors"
                      >
                        <Mail size={15} className="text-gray-400 shrink-0" />
                        <span className="truncate">{clientContact.email}</span>
                      </a>
                    )}

                    {clientContact.phone && (
                      <a
                        href={`tel:${clientContact.phone}`}
                        className="flex items-center gap-2 text-gray-600 hover:text-emerald-700 transition-colors"
                      >
                        <Phone size={15} className="text-gray-400 shrink-0" />
                        <span>{clientContact.phone}</span>
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">Client contact details unavailable.</p>
                )}
              </div>

              {/* Venue & Location Card */}
              <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6">
                <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <MapPin size={18} className="text-emerald-600" />
                  Venue Location
                </h2>

                <p className="text-sm text-gray-700 font-medium mb-4">
                  {event.location?.address || 'Location address pending'}
                </p>

                {/* ReadOnlyMap if coordinates available */}
                {coords ? (
                  <div className="h-56 w-full rounded-xl overflow-hidden border border-gray-200">
                    <ReadOnlyMap lat={coords.lat} lng={coords.lng} zoom={14} />
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                    Map view unavailable (precise coordinates not specified)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
