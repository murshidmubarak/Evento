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
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 id="extend-modal-title" className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock size={18} className="text-amber-600" />
              Extend Interest Deadline
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
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Preservation Guarantee Banner */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
              <span>Safe Extension & Assignment Preservation</span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Extending the deadline will <strong>never remove or replace</strong> the{' '}
              <span className="font-bold underline">{filledCount} currently assigned worker(s)</span>.
              The selection engine will fill only the remaining{' '}
              <span className="font-bold underline">{remainingCount} unfilled position(s)</span> when the new deadline closes.
            </p>
          </div>

          {/* Current Staffing Summary */}
          <div className="grid grid-cols-3 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                Total Required
              </span>
              <span className="text-lg font-extrabold text-gray-900">{requirement.requiredCount}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block mb-0.5">
                Assigned (Kept)
              </span>
              <span className="text-lg font-extrabold text-emerald-700">{filledCount}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block mb-0.5">
                Positions To Fill
              </span>
              <span className="text-lg font-extrabold text-amber-700">{remainingCount}</span>
            </div>
          </div>

          {/* New Deadline Input */}
          <div>
            <label
              htmlFor="newInterestDeadline"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <CalendarClock size={13} className="text-emerald-600" />
              New Interest Deadline <span className="text-rose-500">*</span>
            </label>
            <input
              id="newInterestDeadline"
              type="datetime-local"
              value={interestDeadlineAt}
              onChange={(e) => setInterestDeadlineAt(e.target.value)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            />
            <p className="mt-1 text-[11px] text-gray-400 flex items-center gap-1">
              <Info size={12} className="shrink-0" />
              Must be in the future and occur before event reporting time.
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
              disabled={isLoading || !interestDeadlineAt}
              className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
