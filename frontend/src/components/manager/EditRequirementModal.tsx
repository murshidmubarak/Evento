import React, { useState, useEffect } from 'react';
import {
  WORKER_TYPES,
  type WorkerType,
  workRequirementsApi,
  type WorkRequirement,
} from '../../features/work-requirements/workRequirementsApi';
import { X, Loader2, AlertCircle, Briefcase, Users, Clock, FileText, MapPin, CalendarClock } from 'lucide-react';

interface EditRequirementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (requirement: WorkRequirement) => void;
  requirement: WorkRequirement | null;
  eventTitle: string;
}

const formatToHHMM = (val?: string): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    return trimmed;
  }
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([APap][Mm])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const meridian = match12[3].toUpperCase();
    if (meridian === 'PM' && hours < 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  return trimmed;
};

const formatToDatetimeLocal = (iso?: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Format YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${mins}`;
  } catch {
    return '';
  }
};

export const EditRequirementModal: React.FC<EditRequirementModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  requirement,
  eventTitle,
}) => {
  const [workerType, setWorkerType] = useState<WorkerType>(WORKER_TYPES[0]);
  const [requiredCount, setRequiredCount] = useState<string>('1');
  const [reportingTime, setReportingTime] = useState<string>('');
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>('15');
  const [interestDeadlineAt, setInterestDeadlineAt] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    count?: string;
    reportingTime?: string;
    maxDistanceKm?: string;
  }>({});

  useEffect(() => {
    if (requirement) {
      setWorkerType(requirement.workerType || WORKER_TYPES[0]);
      setRequiredCount(String(requirement.requiredCount || 1));
      setReportingTime(formatToHHMM(requirement.reportingTime));
      setMaxDistanceKm(requirement.maxDistanceKm !== undefined ? String(requirement.maxDistanceKm) : '15');
      setInterestDeadlineAt(formatToDatetimeLocal(requirement.interestDeadlineAt));
      setDescription(requirement.description || '');
      setErrorMessage(null);
      setFieldErrors({});
    }
  }, [requirement]);

  if (!isOpen || !requirement) return null;

  const validate = () => {
    const errors: { count?: string; reportingTime?: string; maxDistanceKm?: string } = {};
    const countNum = Number(requiredCount);

    if (!requiredCount || isNaN(countNum) || !Number.isInteger(countNum) || countNum < 1) {
      errors.count = 'Required count must be a whole number of at least 1';
    }

    if (!reportingTime || reportingTime.trim().length === 0) {
      errors.reportingTime = 'Reporting time is required';
    }

    if (maxDistanceKm) {
      const dist = Number(maxDistanceKm);
      if (isNaN(dist) || dist <= 0) {
        errors.maxDistanceKm = 'Maximum distance must be a positive number';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const updated = await workRequirementsApi.updateRequirement(requirement._id, {
        workerType,
        requiredCount: parseInt(requiredCount, 10),
        reportingTime: reportingTime.trim(),
        maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm) : undefined,
        interestDeadlineAt: interestDeadlineAt ? new Date(interestDeadlineAt).toISOString() : undefined,
        description: description.trim() || undefined,
      });

      onUpdated(updated);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        (Array.isArray(err.response?.data?.errors)
          ? err.response.data.errors.join(', ')
          : 'Failed to update work requirement. Please verify details and try again.');
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
      aria-labelledby="edit-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 id="edit-modal-title" className="text-base font-bold text-gray-900">
              Edit Work Requirement
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs sm:max-w-md">
              Event: <span className="font-semibold text-gray-700">{eventTitle}</span>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Worker Type */}
          <div>
            <label
              htmlFor="editWorkerType"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <Briefcase size={13} className="text-emerald-600" />
              Worker Type <span className="text-rose-500">*</span>
            </label>
            <select
              id="editWorkerType"
              value={workerType}
              onChange={(e) => setWorkerType(e.target.value as WorkerType)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            >
              {WORKER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Required Count & Reporting Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="editRequiredCount"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <Users size={13} className="text-emerald-600" />
                Required Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                id="editRequiredCount"
                type="number"
                min="1"
                step="1"
                value={requiredCount}
                onChange={(e) => {
                  setRequiredCount(e.target.value);
                  if (fieldErrors.count) {
                    setFieldErrors((prev) => {
                      const { count: _, ...rest } = prev;
                      return rest;
                    });
                  }
                }}
                disabled={isLoading}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors ${
                  fieldErrors.count
                    ? 'border-rose-300 focus:border-rose-500'
                    : 'border-gray-200 focus:border-emerald-600'
                }`}
                placeholder="e.g. 5"
              />
              {fieldErrors.count && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.count}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="editReportingTime"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <Clock size={13} className="text-emerald-600" />
                Reporting Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="editReportingTime"
                type="time"
                value={reportingTime}
                onChange={(e) => {
                  setReportingTime(e.target.value);
                  if (fieldErrors.reportingTime) {
                    setFieldErrors((prev) => {
                      const { reportingTime: _, ...rest } = prev;
                      return rest;
                    });
                  }
                }}
                disabled={isLoading}
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors ${
                  fieldErrors.reportingTime
                    ? 'border-rose-300 focus:border-rose-500'
                    : 'border-gray-200 focus:border-emerald-600'
                }`}
              />
              {fieldErrors.reportingTime && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.reportingTime}</p>
              )}
            </div>
          </div>

          {/* Maximum Distance and Interest Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="editMaxDistanceKm"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <MapPin size={13} className="text-emerald-600" />
                Max Distance (km)
              </label>
              <input
                id="editMaxDistanceKm"
                type="number"
                min="0.1"
                step="0.5"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. 15"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
              />
              {fieldErrors.maxDistanceKm && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{fieldErrors.maxDistanceKm}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="editInterestDeadlineAt"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <CalendarClock size={13} className="text-emerald-600" />
                Interest Deadline
              </label>
              <input
                id="editInterestDeadlineAt"
                type="datetime-local"
                value={interestDeadlineAt}
                onChange={(e) => setInterestDeadlineAt(e.target.value)}
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
              />
            </div>
          </div>

          {/* Work Instructions / Description */}
          <div>
            <label
              htmlFor="editDescription"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <FileText size={13} className="text-emerald-600" />
              Work Instructions & Details{' '}
              <span className="text-gray-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              id="editDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors resize-none"
              placeholder="e.g. Black uniform required. Report directly to banquet supervisor."
            />
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
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && <Loader2 size={14} className="animate-spin" />}
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
