import React, { useState, useEffect } from 'react';
import {
  WORKER_TYPES,
  type WorkerType,
  workRequirementsApi,
  type WorkRequirement,
} from '../../features/work-requirements/workRequirementsApi';
import {
  X,
  Loader2,
  AlertCircle,
  Briefcase,
  Users,
  Clock,
  FileText,
  MapPin,
  CalendarClock,
} from 'lucide-react';

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

  const handleAdjustCount = (delta: number) => {
    const current = parseInt(requiredCount, 10) || 1;
    const next = Math.max(1, current + delta);
    setRequiredCount(String(next));
    if (fieldErrors.count) {
      setFieldErrors((prev) => {
        const { count: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200/90 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 bg-linear-to-r from-emerald-50/40 via-white to-gray-50/40">
          <div className="min-w-0 flex-1">
            <h2 id="edit-modal-title" className="text-base font-extrabold text-gray-900 tracking-tight">
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
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Worker Type */}
          <div>
            <label
              htmlFor="editWorkerType"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <Briefcase size={13} className="text-emerald-700" />
              Worker Type <span className="text-rose-500">*</span>
            </label>
            <select
              id="editWorkerType"
              value={workerType}
              onChange={(e) => setWorkerType(e.target.value as WorkerType)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors shadow-2xs"
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
                <Users size={13} className="text-emerald-700" />
                Required Quantity <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleAdjustCount(-1)}
                  disabled={isLoading || Number(requiredCount) <= 1}
                  className="w-9 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-l-xl text-sm border border-r-0 border-gray-300 disabled:opacity-40 transition-colors"
                  aria-label="Decrease quantity"
                >
                  -
                </button>
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
                  className={`w-full px-3 py-2 text-center bg-white border text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors ${
                    fieldErrors.count
                      ? 'border-rose-300 focus:border-rose-500'
                      : 'border-gray-300 focus:border-emerald-700'
                  }`}
                  placeholder="e.g. 5"
                />
                <button
                  type="button"
                  onClick={() => handleAdjustCount(1)}
                  disabled={isLoading}
                  className="w-9 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-r-xl text-sm border border-l-0 border-gray-300 transition-colors"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              {fieldErrors.count && (
                <p role="alert" className="mt-1 text-xs text-rose-600 font-semibold">{fieldErrors.count}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="editReportingTime"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <Clock size={13} className="text-emerald-700" />
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
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors shadow-2xs ${
                  fieldErrors.reportingTime
                    ? 'border-rose-300 focus:border-rose-500'
                    : 'border-gray-300 focus:border-emerald-700'
                }`}
              />
              {fieldErrors.reportingTime && (
                <p role="alert" className="mt-1 text-xs text-rose-600 font-semibold">{fieldErrors.reportingTime}</p>
              )}
            </div>
          </div>

          {/* Maximum Distance and Interest Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="editMaxDistanceKm"
                  className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <MapPin size={13} className="text-emerald-700" />
                  Max Distance (km)
                </label>
                <span className="text-[10px] text-gray-400">Radius</span>
              </div>
              <input
                id="editMaxDistanceKm"
                type="number"
                min="0.1"
                step="0.5"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. 15"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors shadow-2xs"
              />
              {/* Distance Presets */}
              <div className="flex items-center gap-1.5 mt-1.5">
                {['10', '15', '25', '50'].map((dist) => (
                  <button
                    key={dist}
                    type="button"
                    onClick={() => setMaxDistanceKm(dist)}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${
                      maxDistanceKm === dist
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {dist}km
                  </button>
                ))}
              </div>
              {fieldErrors.maxDistanceKm && (
                <p role="alert" className="mt-1 text-xs text-rose-600 font-semibold">{fieldErrors.maxDistanceKm}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="editInterestDeadlineAt"
                className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
              >
                <CalendarClock size={13} className="text-emerald-700" />
                Interest Deadline
              </label>
              <input
                id="editInterestDeadlineAt"
                type="datetime-local"
                value={interestDeadlineAt}
                onChange={(e) => setInterestDeadlineAt(e.target.value)}
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors shadow-2xs"
              />
            </div>
          </div>

          {/* Work Instructions / Description */}
          <div>
            <label
              htmlFor="editDescription"
              className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            >
              <FileText size={13} className="text-emerald-700" />
              Work Instructions & Details{' '}
              <span className="text-gray-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              id="editDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors resize-none shadow-2xs"
              placeholder="e.g. Black uniform required. Report directly to banquet supervisor."
            />
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
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
