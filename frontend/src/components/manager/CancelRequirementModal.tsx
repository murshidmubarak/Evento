import React, { useState } from 'react';
import {
  workRequirementsApi,
  type WorkRequirement,
} from '../../features/work-requirements/workRequirementsApi';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface CancelRequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCancelled: (requirement: WorkRequirement) => void;
  requirement: WorkRequirement | null;
}

export const CancelRequirementModal: React.FC<CancelRequirementModalProps> = ({
  isOpen,
  onClose,
  onCancelled,
  requirement,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !requirement) return null;

  const handleConfirm = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const updated = await workRequirementsApi.cancelRequirement(requirement._id);
      onCancelled(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'Failed to cancel work requirement. Please try again.';
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
      aria-labelledby="cancel-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <AlertTriangle size={24} />
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

          <div className="mt-4">
            <h3 id="cancel-modal-title" className="text-base font-bold text-gray-900">
              Cancel Work Requirement?
            </h3>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">
              Are you sure you want to cancel the requirement for{' '}
              <span className="font-bold text-gray-900">
                {requirement.requiredCount} × {requirement.workerType}
              </span>
              ?
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
              This requirement will no longer be considered active staffing demand and will not be processed by the Worker Selection Engine.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Keep Requirement
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
