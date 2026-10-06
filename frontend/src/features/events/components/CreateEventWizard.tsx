import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../../store/hooks';
import { getActiveServices } from '../../services/servicesApi';
import { createEvent, uploadServiceReferenceImages } from '../eventsApi';
import type { EventType, CreateEventRequest } from '../event.types';
import type { Service } from '../../services/service.types';
import {
  Loader2, ArrowLeft, ArrowRight, Check, Upload, MapPin,
  Utensils, BookOpen, Sparkles, Camera, AlignLeft,
  Flower2, Diamond, Box, Calendar, Clock, Users, Banknote, List, Info, Eye, X,
  Phone, Mail, User
} from 'lucide-react';
import { LocationMapSelector } from './LocationMapSelector';

const EVENT_TYPES: EventType[] = ['Nikah', 'Wedding', 'Reception', 'Engagement', 'Birthday', 'Corporate', 'Other'];

const WIZARD_STEPS = [
  { id: 1, title: 'Event Type' },
  { id: 2, title: 'Event Details' },
  { id: 3, title: 'Location & Guests' },
  { id: 4, title: 'Services' },
  { id: 5, title: 'Budget' },
  { id: 6, title: 'Review & Submit' }
];

const CustomList = ({ title, items, predefined, onChange, placeholder }: { title: string, items: string[], predefined: string[], onChange: (arr: string[]) => void, placeholder: string }) => {
  const [customVal, setCustomVal] = useState('');

  return (
    <div className="mb-6 last:mb-0">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">[{title}]</p>
      <div className="flex flex-wrap gap-4 mb-3">
        {predefined.map(item => (
          <label key={item} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={items.includes(item)} onChange={() => {
              const newArr = items.includes(item) ? items.filter(m => m !== item) : [...items, item];
              onChange(newArr);
            }} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
            {item}
          </label>
        ))}
        {items.filter(i => !predefined.includes(i)).map(item => (
          <label key={item} className="flex items-center gap-2 text-sm text-blue-700 cursor-pointer">
            <input type="checkbox" checked={true} onChange={() => {
              onChange(items.filter(m => m !== item));
            }} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
            {item}
          </label>
        ))}
      </div>

      <div className="flex items-center max-w-sm border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all bg-white shadow-sm">
        <input
          type="text"
          value={customVal}
          onChange={e => setCustomVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (customVal.trim() && !items.includes(customVal.trim())) {
                onChange([...items, customVal.trim()]); setCustomVal('');
              }
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 text-sm border-none focus:ring-0 w-full outline-none"
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (customVal.trim() && !items.includes(customVal.trim())) {
              onChange([...items, customVal.trim()]); setCustomVal('');
            }
          }}
          className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-100 transition-colors border-l border-blue-100"
        >
          + Add
        </button>
      </div>
    </div>
  );
};

