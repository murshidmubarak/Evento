import React from 'react';
import {
  type WorkRequirement,
  type WorkRequirementStatus,
} from '../../features/work-requirements/workRequirementsApi';

export const formatDisplayTime = (timeStr?: string): string => {
  if (!timeStr) return 'Not specified';
  const trimmed = timeStr.trim();
  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    let hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  }
  return trimmed;
};

import {
  X,
  Users,
  Clock,
  MapPin,
  CalendarClock,
  Radio,
  Edit2,
  Ban,
  Award,
  Sparkles,
  ChevronRight,
  UserCheck,
  Phone,
} from 'lucide-react';

interface RequirementDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirement: WorkRequirement | null;
  eventTitle: string;
  eventStatus: string;
  onAnnounce?: (req: WorkRequirement) => void;
  onEdit?: (req: WorkRequirement) => void;
  onCancel?: (req: WorkRequirement) => void;
  onExtendDeadline?: (req: WorkRequirement) => void;
  onViewResults?: (req: WorkRequirement) => void;
}

export const RequirementDetailsModal: React.FC<RequirementDetailsModalProps> = ({
  isOpen,
  onClose,
  requirement,
  eventTitle,
  eventStatus,
  onAnnounce,
  onEdit,
  onCancel,
  onExtendDeadline,
  onViewResults,
}) => {
  if (!isOpen || !requirement) return null;

  const isCompleted = eventStatus === 'completed';
  const isDraft = requirement.status === 'draft';
  const isOpenStatus = requirement.status === 'open';
  const isCancelled = requirement.status === 'cancelled';

  const assignedCount = requirement.assignedWorkers?.length || requirement.filled || 0;
  const isFilled = assignedCount >= requirement.requiredCount;
  const progressPercent = Math.min(
    100,
    Math.round((assignedCount / Math.max(1, requirement.requiredCount)) * 100)
  );

  const isExpired = requirement.interestDeadlineAt
    ? new Date(requirement.interestDeadlineAt).getTime() < Date.now()
    : false;

  const getStatusBadge = (status: WorkRequirementStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Draft (Not Announced)
          </span>
        );
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Recruitment Open
          </span>
        );
      case 'selection_in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Selection In Progress
          </span>
        );
      case 'filled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Fully Staffed
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Recruitment Closed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-modal-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200/90 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-linear-to-r from-emerald-50/30 via-white to-gray-50/40 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 id="details-modal-title" className="text-base sm:text-lg font-extrabold text-gray-900 tracking-tight">
                {requirement.workerType}
              </h3>
              {getStatusBadge(requirement.status)}
              {requirement.selectionRound && requirement.selectionRound > 1 && (
                <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-[10px] sm:text-[11px] font-bold border border-purple-200">
                  Round {requirement.selectionRound}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5 truncate">
              <span>Staffing Requirement Details</span>
              <span>•</span>
              <span className="font-semibold text-gray-700 truncate">{eventTitle}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
            title="Close modal"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto space-y-4 sm:space-y-5">
          {/* Key Metrics Grid: Reporting Time, Max Distance, Staffing, Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Reporting Time Card */}
            <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:border-gray-300 transition-colors shadow-2xs">
              <div className="flex items-center gap-2 text-gray-600 text-xs font-bold uppercase tracking-wider">
                <Clock size={15} className="text-emerald-700" />
                <span>Reporting Time</span>
              </div>
              <div className="mt-2 text-base font-black text-gray-900">
                {formatDisplayTime(requirement.reportingTime)}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Required arrival time at venue on event day
              </p>
            </div>

            {/* Max Permitted Distance Card */}
            <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:border-gray-300 transition-colors shadow-2xs">
              <div className="flex items-center gap-2 text-gray-600 text-xs font-bold uppercase tracking-wider">
                <MapPin size={15} className="text-blue-700" />
                <span>Maximum Distance</span>
              </div>
              <div className="mt-2 text-base font-black text-gray-900">
                {requirement.maxDistanceKm ? `${requirement.maxDistanceKm} km` : 'No radius limit'}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {requirement.maxDistanceKm
                  ? `Only workers within ${requirement.maxDistanceKm} km radius are eligible`
                  : 'Open to eligible workers across all distances'}
              </p>
            </div>

            {/* Staffing Demand Card */}
            <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:border-gray-300 transition-colors shadow-2xs">
              <div className="flex items-center justify-between text-gray-600 text-xs font-bold uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-purple-700" />
                  <span>Headcount Progress</span>
                </div>
                <span className="text-gray-900 font-extrabold">{progressPercent}%</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className={`text-xl font-black ${isFilled ? 'text-emerald-700' : 'text-gray-900'}`}>
                  {assignedCount}
                </span>
                <span className="text-gray-400 font-bold">/</span>
                <span className="text-base font-bold text-gray-700">
                  {requirement.requiredCount}
                </span>
                <span className="text-xs text-gray-500 ml-1">workers assigned</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isFilled ? 'bg-emerald-500' : 'bg-purple-600'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Interest Deadline Card */}
            <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 hover:bg-white hover:border-gray-300 transition-colors shadow-2xs">
              <div className="flex items-center gap-2 text-gray-600 text-xs font-bold uppercase tracking-wider">
                <CalendarClock size={15} className="text-amber-700" />
                <span>Interest Window Deadline</span>
              </div>
              <div className="mt-2 text-sm font-bold text-gray-900">
                {requirement.interestDeadlineAt ? (
                  new Date(requirement.interestDeadlineAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                ) : (
                  <span className="text-gray-400 italic font-normal">Not scheduled yet</span>
                )}
              </div>
              <div className="mt-1">
                {requirement.interestDeadlineAt ? (
                  isExpired ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-bold">
                      <Clock size={11} /> Application window closed / expired
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Window currently accepting interest
                    </span>
                  )
                ) : (
                  <span className="text-[11px] text-gray-400">
                    Deadline will be set upon announcement
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Work Description / Instructions */}
          <div className="p-4 rounded-xl border border-gray-200/80 bg-white shadow-2xs">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} className="text-emerald-700" />
              Role Description & Special Instructions
            </h4>
            {requirement.description ? (
              <p className="text-xs text-gray-700 mt-2 leading-relaxed bg-gray-50/80 p-3.5 rounded-xl border border-gray-100 font-medium">
                {requirement.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic mt-2">
                No custom instructions specified. General guidelines for {requirement.workerType} apply.
              </p>
            )}
          </div>

          {/* Assigned Workers Quick List (if any) */}
          {requirement.assignedWorkers && requirement.assignedWorkers.length > 0 && (
            <div className="p-4 rounded-xl border border-gray-200/80 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <UserCheck size={15} className="text-emerald-700" />
                  Assigned Personnel ({requirement.assignedWorkers.length})
                </h4>
                {onViewResults && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onViewResults(requirement);
                    }}
                    className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1 transition-colors"
                  >
                    View All in Staffing Results <ChevronRight size={13} />
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
                {requirement.assignedWorkers.map((aw, idx) => {
                  const workerObj = typeof aw.workerId === 'object' ? aw.workerId : null;
                  const name = workerObj?.name || 'Assigned Worker';
                  const phone = workerObj?.phone;

                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{name}</div>
                          {phone && (
                            <a
                              href={`tel:${phone}`}
                              className="text-[11px] text-gray-500 hover:text-emerald-700 flex items-center gap-1 mt-0.5"
                            >
                              <Phone size={10} className="text-gray-400" />
                              <span>{phone}</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {aw.distanceKm !== undefined && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                            <MapPin size={10} className="text-gray-400" />
                            {aw.distanceKm.toFixed(1)} km away
                          </span>
                        )}
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Assigned {new Date(aw.assignedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Extension History (if any) */}
          {requirement.extensionHistory && requirement.extensionHistory.length > 0 && (
            <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50 shadow-2xs">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} className="text-blue-700" />
                Deadline Extension Audit Trail ({requirement.extensionHistory.length})
              </h4>
              <div className="mt-2.5 space-y-2">
                {requirement.extensionHistory.map((hist, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded-xl border border-gray-200/80 text-xs text-gray-700 flex items-center justify-between shadow-2xs"
                  >
                    <div>
                      <span className="text-[11px] font-semibold text-gray-500">
                        Extended to:
                      </span>{' '}
                      <span className="font-bold text-gray-900">
                        {new Date(hist.newDeadline).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Remaining quota at extension: {hist.remainingCount} workers
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 text-right">
                      {new Date(hist.extendedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Notes */}
          {isCancelled && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <Ban size={15} className="text-rose-600 shrink-0" />
              <span>This requirement was cancelled and will not participate in worker selection.</span>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gray-50/80 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition-colors shadow-2xs"
          >
            Close
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* If completed event, only staffing results can be viewed */}
            {isCompleted ? (
              !isDraft && !isCancelled && onViewResults && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewResults(requirement);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-2xs transition-colors"
                >
                  <Award size={14} />
                  View Staffing Results
                </button>
              )
            ) : (
              <>
                {/* Cancel action (for draft or open) */}
                {(isDraft || isOpenStatus) && onCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onCancel(requirement);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors"
                    title="Cancel this requirement"
                  >
                    <Ban size={14} />
                    Cancel
                  </button>
                )}

                {/* Edit action (for draft) */}
                {isDraft && onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEdit(requirement);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl transition-colors shadow-2xs"
                    title="Edit requirement settings"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                )}

                {/* Extend Deadline action (for open & not fully staffed) */}
                {isOpenStatus && !isFilled && onExtendDeadline && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onExtendDeadline(requirement);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
                    title="Extend Interest Deadline"
                  >
                    <CalendarClock size={14} />
                    Extend Deadline
                  </button>
                )}

                {/* Staffing Results action (for published requirements) */}
                {!isDraft && !isCancelled && onViewResults && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onViewResults(requirement);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-2xs transition-colors"
                    title="View Selection Results & Candidates"
                  >
                    <Award size={14} />
                    Staffing Results
                  </button>
                )}

                {/* Announce action (also in modal for convenience when reviewing draft) */}
                {isDraft && onAnnounce && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAnnounce(requirement);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-2xs transition-colors"
                    title="Announce recruitment & broadcast to workers"
                  >
                    <Radio size={14} className="animate-pulse" />
                    Announce Recruitment
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
