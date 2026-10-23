import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setUserLocation } from '../../features/auth/authSlice';
import {
  workRequirementsApi,
  type WorkerLocationPayload,
  type WorkerLocationResponse,
} from '../../features/work-requirements/workRequirementsApi';
import {
  LocationMapSelector,
  type LocationState,
} from '../../features/events/components/LocationMapSelector';
import {
  MapPin,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Lock,
  RefreshCw,
  Compass,
} from 'lucide-react';

export const WorkerLocationSetup: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  // Selected location state in UI
  const [selectedLocation, setSelectedLocation] = useState<LocationState>({
    address: user?.location?.address || '',
    lat: user?.location?.lat,
    lng: user?.location?.lng,
  });

  const [savedLocation, setSavedLocation] = useState<WorkerLocationResponse | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch current saved location from backend on mount
  useEffect(() => {
    let isMounted = true;
    const fetchLocation = async () => {
      try {
        setIsLoadingInitial(true);
        const loc = await workRequirementsApi.getWorkerLocation();
        if (isMounted && loc) {
          setSavedLocation(loc);
          if (loc.lat !== undefined && loc.lng !== undefined) {
            setSelectedLocation({
              address: loc.address || '',
              lat: loc.lat,
              lng: loc.lng,
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to load worker location:', err);
      } finally {
        if (isMounted) {
          setIsLoadingInitial(false);
        }
      }
    };

    fetchLocation();
    return () => {
      isMounted = false;
    };
  }, []);

  const hasConfiguredLocation = Boolean(
    savedLocation?.lat !== undefined &&
    savedLocation?.lng !== undefined &&
    Number.isFinite(savedLocation.lat) &&
    Number.isFinite(savedLocation.lng)
  );

  const isValidSelection =
    typeof selectedLocation.lat === 'number' &&
    typeof selectedLocation.lng === 'number' &&
    Number.isFinite(selectedLocation.lat) &&
    Number.isFinite(selectedLocation.lng) &&
    selectedLocation.lat >= -90 &&
    selectedLocation.lat <= 90 &&
    selectedLocation.lng >= -180 &&
    selectedLocation.lng <= 180;

  const handleSaveLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isValidSelection) {
      setErrorMessage(
        'Please select a valid location on the map or click "Use Current Location". Latitude must be between -90 and 90, and longitude between -180 and 180.'
      );
      return;
    }

    try {
      setIsSaving(true);
      const payload: WorkerLocationPayload = {
        lat: selectedLocation.lat!,
        lng: selectedLocation.lng!,
        address: selectedLocation.address.trim() || undefined,
      };

      const updated = await workRequirementsApi.updateWorkerLocation(payload);

      // Update Redux state
      dispatch(setUserLocation(updated));
      setSavedLocation(updated);
      setSuccessMessage('Your location has been saved and confirmed successfully!');

      // Redirect after a brief moment or allow user to click
      setTimeout(() => {
        // If there was a redirect query or state, go there, otherwise go to /worker
        navigate('/worker');
      }, 1500);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.message ||
          'Failed to save your location. Please check your connection and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingInitial) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-gray-200/80 shadow-xs">
        <RefreshCw size={28} className="animate-spin text-amber-600 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">Loading your location profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-50 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/80">
                <MapPin size={14} className="text-amber-600" />
                Worker Location Gate
              </span>
              {hasConfiguredLocation ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Location Confirmed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Configuration Required
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {hasConfiguredLocation ? 'Update Your Work Location' : 'Set Up Your Work Location'}
            </h1>
            <p className="text-gray-500 mt-1 text-sm sm:text-base">
              EventOps uses your confirmed location to calculate distance to event venues and match you with eligible work requirements.
            </p>
          </div>

          {hasConfiguredLocation && (
            <button
              type="button"
              onClick={() => navigate('/worker')}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg shadow-xs transition-colors shrink-0"
            >
              Browse Opportunities
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Explanatory Policy Alert */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
        <Compass size={20} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-amber-950 space-y-1">
          <p className="font-bold text-amber-900">
            Why is location setup mandatory?
          </p>
          <p className="leading-relaxed text-amber-900/90">
            Event Managers configure a maximum allowable travel distance for each staffing requirement (e.g. within 25 km of the venue). Your confirmed location is used to deterministically determine eligibility and calculate ranking scores. You cannot view opportunities or submit interest without a confirmed location.
          </p>
        </div>
      </div>

      {/* Privacy Notice Box */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5">
        <Lock size={18} className="text-slate-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 space-y-1">
          <p className="font-bold text-slate-800">
            Location Privacy &amp; Data Protection
          </p>
          <p className="leading-relaxed">
            Your location is declared by you on-demand and is <strong>never tracked in the background</strong>. EventOps does not perform continuous GPS monitoring. Your exact coordinates are never shared with clients or other workers, and are only used by the server to compute straight-line venue distances.
          </p>
        </div>
      </div>

      {/* Current Saved Location Preview (if already configured) */}
      {hasConfiguredLocation && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Currently Saved Location
            </span>
            {savedLocation?.confirmedAt && (
              <span className="text-[11px] text-gray-500">
                Last confirmed: {new Date(savedLocation.confirmedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-gray-400 font-medium block mb-0.5">Address / Landmark</span>
              <p className="font-semibold text-gray-800 truncate">
                {savedLocation?.address || 'Declared coordinates only'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <span className="text-gray-400 font-medium block mb-0.5">Coordinates</span>
              <p className="font-mono text-gray-800">
                Lat: {savedLocation?.lat?.toFixed(5)}, Lng: {savedLocation?.lng?.toFixed(5)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Notification Banners */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center justify-between gap-2.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/worker')}
            className="text-emerald-900 font-bold underline hover:no-underline text-xs"
          >
            Go to Available Work &rarr;
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-800 flex items-center gap-2.5 animate-in fade-in duration-200">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Location Selector Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={18} className="text-amber-600" />
            Select Your Location
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Choose your current position or search for your neighborhood. You can also drag the pin on the map to pinpoint your exact base location.
          </p>
        </div>

        {/* Mapbox selector with custom worker labels */}
        <LocationMapSelector
          location={selectedLocation}
          onChange={(newLoc) => {
            setSelectedLocation(newLoc);
            setErrorMessage(null);
          }}
          addressLabel="Your Declared Base / Work Location Address"
          placeholder="e.g. Kakkanad, Kochi, Kerala / Flat No, Street or Area"
          emptyWarning="Please choose 'Use Current Location' or click on the map to place your pin."
        />

        {/* Selected Coordinates & Review Summary */}
        <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
              <span>Selected Coordinates:</span>
              {isValidSelection ? (
                <span className="font-mono text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded">
                  {selectedLocation.lat?.toFixed(5)}, {selectedLocation.lng?.toFixed(5)}
                </span>
              ) : (
                <span className="text-rose-600 italic">No coordinates selected</span>
              )}
            </div>
            {selectedLocation.address && (
              <p className="text-gray-600 truncate max-w-lg">
                Address: <span className="text-gray-800 font-medium">{selectedLocation.address}</span>
              </p>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {isValidSelection && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Coordinates Valid
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            By confirming, this declared location will be saved to your profile and used for eligibility distance checks.
          </p>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {hasConfiguredLocation && (
              <button
                type="button"
                onClick={() => navigate('/worker')}
                className="w-full sm:w-auto px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveLocation}
              disabled={isSaving || !isValidSelection}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Saving Location...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Confirm &amp; Save Location
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerLocationSetup;
