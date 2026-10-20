import React, { useState, useEffect, useMemo } from 'react';
import {
  workRequirementsApi,
  type WorkRequirement,
  type WorkRequirementStatus,
} from '../../features/work-requirements/workRequirementsApi';
import { WorkRequirementsSummary } from './WorkRequirementsSummary';
import { CreateRequirementModal } from './CreateRequirementModal';
import { EditRequirementModal } from './EditRequirementModal';
import { CancelRequirementModal } from './CancelRequirementModal';
import {
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Briefcase,
  Users,
  Clock,
  FileText,
  Search,
  Filter,
  ShieldAlert,
  Edit2,
  Ban,
  CheckCircle2,
} from 'lucide-react';

interface WorkRequirementsSectionProps {
  eventId: string;
  eventTitle: string;
  eventStatus: string;
}

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

export const WorkRequirementsSection: React.FC<WorkRequirementsSectionProps> = ({
  eventId,
  eventTitle,
  eventStatus,
}) => {
  const [requirements, setRequirements] = useState<WorkRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<WorkRequirement | null>(null);
  const [cancellingRequirement, setCancellingRequirement] = useState<WorkRequirement | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isConfirmed = eventStatus === 'confirmed';

  const fetchRequirements = async () => {
    if (!eventId || !isConfirmed) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await workRequirementsApi.getRequirementsByEvent(eventId);
      setRequirements(data || []);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          'Failed to load work requirements. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, [eventId, eventStatus]);

  // Flash auto-dismissing success notice
  const triggerSuccessNotice = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => {
      setSuccessNotice((current) => (current === msg ? null : current));
    }, 4000);
  };

  const handleCreated = (newReq: WorkRequirement) => {
    setIsCreateModalOpen(false);
    setRequirements((prev) => [...prev, newReq]);
    triggerSuccessNotice(`Successfully created requirement for ${newReq.requiredCount} × ${newReq.workerType}`);
  };

  const handleUpdated = (updatedReq: WorkRequirement) => {
    setEditingRequirement(null);
    setRequirements((prev) =>
      prev.map((r) => (r._id === updatedReq._id ? updatedReq : r))
    );
    triggerSuccessNotice(`Successfully updated requirement for ${updatedReq.workerType}`);
  };

  const handleCancelled = (cancelledReq: WorkRequirement) => {
    setCancellingRequirement(null);
    setRequirements((prev) =>
      prev.map((r) => (r._id === cancelledReq._id ? cancelledReq : r))
    );
    triggerSuccessNotice(`Requirement for ${cancelledReq.workerType} has been cancelled`);
  };

  const filteredRequirements = useMemo(() => {
    return requirements.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const type = (req.workerType || '').toLowerCase();
        const desc = (req.description || '').toLowerCase();
        const time = (req.reportingTime || '').toLowerCase();
        return type.includes(q) || desc.includes(q) || time.includes(q);
      }
      return true;
    });
  }, [requirements, statusFilter, searchQuery]);

  const getStatusBadge = (status: WorkRequirementStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Draft
          </span>
        );
      case 'open':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Open
          </span>
        );
      case 'selection_in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            Selecting
          </span>
        );
      case 'filled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Filled
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Closed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  // If event is not confirmed, render informative notice
  if (!isConfirmed) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-100">
          <ShieldAlert size={28} />
        </div>
        <h3 className="text-base font-bold text-gray-900">
          Work Requirements Locked for This Event
        </h3>
        <p className="text-sm text-gray-600 max-w-lg mx-auto leading-relaxed">
          Under EventOps business rules (§25), worker recruitment begins only after Event = confirmed. Staffing demand and work requirements can only be defined once an event is in{' '}
          <span className="font-semibold text-emerald-700">Confirmed</span> status.
        </p>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg border border-gray-200">
          Current Event Status: <span className="font-bold capitalize">{eventStatus?.replace('_', ' ')}</span>
        </div>
        <p className="text-xs text-gray-400">
          Work requirement creation and management actions are disabled until advance payment is confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Notification Banner */}
      {successNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800 flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Summary Card */}
      <WorkRequirementsSummary requirements={requirements} />

      {/* Header & Actions Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Briefcase size={18} className="text-emerald-600" />
              Staffing Work Requirements ({requirements.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Specify worker types, headcounts, reporting times, and duties.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={fetchRequirements}
              disabled={isLoading}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
              title="Refresh requirements"
              aria-label="Refresh requirements list"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              <Plus size={16} />
              Add Requirement
            </button>
          </div>
        </div>

        {/* Filters & Search Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <div className="relative flex-1 w-full">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by worker type, time, or instructions..."
              className="w-full pl-9 pr-3.5 py-2 bg-gray-50/70 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} className="text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-gray-50/70 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-colors"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="selection_in_progress">Selecting</option>
              <option value="filled">Filled</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-8 text-center border border-rose-200 bg-rose-50/50 rounded-xl space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={22} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">Failed to Load Work Requirements</h4>
              <p className="text-xs text-rose-700 mt-1 max-w-md mx-auto">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchRequirements}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        )}

        {/* Requirements Table / List */}
        {!error && (isLoading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <Loader2 size={28} className="text-emerald-600 animate-spin mb-2" />
            <p className="text-xs font-semibold text-gray-700">Loading work requirements...</p>
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-xl space-y-3">
            <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
              <Users size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">
                {requirements.length === 0
                  ? 'No Work Requirements Created'
                  : 'No matching requirements found'}
              </h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                {requirements.length === 0
                  ? 'Create staffing requirements for this event to define the headcount and roles for recruitment.'
                  : 'Try adjusting your search query or status filter.'}
              </p>
            </div>
            {requirements.length === 0 && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Plus size={15} />
                Create First Requirement
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 sm:mx-0">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Worker Type</th>
                  <th className="py-3 px-4">Quantity</th>
                  <th className="py-3 px-4">Reporting Time</th>
                  <th className="py-3 px-4">Instructions / Notes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRequirements.map((req) => {
                  const isDraft = req.status === 'draft';
                  const isOpen = req.status === 'open';
                  const isCancelled = req.status === 'cancelled';

                  return (
                    <tr
                      key={req._id}
                      className={`hover:bg-gray-50/60 transition-colors ${
                        isCancelled ? 'opacity-60 bg-gray-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-bold text-gray-900 flex items-center gap-2">
                        <Briefcase size={14} className="text-emerald-600 shrink-0" />
                        <span>{req.workerType}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-sm text-gray-900">
                          {req.requiredCount}
                        </span>
                        <span className="text-[11px] text-gray-500 ml-1">needed</span>
                      </td>

                      <td className="py-3.5 px-4 text-gray-700 font-medium">
                        {req.reportingTime ? (
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-gray-400 shrink-0" />
                            <span>{formatDisplayTime(req.reportingTime)}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Not specified</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-gray-600 max-w-xs truncate" title={req.description}>
                        {req.description ? (
                          <div className="flex items-center gap-1.5 truncate">
                            <FileText size={13} className="text-gray-400 shrink-0" />
                            <span className="truncate">{req.description}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">None</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">{getStatusBadge(req.status)}</td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => setEditingRequirement(req)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors"
                              title="Edit requirement"
                            >
                              <Edit2 size={13} />
                              Edit
                            </button>
                          )}

                          {(isDraft || isOpen) && (
                            <button
                              type="button"
                              onClick={() => setCancellingRequirement(req)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                              title="Cancel requirement"
                            >
                              <Ban size={13} />
                              Cancel
                            </button>
                          )}

                          {isCancelled && (
                            <span className="text-[11px] text-gray-400 italic">Cancelled</span>
                          )}

                          {!isDraft && !isOpen && !isCancelled && (
                            <span className="text-[11px] text-gray-400 italic">Locked</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Modals */}
      <CreateRequirementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreated}
        eventId={eventId}
        eventTitle={eventTitle}
      />

      <EditRequirementModal
        isOpen={Boolean(editingRequirement)}
        onClose={() => setEditingRequirement(null)}
        onUpdated={handleUpdated}
        requirement={editingRequirement}
        eventTitle={eventTitle}
      />

      <CancelRequirementModal
        isOpen={Boolean(cancellingRequirement)}
        onClose={() => setCancellingRequirement(null)}
        onCancelled={handleCancelled}
        requirement={cancellingRequirement}
      />
    </div>
  );
};
