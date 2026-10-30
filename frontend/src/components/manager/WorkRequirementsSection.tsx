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
import { ExtendDeadlineModal } from './ExtendDeadlineModal';
import { SelectionResultsModal } from './SelectionResultsModal';
import { AnnounceRequirementModal } from './AnnounceRequirementModal';
import { RequirementDetailsModal } from './RequirementDetailsModal';
import {
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Users,
  Clock,
  Search,
  Filter,
  ShieldAlert,
  CheckCircle2,
  CalendarClock,
  Radio,
  ChevronRight,
  X,
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
  const [extendingRequirement, setExtendingRequirement] = useState<WorkRequirement | null>(null);
  const [resultsRequirement, setResultsRequirement] = useState<WorkRequirement | null>(null);
  const [announcingRequirement, setAnnouncingRequirement] = useState<WorkRequirement | null>(null);
  const [selectedDetailRequirement, setSelectedDetailRequirement] = useState<WorkRequirement | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isConfirmed = eventStatus === 'confirmed';
  const isCompleted = eventStatus === 'completed';
  const canAccessRequirements = isConfirmed || isCompleted;

  const fetchRequirements = async () => {
    if (!eventId || !canAccessRequirements) {
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
    }, 4500);
  };

  const handleCreated = (newReq: WorkRequirement) => {
    setIsCreateModalOpen(false);
    setRequirements((prev) => [...prev, newReq]);
    triggerSuccessNotice(`Successfully created requirement for ${newReq.requiredCount} × ${newReq.workerType}`);
  };

  const handleUpdated = (updatedReq: WorkRequirement) => {
    setEditingRequirement(null);
    setSelectedDetailRequirement((current) => (current?._id === updatedReq._id ? updatedReq : current));
    setRequirements((prev) =>
      prev.map((r) => (r._id === updatedReq._id ? updatedReq : r))
    );
    triggerSuccessNotice(`Successfully updated requirement for ${updatedReq.workerType}`);
  };

  const handleCancelled = (cancelledReq: WorkRequirement) => {
    setCancellingRequirement(null);
    setSelectedDetailRequirement((current) => (current?._id === cancelledReq._id ? cancelledReq : current));
    setRequirements((prev) =>
      prev.map((r) => (r._id === cancelledReq._id ? cancelledReq : r))
    );
    triggerSuccessNotice(`Requirement for ${cancelledReq.workerType} has been cancelled`);
  };

  const handleDeadlineExtended = (updatedReq: WorkRequirement) => {
    setExtendingRequirement(null);
    setSelectedDetailRequirement((current) => (current?._id === updatedReq._id ? updatedReq : current));
    setRequirements((prev) =>
      prev.map((r) => (r._id === updatedReq._id ? updatedReq : r))
    );
    triggerSuccessNotice(
      `Extended deadline for ${updatedReq.workerType}. All existing assigned workers preserved.`
    );
  };

  const handleAnnounced = (updatedReq: WorkRequirement) => {
    setAnnouncingRequirement(null);
    setSelectedDetailRequirement((current) => (current?._id === updatedReq._id ? updatedReq : current));
    setRequirements((prev) =>
      prev.map((r) => (r._id === updatedReq._id ? updatedReq : r))
    );
    triggerSuccessNotice(
      `Recruitment opened for ${updatedReq.workerType}! Matching workers can now view and apply for this opportunity.`
    );
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

  // Tab count indicators
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: requirements.length,
      draft: 0,
      open: 0,
      selection_in_progress: 0,
      filled: 0,
      closed: 0,
      cancelled: 0,
    };
    for (const r of requirements) {
      if (counts[r.status] !== undefined) {
        counts[r.status]++;
      }
    }
    return counts;
  }, [requirements]);

  const getStatusBadge = (status: WorkRequirementStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Draft
          </span>
        );
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Open
          </span>
        );
      case 'selection_in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            Selecting
          </span>
        );
      case 'filled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Filled
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Closed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  // If event is not confirmed or completed, render informative notice
  if (!canAccessRequirements) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/80 shadow-2xs">
          <ShieldAlert size={30} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            Work Requirements Locked for This Event
          </h3>
          <p className="text-sm text-gray-600 mt-2 max-w-lg mx-auto leading-relaxed">
            Under EventOps business rules (§25), worker recruitment begins only after Event = confirmed. Staffing demand and work requirements can only be defined once an event is in{' '}
            <span className="font-semibold text-emerald-700">Confirmed</span> status.
          </p>
        </div>
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
      {/* Event Completed Read-Only Banner */}
      {isCompleted && (
        <div className="p-4 bg-purple-50/90 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center gap-3 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 font-bold">
            <CheckCircle2 size={16} />
          </div>
          <div>
            <div className="font-bold text-purple-950">Event Completed (View Only)</div>
            <div className="text-purple-700 text-[11px] mt-0.5">
              This event's scheduled date and time has passed and its status is completed. New work requirements cannot be created, but you can view existing requirements, assigned staffing counts, and selection outcomes below.
            </div>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {successNotice && (
        <div
          role="status"
          className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between gap-2.5 animate-in fade-in duration-200 shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md"
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Summary Card */}
      <WorkRequirementsSummary requirements={requirements} />

      {/* Header & Actions Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-1">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 tracking-tight">
              Staffing Work Requirements ({requirements.length})
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Click any row to view full details, reporting schedule, distance criteria, and manage actions.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={fetchRequirements}
              disabled={isLoading}
              className="p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl border border-gray-200/90 transition-colors shadow-2xs shrink-0"
              title="Refresh requirements"
              aria-label="Refresh requirements list"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin text-emerald-700' : ''} />
            </button>

            {!isCompleted ? (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow transition-all"
              >
                <Plus size={16} />
                Add Requirement
              </button>
            ) : (
              <span className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl border border-gray-200">
                <CheckCircle2 size={14} className="text-gray-500" />
                Completed Event
              </span>
            )}
          </div>
        </div>

        {/* Filters & Search Row */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3">
          <div className="relative w-full sm:flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by worker role, instructions, or time..."
              className="w-full pl-9 pr-9 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <Filter size={14} className="text-gray-400 shrink-0 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter requirements by status"
              className="w-full sm:w-auto px-3 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-colors cursor-pointer"
            >
              <option value="all">All Statuses ({requirements.length})</option>
              <option value="draft">Draft ({filterCounts.draft || 0})</option>
              <option value="open">Open ({filterCounts.open || 0})</option>
              <option value="selection_in_progress">Selecting ({filterCounts.selection_in_progress || 0})</option>
              <option value="filled">Filled ({filterCounts.filled || 0})</option>
              <option value="closed">Closed ({filterCounts.closed || 0})</option>
              <option value="cancelled">Cancelled ({filterCounts.cancelled || 0})</option>
            </select>
          </div>
        </div>

        {/* Error Feedback */}
        {error && (
          <div
            role="alert"
            className="p-8 text-center border border-rose-200 bg-rose-50/50 rounded-2xl space-y-3"
          >
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
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <Loader2 size={32} className="text-emerald-700 animate-spin mb-3" />
            <p className="text-xs font-bold text-gray-800">Loading work requirements...</p>
            <p className="text-[11px] text-gray-400 mt-1">Retrieving live staffing demands and worker selection quotas.</p>
          </div>
        ) : filteredRequirements.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-4">
            <div className="w-14 h-14 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Users size={24} />
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900">
                {requirements.length === 0
                  ? 'No Work Requirements Created'
                  : 'No matching requirements found'}
              </h4>
              <p className="text-xs text-gray-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
                {requirements.length === 0
                  ? 'Create staffing requirements for this event to define the headcount and roles for recruitment.'
                  : 'Try adjusting your search query or status filter.'}
              </p>
            </div>
            {requirements.length === 0 && !isCompleted && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
              >
                <Plus size={16} />
                Create First Requirement
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-xl border border-gray-200/80">
            <table className="w-full min-w-[560px] sm:min-w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/90 text-gray-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 sm:px-4">Worker Role</th>
                  <th className="py-3 px-3 sm:px-4">Staffing Progress</th>
                  <th className="py-3 px-3 sm:px-4">Interest Window</th>
                  <th className="py-3 px-3 sm:px-4">Status</th>
                  <th className="py-3 px-3.5 sm:px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredRequirements.map((req) => {
                  const isDraft = req.status === 'draft';
                  const isCancelled = req.status === 'cancelled';
                  const assignedCount = req.assignedWorkers?.length || req.filled || 0;
                  const isFilled = assignedCount >= req.requiredCount;
                  const isExpired = req.interestDeadlineAt
                    ? new Date(req.interestDeadlineAt).getTime() < Date.now()
                    : false;
                  const progressPercent = Math.min(
                    100,
                    Math.round((assignedCount / Math.max(1, req.requiredCount)) * 100)
                  );

                  return (
                    <tr
                      key={req._id}
                      onClick={() => setSelectedDetailRequirement(req)}
                      className={`hover:bg-emerald-50/50 cursor-pointer transition-colors group ${
                        isCancelled ? 'opacity-65 bg-gray-50/30' : ''
                      }`}
                      title="Click to view details and options"
                    >
                      {/* Worker Role & Info */}
                      <td className="py-3.5 sm:py-4 px-3.5 sm:px-4 font-bold text-gray-900">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-gray-900 group-hover:text-emerald-800 transition-colors font-bold text-sm">
                              {req.workerType}
                            </span>
                            {req.selectionRound && req.selectionRound > 1 && (
                              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-[10px] font-bold border border-purple-200">
                                Round {req.selectionRound}
                              </span>
                            )}
                          </div>
                          {req.description ? (
                            <p
                              className="text-[11px] text-gray-500 font-normal line-clamp-1 truncate max-w-xs"
                              title={req.description}
                            >
                              {req.description}
                            </p>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-normal">
                              Standard requirements
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Staffing Headcount with Visual Progress Bar */}
                      <td className="py-3.5 sm:py-4 px-3 sm:px-4">
                        <div className="flex flex-col gap-1.5 min-w-[110px] max-w-[140px]">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1">
                              <span
                                className={`font-black text-sm ${
                                  isFilled ? 'text-emerald-700' : 'text-gray-900'
                                }`}
                              >
                                {assignedCount}
                              </span>
                              <span className="text-gray-400">/</span>
                              <span className="font-bold text-gray-600">
                                {req.requiredCount}
                              </span>
                              <span className="text-[10px] text-gray-400 ml-0.5">filled</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-500">
                              {progressPercent}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200/50">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isFilled
                                  ? 'bg-emerald-500'
                                  : progressPercent > 0
                                  ? 'bg-purple-600'
                                  : 'bg-gray-300'
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Interest Deadline */}
                      <td className="py-3.5 sm:py-4 px-3 sm:px-4 whitespace-nowrap">
                        {req.interestDeadlineAt ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-gray-900">
                              {new Date(req.interestDeadlineAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isExpired ? (
                              <span className="text-[10px] text-amber-700 font-bold flex items-center gap-1 mt-0.5">
                                <Clock size={11} /> Expired
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                                <CalendarClock size={11} /> Window open
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">Pending announcement</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 sm:py-4 px-3 sm:px-4 whitespace-nowrap">{getStatusBadge(req.status)}</td>

                      {/* Row Actions: Announce button kept in row, plus Details affordance */}
                      <td className="py-3.5 sm:py-4 px-3.5 sm:px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5 sm:gap-2">
                          {/* Announce button for draft requirements - directly accessible in row */}
                          {isDraft && !isCompleted && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnnouncingRequirement(req);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-95 shadow-2xs hover:shadow-xs rounded-lg transition-all"
                              title="Announce recruitment & open for worker interest"
                            >
                              <Radio size={13} className="animate-pulse" />
                              Announce
                            </button>
                          )}

                          {/* Details trigger button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDetailRequirement(req);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-gray-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg border border-transparent hover:border-emerald-200 transition-all"
                            title="View full requirement details and actions"
                          >
                            <span>Details</span>
                            <ChevronRight
                              size={14}
                              className="text-gray-400 group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-transform"
                            />
                          </button>
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

      {/* Details & Actions Modal */}
      <RequirementDetailsModal
        isOpen={Boolean(selectedDetailRequirement)}
        onClose={() => setSelectedDetailRequirement(null)}
        requirement={selectedDetailRequirement}
        eventTitle={eventTitle}
        eventStatus={eventStatus}
        onAnnounce={(req) => {
          setSelectedDetailRequirement(null);
          setAnnouncingRequirement(req);
        }}
        onEdit={(req) => {
          setSelectedDetailRequirement(null);
          setEditingRequirement(req);
        }}
        onCancel={(req) => {
          setSelectedDetailRequirement(null);
          setCancellingRequirement(req);
        }}
        onExtendDeadline={(req) => {
          setSelectedDetailRequirement(null);
          setExtendingRequirement(req);
        }}
        onViewResults={(req) => {
          setSelectedDetailRequirement(null);
          setResultsRequirement(req);
        }}
      />

      {/* Action Modals */}
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

      <ExtendDeadlineModal
        isOpen={Boolean(extendingRequirement)}
        onClose={() => setExtendingRequirement(null)}
        onExtended={handleDeadlineExtended}
        requirement={extendingRequirement}
        eventTitle={eventTitle}
      />

      <SelectionResultsModal
        isOpen={Boolean(resultsRequirement)}
        onClose={() => setResultsRequirement(null)}
        requirementId={resultsRequirement?._id || ''}
        eventTitle={eventTitle}
        onSelectionTriggered={fetchRequirements}
      />

      <AnnounceRequirementModal
        isOpen={Boolean(announcingRequirement)}
        onClose={() => setAnnouncingRequirement(null)}
        onAnnounced={handleAnnounced}
        requirement={announcingRequirement}
        eventTitle={eventTitle}
      />
    </div>
  );
};
