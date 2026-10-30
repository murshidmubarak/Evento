import React, { useState } from 'react';
import { workRequirementsApi, type WorkRequirement } from '../../features/work-requirements/workRequirementsApi';
import { X, Loader2, AlertCircle, CalendarClock, ShieldCheck, Info } from 'lucide-react';

interface ExtendDeadlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtended: (updated: WorkRequirement) => void;
  requirement: WorkRequirement | null;
  eventTitle: string;
}

export const ExtendDeadlineModal: React.FC<ExtendDeadlineModalProps> = ({
  isOpen,
  onClose,
  onExtended,
  requirement,
  eventTitle,
}) => {
  const [interestDeadlineAt, setInterestDeadlineAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !requirement) return null;

  const filledCount = requirement.filled ?? requirement.assignedWorkers?.length ?? 0;
  const remainingCount = Math.max(0, requirement.requiredCount - filledCount);

  const setPresetHours = (hours: number) => {
    const base = new Date();
    base.setTime(base.getTime() + hours * 3600000);
    const localIso = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setInterestDeadlineAt(localIso);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestDeadlineAt) {
      setErrorMessage('Please select a valid future interest deadline');
      return;
    }

    const d = new Date(interestDeadlineAt);
    if (isNaN(d.getTime()) || d.getTime() <= Date.now()) {
      setErrorMessage('The new interest deadline must be a future date and time');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const updated = await workRequirementsApi.extendDeadline(
        requirement._id,
        d.toISOString()
      );

      setInterestDeadlineAt('');
      onExtended(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Failed to extend deadline. Please verify details and try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200/90 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-linear-to-r from-amber-50/40 via-white to-gray-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
              <CalendarClock size={19} />
            </div>
            <div>
              <h2 id="extend-modal-title" className="text-base font-extrabold text-gray-900 flex items-center gap-2 tracking-tight">
                Extend Interest Deadline
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs sm:max-w-md">
                {requirement.workerType} &bull; Event: <span className="font-semibold text-gray-700">{eventTitle}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 font-medium"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Preservation Guarantee Banner */}
          <div className="p-4 bg-linear-to-br from-emerald-50/80 to-teal-50/30 border border-emerald-200/90 rounded-xl space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
              <span>Safe Extension & Assignment Preservation</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed font-medium">
              Extending the deadline will <strong>never remove or replace</strong> the{' '}
              <span className="font-bold underline">{filledCount} currently assigned worker(s)</span>.
              The selection engine will fill only the remaining{' '}
              <span className="font-bold underline">{remainingCount} unfilled position(s)</span> when the new deadline closes.
            </p>
          </div>

          {/* Current Staffing Summary */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-gray-50/80 rounded-xl border border-gray-200/70 text-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-0.5">
                Total Required
              </span>
              <span className="text-xl font-black text-gray-900">{requirement.requiredCount}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-0.5">
                Assigned (Kept)
              </span>
              <span className="text-xl font-black text-emerald-800">{filledCount}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-0.5">
                Positions To Fill
              </span>
              <span className="text-xl font-black text-amber-800">{remainingCount}</span>
            </div>
          </div>

          {/* New Deadline Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="newInterestDeadline"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5"
              >
                <CalendarClock size={13} className="text-emerald-700" />
                New Interest Deadline <span className="text-rose-500">*</span>
              </label>
              {/* Presets */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPresetHours(24)}
                  className="text-[10px] font-bold text-amber-800 hover:underline px-1"
                >
                  +24h
                </button>
                <span className="text-gray-300 text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => setPresetHours(48)}
                  className="text-[10px] font-bold text-amber-800 hover:underline px-1"
                >
                  +48h
                </button>
                <span className="text-gray-300 text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => setPresetHours(72)}
                  className="text-[10px] font-bold text-amber-800 hover:underline px-1"
                >
                  +72h
                </button>
              </div>
            </div>
            <input
              id="newInterestDeadline"
              type="datetime-local"
              value={interestDeadlineAt}
              onChange={(e) => setInterestDeadlineAt(e.target.value)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors shadow-2xs"
            />
            <p className="mt-1 text-[11px] text-gray-500 flex items-center gap-1 font-medium">
              <Info size={12} className="shrink-0 text-gray-400" />
              Must be in the future and occur before event reporting time.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !interestDeadlineAt}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {isLoading ? 'Extending...' : 'Extend Deadline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
