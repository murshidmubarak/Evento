import React, { useState, useEffect } from 'react';
import {
  workRequirementsApi,
  type WorkRequirement,
} from '../../features/work-requirements/workRequirementsApi';
import {
  Radio,
  Loader2,
  X,
  AlertCircle,
  Users,
  Clock,
  MapPin,
  CalendarClock,
  Sparkles,
} from 'lucide-react';

interface AnnounceRequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnnounced: (requirement: WorkRequirement) => void;
  requirement: WorkRequirement | null;
  eventTitle: string;
}

export const AnnounceRequirementModal: React.FC<AnnounceRequirementModalProps> = ({
  isOpen,
  onClose,
  onAnnounced,
  requirement,
  eventTitle,
}) => {
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>('');
  const [interestDeadlineAt, setInterestDeadlineAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (requirement) {
      setMaxDistanceKm(requirement.maxDistanceKm ? String(requirement.maxDistanceKm) : '15');
      if (requirement.interestDeadlineAt) {
        try {
          const d = new Date(requirement.interestDeadlineAt);
          if (d.getTime() > Date.now()) {
            const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
            setInterestDeadlineAt(localIso);
          } else {
            // If already in the past, default to tomorrow 6:00 PM local
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(18, 0, 0, 0);
            const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
            setInterestDeadlineAt(localIso);
          }
        } catch {
          setInterestDeadlineAt('');
        }
      } else {
        // Default to tomorrow 6:00 PM local
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(18, 0, 0, 0);
        const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setInterestDeadlineAt(localIso);
      }
      setErrorMessage(null);
    }
  }, [requirement, isOpen]);

  if (!isOpen || !requirement) return null;

  const handleAnnounce = async (e: React.FormEvent) => {
    e.preventDefault();

    const dist = parseFloat(maxDistanceKm);
    if (isNaN(dist) || dist <= 0) {
      setErrorMessage('Please specify a valid positive maximum distance (km)');
      return;
    }

    if (!interestDeadlineAt) {
      setErrorMessage('Please specify a valid future interest deadline');
      return;
    }

    const d = new Date(interestDeadlineAt);
    if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      setErrorMessage('The interest deadline must be a future date and time');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Transition draft -> open and save distance & deadline
      const updated = await workRequirementsApi.updateRequirement(requirement._id, {
        maxDistanceKm: dist,
        interestDeadlineAt: d.toISOString(),
        status: 'open',
      });

      onAnnounced(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Failed to announce work requirement. Please verify details and try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announce-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 id="announce-modal-title" className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Radio size={18} className="text-emerald-600 animate-pulse" />
              Announce Recruitment Opportunity
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs sm:max-w-md">
              {requirement.workerType} &bull; Event: <span className="font-semibold text-gray-700">{eventTitle}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleAnnounce} noValidate className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Announcement Notice Banner */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <Sparkles size={16} className="text-emerald-600 shrink-0" />
              <span>Broadcast to Eligible Workforce Pool</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Opening this requirement will announce the opportunity to all active workers specialized in{' '}
              <strong className="underline">{requirement.workerType}</strong>. Workers within your configured radius can view the shift on their portal and express interest until the deadline.
            </p>
          </div>

          {/* Requirement Summary */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-center text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                Headcount
              </span>
              <span className="text-base font-extrabold text-gray-900 flex items-center justify-center gap-1">
                <Users size={14} className="text-emerald-600" />
                {requirement.requiredCount}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                Worker Role
              </span>
              <span className="text-xs font-bold text-gray-900 truncate block">
                {requirement.workerType}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                Report Time
              </span>
              <span className="text-xs font-bold text-gray-900 flex items-center justify-center gap-1">
                <Clock size={13} className="text-gray-500" />
                {requirement.reportingTime}
              </span>
            </div>
          </div>

          {/* Distance Limit */}
          <div>
            <label
              htmlFor="announceMaxDistance"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <MapPin size={13} className="text-emerald-600" />
              Maximum Permitted Worker Distance (km) <span className="text-rose-500">*</span>
            </label>
            <input
              id="announceMaxDistance"
              type="number"
              min="0.1"
              step="0.5"
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. 15"
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Workers residing further than this distance from the event location are ineligible.
            </p>
          </div>

          {/* Interest Deadline */}
          <div>
            <label
              htmlFor="announceDeadline"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <CalendarClock size={13} className="text-emerald-600" />
              Interest Submission Deadline <span className="text-rose-500">*</span>
            </label>
            <input
              id="announceDeadline"
              type="datetime-local"
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              value={interestDeadlineAt}
              onChange={(e) => setInterestDeadlineAt(e.target.value)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              When this deadline arrives, EventOps automatically selects the best candidates deterministically.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !maxDistanceKm || !interestDeadlineAt}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Announcing...
                </>
              ) : (
                <>
                  <Radio size={14} />
                  Announce & Open for Workers
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
