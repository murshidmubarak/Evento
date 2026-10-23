import React, { useState, useEffect } from 'react';
import {
  workRequirementsApi,
  type SelectionResultsData,
} from '../../features/work-requirements/workRequirementsApi';
import {
  X,
  Loader2,
  AlertCircle,
  Briefcase,
  Users,
  CheckCircle2,
  MapPin,
  RefreshCw,
  History,
  Sparkles,
  Clock,
} from 'lucide-react';

interface SelectionResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirementId: string;
  eventTitle: string;
  onSelectionTriggered?: () => void;
}

export const SelectionResultsModal: React.FC<SelectionResultsModalProps> = ({
  isOpen,
  onClose,
  requirementId,
  eventTitle,
  onSelectionTriggered,
}) => {
  const [data, setData] = useState<SelectionResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<'assigned' | 'candidates' | 'history'>('assigned');

  const fetchResults = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await workRequirementsApi.getSelectionResults(requirementId);
      setData(res);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to load selection results');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && requirementId) {
      fetchResults();
    }
  }, [isOpen, requirementId]);

  if (!isOpen) return null;

  const handleTriggerSelection = async () => {
    try {
      setIsTriggering(true);
      setErrorMessage(null);
      await workRequirementsApi.triggerSelection(requirementId);
      await fetchResults();
      if (onSelectionTriggered) {
        onSelectionTriggered();
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to run worker selection');
    } finally {
      setIsTriggering(false);
    }
  };

  const req = data?.requirement;
  const assigned = data?.assignedWorkers || [];
  const candidates = data?.candidates || [];
  const history = data?.extensionHistory || [];

  const filledCount = req?.filled ?? assigned.length;
  const pendingCount = req ? Math.max(0, req.requiredCount - filledCount) : 0;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="selection-results-title"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 id="selection-results-title" className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-600" />
              Worker Selection Results & Staffing Status
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
              {req?.workerType || 'Requirement'} &bull; Event: <span className="font-semibold text-gray-700">{eventTitle}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {isLoading ? (
            <div className="py-16 text-center text-gray-400 space-y-2">
              <Loader2 size={24} className="animate-spin mx-auto text-emerald-600" />
              <p className="text-xs font-medium">Loading staffing results...</p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                    Required
                  </span>
                  <span className="text-xl font-extrabold text-gray-900">{req?.requiredCount}</span>
                </div>

                <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block mb-0.5">
                    Assigned
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700">{filledCount}</span>
                </div>

                <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-100 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-0.5">
                    Remaining
                  </span>
                  <span className="text-xl font-extrabold text-amber-700">{pendingCount}</span>
                </div>

                <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-0.5">
                    Max Distance
                  </span>
                  <span className="text-xl font-extrabold text-blue-700">
                    {req?.maxDistanceKm ? `${req.maxDistanceKm} km` : '—'}
                  </span>
                </div>
              </div>

              {/* Status and Round Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50/80 rounded-xl border border-gray-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Status:</span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800 uppercase">
                    {req?.status}
                  </span>
                  <span className="text-gray-400">&bull;</span>
                  <span className="text-gray-500 font-medium">Selection Round:</span>
                  <span className="font-semibold text-gray-800">Round {req?.selectionRound || 1}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTriggerSelection}
                    disabled={isTriggering}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-semibold rounded-lg shadow-2xs transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isTriggering ? 'animate-spin text-emerald-600' : ''} />
                    {isTriggering ? 'Running...' : 'Run Selection Now'}
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('assigned')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'assigned'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Users size={14} />
                  Assigned Workers ({assigned.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('candidates')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'candidates'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Briefcase size={14} />
                  Interested Pool ({candidates.length})
                </button>

                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                      activeTab === 'history'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <History size={14} />
                    Extension History ({history.length})
                  </button>
                )}
              </div>

              {/* Tab 1: Assigned Workers */}
              {activeTab === 'assigned' && (
                <div className="space-y-3">
                  {assigned.length === 0 ? (
                    <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500">
                      No workers have been selected yet. Once the interest deadline expires, the selection engine will assign eligible candidates.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                      {assigned.map((a, idx) => {
                        const workerObj = typeof a.workerId === 'object' ? a.workerId : null;
                        const workerName = workerObj?.name || 'Assigned Worker';
                        const workerPhone = workerObj?.phone || 'Phone not provided';
                        const workerAddress = workerObj?.location?.address || 'Location on file';

                        return (
                          <div key={idx} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-gray-50/50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center shrink-0 border border-emerald-100">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 text-sm">{workerName}</p>
                                <p className="text-gray-500 text-[11px] flex items-center gap-2 mt-0.5">
                                  <span>{workerPhone}</span>
                                  <span>&bull;</span>
                                  <span className="flex items-center gap-1">
                                    <MapPin size={11} className="text-gray-400" />
                                    {workerAddress}
                                  </span>
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 size={12} />
                                Selected
                              </span>
                              {a.distanceKm !== undefined && (
                                <p className="text-[11px] text-gray-500 mt-1">
                                  Distance: <strong className="text-gray-800">{a.distanceKm} km</strong>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Candidate Pool */}
              {activeTab === 'candidates' && (
                <div className="space-y-3">
                  {candidates.length === 0 ? (
                    <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500">
                      No expressions of interest recorded yet for this requirement.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                      {candidates.map((c) => {
                        const workerName = c.workerId?.name || 'Worker';
                        const isSelected = c.responseStatus === 'selected';

                        return (
                          <div key={c._id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-gray-50/50">
                            <div>
                              <p className="font-bold text-gray-900">{workerName}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Responded: {new Date(c.respondedAt).toLocaleDateString()} at{' '}
                                {new Date(c.respondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {c.distanceKm !== undefined && (
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  Calculated Distance: <span className="font-semibold text-gray-700">{c.distanceKm} km</span>
                                  {req?.maxDistanceKm && c.distanceKm > req.maxDistanceKm && (
                                    <span className="text-rose-600 font-semibold ml-1.5">
                                      (Exceeded {req.maxDistanceKm} km limit)
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                  <CheckCircle2 size={12} />
                                  Selected
                                </span>
                              ) : c.responseStatus === 'not_selected' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                                  <Sparkles size={11} className="text-rose-500" />
                                  Not Selected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                                  <Clock size={11} className="text-blue-500" />
                                  Pending Selection
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Extension History */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white text-xs">
                    {history.map((h, idx) => (
                      <div key={idx} className="p-3.5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            Extension #{history.length - idx}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {new Date(h.extendedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-gray-600 text-[11px]">
                          Extended to:{' '}
                          <strong className="text-emerald-700">
                            {new Date(h.newDeadline).toLocaleString()}
                          </strong>{' '}
                          &bull; Unfilled positions at time: <strong>{h.remainingCount}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