export const CreateEventWizard = () => {
  const navigate = useNavigate();
  const authUser = useAppSelector(state => state.auth.user);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<any>(null);

  // Form State
  const [eventType, setEventType] = useState<EventType | ''>('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');

  // Client Contact Info (Step 2) — name & phone are editable; email pre-filled from auth
  const [clientName, setClientName] = useState(authUser?.name ?? '');
  const [clientPhone, setClientPhone] = useState(authUser?.phone ?? '');
  const [clientEmail, setClientEmail] = useState(authUser?.email ?? '');

  const [locationState, setLocationState] = useState<{ address: string, lat?: number, lng?: number }>({ address: '' });
  const [guestCount, setGuestCount] = useState<number | ''>('');

  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  // Step 4 Preferences
  const [cateringPrefs, setCateringPrefs] = useState<any>({ serviceMode: [], starters: [], mainDishes: [], juices: [], desserts: [] });
  const [decorationPrefs, setDecorationPrefs] = useState<any>({});
  const [photoPrefs, setPhotoPrefs] = useState<any>({});
  const [otherCustomRequests, setOtherCustomRequests] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState<{ title: string; description: string }[]>([]);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);

  const [budget, setBudget] = useState<number | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  // Upload state: tracks if reference image upload failed after event creation
  const [uploadError, setUploadError] = useState('');
  const [isRetryingUpload, setIsRetryingUpload] = useState(false);

  useEffect(() => {
    if (step === 4 && availableServices.length === 0) {
      const loadServices = async () => {
        setIsLoadingServices(true);
        try {
          const services = await getActiveServices();
          setAvailableServices(services);
        } catch (err) {
          console.error('Failed to load services', err);
        } finally {
          setIsLoadingServices(false);
        }
      };
      loadServices();
    }
  }, [step, availableServices.length]);

  const getSelectedServicesList = () => {
    const list: Array<{ serviceId: string, preferences: any, name: string, basePrice: number }> = [];

    // Catering
    const catService = availableServices.find(s => s.name.toLowerCase().match(/catering|food|dining/));
    const hasCateringData = cateringPrefs.serviceMode?.length > 0 ||
      cateringPrefs.starters?.length > 0 ||
      cateringPrefs.mainDishes?.length > 0 ||
      cateringPrefs.juices?.length > 0 ||
      cateringPrefs.desserts?.length > 0;

    if (catService && hasCateringData) {
      list.push({
        serviceId: catService._id || (catService as any).id,
        preferences: { ...cateringPrefs },
        name: catService.name,
        basePrice: catService.basePrice || 0
      });
    }

    // Decoration
    const decService = availableServices.find(s => s.name.toLowerCase().match(/decoration|stage|decor/));
    if (decService && (decorationPrefs.style || decorationPrefs.notes)) {
      list.push({
        serviceId: decService._id || (decService as any).id,
        preferences: { ...decorationPrefs },
        name: decService.name,
        basePrice: decService.basePrice || 0
      });
    }

    // Photography
    const photoService = availableServices.find(s => s.name.toLowerCase().match(/photo|video|camera/));
    if (photoService && photoPrefs.package) {
      list.push({
        serviceId: photoService._id || (photoService as any).id,
        preferences: { ...photoPrefs },
        name: photoService.name,
        basePrice: photoService.basePrice || 0
      });
    }

    return list;
  };

  // Pre-calculate available matching services for rendering conditions
  const hasCatService = availableServices.some(s => s.name.toLowerCase().match(/catering|food|dining/));
  const hasDecService = availableServices.some(s => s.name.toLowerCase().match(/decoration|stage|decor/));
  const hasPhotoService = availableServices.some(s => s.name.toLowerCase().match(/photo|video|camera/));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setReferenceImages(prev => {
        const combined = [...prev, ...newFiles];
        return combined.slice(0, 5); // Max 5 files
      });
    }
  };

  const removeImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => setStep(s => Math.min(s + 1, 6));
  const handlePrev = () => setStep(s => Math.max(s - 1, 1));

  const validateStep = () => {
    switch (step) {
      case 1:
        return eventType !== '';
      case 2: {
        const today = new Date().toISOString().split('T')[0];
        const isValidDate = date !== '' && date >= today;
        return title.trim() !== '' && isValidDate && startTime !== '' && endTime !== '' && startTime < endTime;
      }
      case 3:
        return locationState.address.trim() !== '' && typeof guestCount === 'number' && guestCount > 0;
      case 4:
        return true;
      case 5:
        return budget === '' || (typeof budget === 'number' && budget >= 0);
      case 6:
        return confirmed;
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setError('');

    const formattedServices = getSelectedServicesList().map(s => ({
      serviceId: s.serviceId,
      preferences: Object.keys(s.preferences).length > 0 ? s.preferences : undefined
    }));

    const specialReqText = specialRequirements
      .filter(r => r.title.trim())
      .map(r => `• ${r.title.trim()}${r.description.trim() ? `: ${r.description.trim()}` : ''}`)
      .join('\n');

    const combinedNotes = [
      notes,
      specialReqText ? `Special Requirements:\n${specialReqText}` : '',
      otherCustomRequests ? `Other Custom Requests:\n${otherCustomRequests}` : ''
    ].filter(Boolean).join('\n\n');

    // Build clientInfo only if at least one field is filled
    const clientInfoPayload = (clientName.trim() || clientPhone.trim() || clientEmail.trim())
      ? {
          name: clientName.trim() || undefined,
          phone: clientPhone.trim() || undefined,
          email: clientEmail.trim() || undefined,
        }
      : undefined;

    const payload: CreateEventRequest = {
      title,
      eventType: eventType as EventType,
      date,
      startTime,
      endTime,
      notes: combinedNotes.trim() !== '' ? combinedNotes : undefined,
      clientInfo: clientInfoPayload,
      location: locationState,
      guestCount: guestCount as number,
      budget: typeof budget === 'number' ? budget : undefined,
      selectedServices: formattedServices
    };

    try {
      const created = await createEvent(payload);

      // Use the exact same serviceId that was saved in the event payload
      const savedDecService = getSelectedServicesList().find(s =>
        s.name.toLowerCase().match(/decoration|stage|decor/)
      );

      if (savedDecService && referenceImages.length > 0) {
        try {
          await uploadServiceReferenceImages(created._id, savedDecService.serviceId, referenceImages);
          setUploadError('');
        } catch (uploadErr: any) {
          // Event was created successfully — do NOT delete it.
          // Surface the upload failure truthfully so the user can retry.
          const msg = uploadErr?.response?.data?.message || uploadErr?.message || 'Reference image upload failed';
          setUploadError(msg);
        }
      }

      setSuccessData(created);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit event request');
      setIsSubmitting(false);
    }
  };

  // Retry upload of reference images for an already-created event
  const retryUpload = async () => {
    if (!successData || referenceImages.length === 0) return;

    // Find the decoration service safely from the persisted event data
    // We match it against availableServices to identify which serviceId corresponds to decoration
    const decServiceTemplate = availableServices.find(s => s.name.toLowerCase().match(/decoration|stage|decor/));
    if (!decServiceTemplate) return;
    const targetDecId = decServiceTemplate._id || (decServiceTemplate as any).id;

    // Ensure the event actually has this service selected
    const persistedDecService = successData.selectedServices.find((s: any) =>
      s.serviceId === targetDecId || (s.serviceId && s.serviceId.toString() === targetDecId?.toString())
    );

    if (!persistedDecService) return;

    setIsRetryingUpload(true);
    try {
      await uploadServiceReferenceImages(successData._id, targetDecId, referenceImages);
      setUploadError('');
    } catch (retryErr: any) {
      const msg = retryErr?.response?.data?.message || retryErr?.message || 'Retry failed';
      setUploadError(msg);
    } finally {
      setIsRetryingUpload(false);
    }
  };

  const estimatedCost = getSelectedServicesList().reduce((sum, s) => sum + s.basePrice, 0);

  if (successData) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-xl shadow-sm border border-gray-100 max-w-4xl mx-auto animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <Check className="w-8 h-8" strokeWidth={3} />
        </div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Success!</h2>
        <p className="text-gray-500 mb-8 font-medium">Your event request was submitted.</p>

        <div className="grid md:grid-cols-2 gap-4 w-full max-w-2xl mb-8">
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-2"><List className="w-3 h-3" /> EVENT SUMMARY</p>
            <p className="font-bold text-gray-900 text-lg mb-1">{successData.eventType}</p>
            <p className="text-sm text-gray-600 flex items-center gap-2"><Calendar className="w-4 h-4" /> {new Date(successData.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-2"><Info className="w-3 h-3" /> ADMIN DETAILS</p>
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-500 font-medium">Request ID:</span> <span className="font-bold text-gray-900">EVT-{successData._id.slice(-4).toUpperCase()}</span></div>
            <div className="flex justify-between text-sm items-center"><span className="text-gray-500 font-medium">Status:</span> <span className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">Awaiting Quotation</span></div>
          </div>
        </div>

        {/* Upload error warning — shown only if image upload failed after event creation */}
        {uploadError && (
          <div className="w-full max-w-2xl mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Reference image upload failed</p>
              <p className="text-xs text-amber-700 mt-0.5">Your event was created successfully, but the decoration reference images could not be uploaded. Please retry.</p>
              <p className="text-xs text-amber-600 mt-1 font-mono bg-amber-100 rounded px-2 py-1">{uploadError}</p>
              {referenceImages.length > 0 && (
                <button
                  onClick={retryUpload}
                  disabled={isRetryingUpload}
                  className="mt-3 px-4 py-1.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center gap-2"
                >
                  {isRetryingUpload ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isRetryingUpload ? 'Retrying...' : `Retry Upload (${referenceImages.length} image${referenceImages.length !== 1 ? 's' : ''})`}
                </button>
              )}
            </div>
          </div>
        )}
        {!uploadError && referenceImages.length > 0 && (
          <div className="w-full max-w-2xl mb-6 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <p className="text-sm font-medium text-green-800">{referenceImages.length} reference image{referenceImages.length !== 1 ? 's' : ''} uploaded successfully.</p>
          </div>
        )}

        <div className="flex gap-4">
          <button onClick={() => navigate('/client/events')} className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to My Events
          </button>
          <button onClick={() => navigate(`/client/events/${successData._id}`)} className="px-6 py-2.5 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 transition-colors flex items-center gap-2">
            View Event <Eye className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 lg:gap-16 max-w-6xl mx-auto p-4 md:p-8">
      {/* Sidebar Steps (Desktop) */}
      <div className="hidden md:block w-48 flex-shrink-0 pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-10">Create New Event</h1>

        <div className="space-y-6 relative">
          <div className="absolute top-2 bottom-6 left-[11px] w-px bg-gray-200 z-0"></div>

          {WIZARD_STEPS.map((s) => {
            const isCompleted = step > s.id;
            const isActive = step === s.id;
            return (
              <div key={s.id} className="relative z-10 flex items-start gap-4 cursor-default">
                <div className="mt-0.5">
                  {isCompleted ? (
                    <div className="w-6 h-6 rounded-full bg-[#0051e5] text-white flex items-center justify-center shadow-sm">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full bg-[#0051e5] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      {s.id}
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border border-gray-300 bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-xs">
                      {s.id}
                    </div>
                  )}
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>Step {s.id}</p>
                  <p className={`text-sm font-semibold ${isActive || isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>{s.title}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="md:hidden mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">Create New Event</h1>
          <p className="text-sm font-medium text-gray-500">Step {step} of 6: {WIZARD_STEPS[step - 1].title}</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200 font-medium">
            {error}
          </div>
        )}

        <div className="min-h-[400px]">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 1 of 6: Event Type</p>
                <h2 className="text-2xl font-bold text-gray-900">What type of event are you planning?</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {EVENT_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setEventType(type)}
                    className={`p-5 rounded-xl border-2 text-left transition-all ${eventType === type
                        ? 'border-[#0051e5] bg-blue-50/50 text-[#0051e5] shadow-sm'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                  >
                    <span className="font-bold block text-sm">{type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 2 of 6: Event Details</p>
                <h2 className="text-2xl font-bold text-gray-900">Event Details</h2>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-900">Primary Information</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Event Name</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      className="w-full rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                      placeholder="e.g. Ameen & Fathima Wedding"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Event Date</label>
                      <div className="relative">
                        <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={date}
                          onChange={e => setDate(e.target.value)}
                          className="w-full pl-9 rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Start Time</label>
                      <div className="relative">
                        <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                        <input
                          type="time"
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                          className="w-full pl-9 rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">End Time</label>
                      <div className="relative">
                        <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                        <input
                          type="time"
                          value={endTime}
                          onChange={e => setEndTime(e.target.value)}
                          className="w-full pl-9 rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Client Info */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                  <User className="w-5 h-5 text-[#0051e5]" />
                  <h3 className="font-bold text-gray-900">Client Info</h3>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Client Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        className="w-full pl-9 rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                        placeholder="e.g. Ahmed Al-Farsi"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Phone</label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="tel"
                          value={clientPhone}
                          onChange={e => setClientPhone(e.target.value)}
                          className="w-full pl-9 rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-2.5 border text-sm outline-none"
                          placeholder="e.g. +91 9876543210"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Email</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="email"
                          value={clientEmail}
                          onChange={e => setClientEmail(e.target.value)}
                          className="w-full pl-9 rounded-lg border-gray-200 bg-gray-50 text-gray-500 focus:outline-none p-2.5 border text-sm cursor-not-allowed"
                          placeholder="e.g. ahmed@example.com"
                          disabled
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event Scope & Notes */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <h3 className="font-bold text-gray-900">Event Scope & Notes</h3>
                </div>
                <div className="p-5">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Additional Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-3 border text-sm outline-none resize-none"
                    placeholder="Describe any general requirements or important details..."
                    maxLength={500}
                  />
                  <p className="text-[10px] text-gray-400 mt-1 text-right font-medium">{notes.length} / 500 characters</p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 3 of 6: Location & Guests</p>
                <h2 className="text-2xl font-bold text-gray-900">Location & Guests</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm md:col-span-2">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-[#0051e5]" />
                    <h3 className="font-bold text-gray-900">Event Location</h3>
                  </div>
                  <div className="p-5">
                    <LocationMapSelector location={locationState} onChange={setLocationState} />
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm h-fit">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#0051e5]" />
                    <h3 className="font-bold text-gray-900">Guest Count</h3>
                  </div>
                  <div className="p-5">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Total Guests Expected</label>
                    <input
                      type="number"
                      min="1"
                      value={guestCount}
                      onChange={e => setGuestCount(e.target.value === '' ? '' : parseInt(e.target.value))}
                      className="w-full rounded-lg border-gray-300 focus:border-[#0051e5] focus:ring-[#0051e5] p-3 border text-sm outline-none"
                      placeholder="e.g. 500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 4 of 6: Choose the services you need</p>
                <h2 className="text-2xl font-bold text-gray-900">Choose the services you need</h2>
              </div>

              {isLoadingServices ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#0051e5]" />
                </div>
              ) : (
                <div className="space-y-6">

                  {/* Catering Configuration */}

                  {hasCatService && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="flex items-center gap-2 p-4 border-b border-gray-100 bg-white">
                        <Utensils className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900">Catering Service Configuration</h3>
                      </div>
                      <div className="p-5 grid sm:grid-cols-2 gap-4 bg-gray-50/30">
                        {[
                          { id: 'Full Service Catering', desc: 'Food preparation & full waitstaff' },
                          { id: 'Food Preparation Only', desc: 'Delivery and setup without service' },
                          { id: 'Table Serving Service Only', desc: 'Staff provided for pre-arranged food' },
                          { id: 'Dining & Seating Arrangements', desc: 'Tables, chairs, and linen setup' }
                        ].map(m => {
                          const isSelected = cateringPrefs.serviceMode?.includes(m.id);
                          return (
                            <label key={m.id} className={`flex items-start gap-3 p-4 rounded-xl border bg-white cursor-pointer transition-all ${isSelected ? 'border-blue-600 ring-1 ring-blue-600 shadow-sm' : 'border-gray-200 hover:border-blue-200'}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const newModes = isSelected ? cateringPrefs.serviceMode.filter((mode: string) => mode !== m.id) : [...(cateringPrefs.serviceMode || []), m.id];
                                  setCateringPrefs({ ...cateringPrefs, serviceMode: newModes });
                                }}
                                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                              />
                              <div>
                                <p className="font-bold text-gray-900 text-sm leading-none mb-1.5">{m.id}</p>
                                <p className="text-[11px] text-gray-500 leading-tight">{m.desc}</p>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Food & Bev Selection */}


                  {hasCatService && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="flex items-center gap-2 p-4 border-b border-gray-100 bg-white">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900">Food & Beverage Menu Selection</h3>
                      </div>
                      <div className="p-6 bg-gray-50/30">
                        <CustomList
                          title="Starters"
                          items={cateringPrefs.starters || []}
                          predefined={['Chicken Tikka', 'Paneer Tikka', 'Spring Rolls']}
                          onChange={(val) => setCateringPrefs({ ...cateringPrefs, starters: val })}
                          placeholder="Add custom starter..."
                        />
                        <CustomList
                          title="Main Dishes"
                          items={cateringPrefs.mainDishes || []}
                          predefined={['Malaber Chicken Biryani', 'Mutton Biryani']}
                          onChange={(val) => setCateringPrefs({ ...cateringPrefs, mainDishes: val })}
                          placeholder="Add custom main dish..."
                        />
                        <CustomList
                          title="Juices & Drinks"
                          items={cateringPrefs.juices || []}
                          predefined={['Fresh Lime Juice', 'Mint Mojito']}
                          onChange={(val) => setCateringPrefs({ ...cateringPrefs, juices: val })}
                          placeholder="Add custom juice..."
                        />
                        <CustomList
                          title="Desserts"
                          items={cateringPrefs.desserts || []}
                          predefined={['Fruit Salad with Ice Cream', 'Gulab Jamun']}
                          onChange={(val) => setCateringPrefs({ ...cateringPrefs, desserts: val })}
                          placeholder="Add custom dessert..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Stage Decoration */}


                  {hasDecService && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="flex items-center gap-2 p-4 border-b border-gray-100 bg-white">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900">Stage Decoration Style</h3>
                      </div>
                      <div className="p-5 grid sm:grid-cols-3 gap-4 bg-gray-50/30">
                        {[
                          { id: 'Traditional', icon: <Flower2 className="w-5 h-5" />, desc: 'Classic floral arrangements and warm lighting setups.' },
                          { id: 'Modern', icon: <Sparkles className="w-5 h-5" />, desc: 'Minimalist structures, geometric accents, and cool tones.' },
                          { id: 'Luxury', icon: <Diamond className="w-5 h-5" />, desc: 'Premium materials, grand scale setups, and custom detailing.' }
                        ].map(s => {
                          const isSelected = decorationPrefs.style === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setDecorationPrefs({ ...decorationPrefs, style: s.id })}
                              className={`flex flex-col items-start text-left p-4 rounded-xl border bg-white transition-all ${isSelected ? 'border-blue-600 ring-1 ring-blue-600 shadow-sm' : 'border-gray-200 hover:border-blue-200'}`}
                            >
                              <div className={`p-2 rounded-lg mb-3 ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                                {s.icon}
                              </div>
                              <h4 className="font-bold text-gray-900 text-sm mb-1.5">{s.id}</h4>
                              <p className="text-[11px] text-gray-500 leading-tight">{s.desc}</p>
                            </button>
                          )
                        })}
                      </div>
                      <div className="px-5 pb-5 bg-gray-50/30 border-t border-gray-100 pt-5">
                        <label className="border border-dashed border-gray-300 rounded-xl p-6 text-center flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer mb-2">
                          <Upload className="w-5 h-5 text-blue-500 mb-2" />
                          <span className="text-xs font-bold text-gray-900 mb-0.5">Upload Reference Images</span>
                          <span className="text-[10px] text-gray-500">Drag and drop or click to browse (JPG, PNG up to 5MB)</span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg, image/png, image/webp"
                            className="hidden"
                            onChange={handleImageChange}
                            disabled={referenceImages.length >= 5}
                          />
                        </label>
                        {referenceImages.length > 0 && (
                          <div className="grid grid-cols-5 gap-2 mt-4">
                            {referenceImages.map((file, i) => (
                              <div key={i} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
                                <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeImage(i)}
                                  className="absolute top-1 right-1 bg-white/80 backdrop-blur-sm rounded-full shadow-sm p-0.5 text-gray-700 hover:text-red-600 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Photo & Video */}


                  {hasPhotoService && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      <div className="flex items-center gap-2 p-4 border-b border-gray-100 bg-white">
                        <Camera className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900">Photo & Videography</h3>
                      </div>
                      <div className="p-5 grid sm:grid-cols-2 gap-4 bg-gray-50/30">
                        <label className={`flex items-start gap-3 p-4 rounded-xl border bg-white cursor-pointer transition-all ${photoPrefs.package === 'Basic Photo & Video Package' ? 'border-blue-600 ring-1 ring-blue-600 shadow-sm' : 'border-gray-200 hover:border-blue-200'}`}>
                          <input
                            type="radio"
                            name="photo-pkg"
                            checked={photoPrefs.package === 'Basic Photo & Video Package'}
                            onChange={() => setPhotoPrefs({ ...photoPrefs, package: 'Basic Photo & Video Package' })}
                            className="mt-0.5 rounded-full border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <div>
                            <p className="font-bold text-gray-900 text-sm leading-none mb-1.5">Basic Photo & Video Package</p>
                            <p className="text-[11px] text-gray-500 leading-tight">Standard coverage with 1 photographer, 1 videographer. Includes edited digital gallery.</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 p-4 rounded-xl border bg-white cursor-pointer transition-all relative ${photoPrefs.package === 'Premium Cinematic Package' ? 'border-blue-600 ring-1 ring-blue-600 shadow-sm' : 'border-gray-200 hover:border-blue-200'}`}>
                          <div className="absolute top-0 right-0 transform translate-x-0 -translate-y-2 bg-[#0051e5] text-white text-[9px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider shadow-sm">Popular</div>
                          <input
                            type="radio"
                            name="photo-pkg"
                            checked={photoPrefs.package === 'Premium Cinematic Package'}
                            onChange={() => setPhotoPrefs({ ...photoPrefs, package: 'Premium Cinematic Package' })}
                            className="mt-0.5 rounded-full border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          />
                          <div>
                            <p className="font-bold text-gray-900 text-sm leading-none mb-1.5">Premium Cinematic Package</p>
                            <p className="text-[11px] text-gray-500 leading-tight">Multi-cam setup, drone footage, cinematic highlights, and priority editing delivery.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Special Requirements */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
                      <div className="flex items-center gap-2">
                        <Box className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900 text-sm">Special Requirements</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSpecialRequirements(prev => [...prev, { title: '', description: '' }])}
                        className="text-xs font-bold text-[#0051e5] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                      >
                        + Add Requirement
                      </button>
                    </div>
                    <div className="p-5 bg-gray-50/30 space-y-3">
                      {specialRequirements.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-2">
                          No special requirements added. Click <span className="font-bold">"+ Add Requirement"</span> to add one.
                        </p>
                      ) : (
                        specialRequirements.map((req, idx) => (
                          <div key={idx} className="flex gap-2 items-start bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={req.title}
                                onChange={e => {
                                  const updated = [...specialRequirements];
                                  updated[idx] = { ...updated[idx], title: e.target.value };
                                  setSpecialRequirements(updated);
                                }}
                                className="w-full rounded-lg border border-gray-200 focus:border-[#0051e5] focus:ring-[#0051e5] px-3 py-2 text-sm font-bold outline-none"
                                placeholder="Requirement title (e.g. Halal Food Only, Wheelchair Access)"
                              />
                              <input
                                type="text"
                                value={req.description}
                                onChange={e => {
                                  const updated = [...specialRequirements];
                                  updated[idx] = { ...updated[idx], description: e.target.value };
                                  setSpecialRequirements(updated);
                                }}
                                className="w-full rounded-lg border border-gray-200 focus:border-[#0051e5] focus:ring-[#0051e5] px-3 py-2 text-sm outline-none"
                                placeholder="Description / details (optional)"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setSpecialRequirements(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-0.5"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Other Requests */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center gap-2 p-4 border-b border-gray-100 bg-white">
                      <AlignLeft className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-gray-900 text-sm">Other Custom Requests</h3>
                    </div>
                    <div className="p-5 bg-gray-50/30">
                      <textarea
                        value={otherCustomRequests}
                        onChange={e => setOtherCustomRequests(e.target.value)}
                        rows={3}
                        className="w-full border border-gray-200 focus:ring-[#0051e5] focus:border-[#0051e5] rounded-lg p-3 text-sm shadow-sm resize-none outline-none"
                        placeholder="Describe any additional services, specific dietary requirements, or special arrangements needed..."
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 5 of 6: Budget</p>
                <h2 className="text-2xl font-bold text-gray-900">Estimated Budget</h2>
              </div>
              <p className="text-gray-500 max-w-xl text-sm mb-4">
                Providing an estimated budget helps our team curate the best quotation for your selected services. No prices are calculated instantly.
              </p>

              <div className="max-w-md bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Allocated Budget (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 sm:text-lg font-medium">₹</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={budget}
                    onChange={e => setBudget(e.target.value === '' ? '' : parseInt(e.target.value))}
                    className="w-full pl-8 rounded-lg border-gray-300 shadow-sm focus:border-[#0051e5] focus:ring-[#0051e5] p-3 border text-lg outline-none font-bold text-gray-900"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-500 mb-1">Step 6 of 6: Review</p>
                <h2 className="text-3xl font-black text-gray-900">Review Your Event</h2>
                <p className="text-sm text-gray-500 mt-2">Please review the details below before submitting your event request. Ensure all information is accurate.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">

                {/* Client Info Review Card */}
                {(clientName.trim() || clientPhone.trim() || clientEmail.trim()) && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#0051e5] flex items-center gap-2 mb-4"><User className="w-4 h-4" /> Client Info</h3>
                    <div className="space-y-3">
                      {clientName.trim() && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-semibold text-gray-800">{clientName.trim()}</span>
                        </div>
                      )}
                      {clientPhone.trim() && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700">{clientPhone.trim()}</span>
                        </div>
                      )}
                      {clientEmail.trim() && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700">{clientEmail.trim()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Event Details Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0051e5] flex items-center gap-2 mb-4"><List className="w-4 h-4" /> Event Details</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Event Type</p>
                      <p className="font-bold text-gray-900 text-lg leading-tight">{eventType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date & Time</p>
                      <p className="font-semibold text-gray-700 text-sm">
                        {date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} • {startTime} - {endTime}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Location & Guests Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0051e5] flex items-center gap-2 mb-4"><MapPin className="w-4 h-4" /> Location & Guests</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Venue City</p>
                      <p className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">{locationState.address}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Guest Count</p>
                      <p className="font-semibold text-gray-700 text-sm flex items-center gap-1"><Users className="w-3 h-3" /> {guestCount} Guests</p>
                    </div>
                  </div>
                </div>

                {/* Requested Services Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm md:col-span-2">
                  <h3 className="text-sm font-bold text-[#0051e5] flex items-center gap-2 mb-4"><Box className="w-4 h-4" /> Requested Services</h3>

                  {getSelectedServicesList().length > 0 ? (
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {getSelectedServicesList().map((data) => {
                        const name = data.name.toLowerCase();
                        return (
                          <div key={data.serviceId} className="border border-gray-100 bg-gray-50/50 rounded-xl p-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
                              {name.includes('catering') ? <Utensils className="w-4 h-4 text-[#0051e5]" /> : name.includes('decoration') ? <Sparkles className="w-4 h-4 text-[#0051e5]" /> : name.includes('photo') ? <Camera className="w-4 h-4 text-[#0051e5]" /> : <Check className="w-4 h-4 text-[#0051e5]" />}
                              {data.name}
                            </div>

                            {name.includes('catering') && data.preferences.serviceMode && (
                              <p className="text-xs text-gray-500 mb-2">{data.preferences.serviceMode[0]}</p>
                            )}
                            {name.includes('decoration') && data.preferences.style && (
                              <div className="mb-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Stage Style</p>
                                <p className="text-xs text-gray-700 font-medium">{data.preferences.style} Stage Decoration</p>
                                {referenceImages.length > 0 && (
                                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                                    <Camera className="w-3 h-3" /> {referenceImages.length} Reference Image{referenceImages.length !== 1 ? 's' : ''} Attached
                                  </p>
                                )}
                              </div>
                            )}
                            {name.includes('photo') && data.preferences.package && (
                              <div className="mb-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Package</p>
                                <p className="text-xs text-gray-700 font-medium">{data.preferences.package}</p>
                              </div>
                            )}
                            {name.includes('catering') && (data.preferences.mainDishes || data.preferences.starters || data.preferences.juices || data.preferences.desserts) && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Menu Items</p>
                                {data.preferences.starters?.map((dish: string, i: number) => (
                                  <p key={`s${i}`} className="text-[11px] text-gray-600 flex items-center gap-1"><Check className="w-3 h-3 text-green-500" />{dish}</p>
                                ))}
                                {data.preferences.mainDishes?.map((dish: string, i: number) => (
                                  <p key={i} className="text-[11px] text-gray-600 flex items-center gap-1"><Check className="w-3 h-3 text-green-500" />{dish}</p>
                                ))}
                                {data.preferences.juices?.map((dish: string, i: number) => (
                                  <p key={`j${i}`} className="text-[11px] text-gray-600 flex items-center gap-1"><Check className="w-3 h-3 text-green-500" />{dish}</p>
                                ))}
                                {data.preferences.desserts?.map((dish: string, i: number) => (
                                  <p key={`d${i}`} className="text-[11px] text-gray-600 flex items-center gap-1"><Check className="w-3 h-3 text-green-500" />{dish}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No services requested.</p>
                  )}
                </div>

                {/* Special Requirements Review Card */}
                {specialRequirements.filter(r => r.title.trim()).length > 0 && (
                  <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-[#0051e5] flex items-center gap-2 mb-4">
                      <Box className="w-4 h-4" /> Special Requirements
                    </h3>
                    <div className="space-y-2">
                      {specialRequirements.filter(r => r.title.trim()).map((req, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-[#0051e5] font-bold mt-0.5">•</span>
                          <span>
                            <span className="font-bold text-gray-900">{req.title}</span>
                            {req.description.trim() && <span className="text-gray-500">: {req.description}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial Overview (Dark Card) */}
                <div className="md:col-span-2 bg-[#1c1c28] rounded-xl p-5 shadow-lg text-white grid md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2"><Banknote className="w-4 h-4 text-blue-400" /> Financial Overview</h3>
                    <p className="text-xs text-gray-400">Comparison of allocated budget vs estimated costs.</p>
                  </div>
                  <div className="md:col-span-2 flex flex-col sm:flex-row gap-6 md:gap-12 md:justify-end">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Allocated Budget</p>
                      <p className="font-black text-2xl">₹{budget ? budget.toLocaleString() : '0'}</p>
                    </div>
                    <div className="hidden sm:block w-px bg-gray-700 h-10 my-auto"></div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Estimated Cost</p>
                      <p className="font-black text-2xl">₹{estimatedCost.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

              </div>

              <div className="mt-8 border-t border-gray-200 pt-6">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-5 h-5 rounded border-gray-300 text-[#0051e5] focus:ring-[#0051e5] cursor-pointer" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">I confirm that the above details are correct.</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 flex justify-between">
          {step > 1 ? (
            <button
              onClick={handlePrev}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-colors text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm"
            >
              Back
            </button>
          ) : <div></div>}

          {step < 6 ? (
            <button
              onClick={handleNext}
              disabled={!validateStep()}
              className={`flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm ${validateStep()
                  ? 'bg-[#0051e5] text-white hover:bg-blue-700'
                  : 'bg-blue-300 text-white cursor-not-allowed'
                }`}
            >
              [Next Step]
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !validateStep()}
              className="flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-bold bg-[#0051e5] text-white hover:bg-blue-700 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Submit Event Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
