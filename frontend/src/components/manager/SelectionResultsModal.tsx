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
  Cpu,
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
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="selection-results-title"
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-gray-200/90 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-linear-to-r from-purple-50/40 via-white to-gray-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles size={19} />
            </div>
            <div>
              <h2 id="selection-results-title" className="text-base font-extrabold text-gray-900 flex items-center gap-2 tracking-tight">
                Worker Selection Results & Staffing Status
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-md">
                {req?.workerType || 'Requirement'} &bull; Event: <span className="font-semibold text-gray-700">{eventTitle}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5 font-medium"
            >
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {isLoading ? (
            <div className="py-20 text-center text-gray-400 space-y-3">
              <Loader2 size={32} className="animate-spin mx-auto text-emerald-700" />
              <p className="text-xs font-bold text-gray-800">Loading staffing results...</p>
              <p className="text-[11px] text-gray-400">Fetching worker responses and AI candidate selections.</p>
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/80 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                    Required
                  </span>
                  <span className="text-2xl font-black text-gray-900">{req?.requiredCount}</span>
                </div>

                <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200/80 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                    Assigned
                  </span>
                  <span className="text-2xl font-black text-emerald-800">{filledCount}</span>
                </div>

                <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                    Remaining
                  </span>
                  <span className="text-2xl font-black text-amber-800">{pendingCount}</span>
                </div>

                <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200/80 text-center shadow-2xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block mb-1">
                    Max Distance
                  </span>
                  <span className="text-2xl font-black text-blue-800">
                    {req?.maxDistanceKm ? `${req.maxDistanceKm} km` : '—'}
                  </span>
                </div>
              </div>

              {/* Status and Round Badge Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gray-50/80 rounded-xl border border-gray-200/80 text-xs">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-gray-500 font-medium">Recruitment Status:</span>
                  <span className="font-bold px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800 uppercase text-[11px] shadow-2xs">
                    {req?.status}
                  </span>
                  <span className="text-gray-300">&bull;</span>
                  <span className="text-gray-500 font-medium">Selection Round:</span>
                  <span className="font-bold text-gray-900 px-2 py-0.5 bg-purple-50 rounded text-purple-700 border border-purple-200">
                    Round {req?.selectionRound || 1}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerSelection}
                    disabled={isTriggering}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-gray-100 active:scale-95 border border-gray-300 text-gray-800 font-bold rounded-lg shadow-2xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isTriggering ? 'animate-spin text-emerald-700' : ''} />
                    {isTriggering ? 'Running...' : 'Run Selection Now'}
                  </button>
                </div>
              </div>

              {/* AI Deterministic Selection Rule Hint */}
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl text-xs text-purple-900 flex items-start gap-2 shadow-2xs">
                <Cpu size={15} className="text-purple-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>AI Worker Selection (§5):</strong> Candidates who expressed interest are ranked strictly by <strong>distance to event location</strong> and <strong>verified performance score</strong>. The top candidates are confirmed without manual bias.
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('assigned')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === 'assigned'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Users size={14} className={activeTab === 'assigned' ? 'text-emerald-700' : 'text-gray-400'} />
                  Assigned Workers ({assigned.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('candidates')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                    activeTab === 'candidates'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Briefcase size={14} className={activeTab === 'candidates' ? 'text-emerald-700' : 'text-gray-400'} />
                  Interested Pool ({candidates.length})
                </button>

                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                      activeTab === 'history'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <History size={14} className={activeTab === 'history' ? 'text-emerald-700' : 'text-gray-400'} />
                    Extension History ({history.length})
                  </button>
                )}
              </div>

              {/* Tab 1: Assigned Workers */}
              {activeTab === 'assigned' && (
                <div className="space-y-3">
                  {assigned.length === 0 ? (
                    <div className="py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-xs text-gray-500 space-y-1">
                      <p className="font-semibold text-gray-700">No workers assigned yet</p>
                      <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                        Once the interest deadline closes, the AI selection engine assigns eligible candidates automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
                      {assigned.map((a, idx) => {
                        const workerObj = typeof a.workerId === 'object' ? a.workerId : null;
                        const workerName = workerObj?.name || 'Assigned Worker';
                        const workerPhone = workerObj?.phone || 'Phone not provided';
                        const workerAddress = workerObj?.location?.address || 'Location on file';

                        return (
                          <div key={idx} className="p-4 flex items-center justify-between gap-4 text-xs hover:bg-gray-50/70 transition-colors">
                            <div className="flex items-center gap-3.5">
                              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold flex items-center justify-center shrink-0 border border-emerald-200 shadow-2xs">
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

                            <div className="text-right shrink-0 space-y-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                                <CheckCircle2 size={12} className="text-emerald-600" />
                                Selected
                              </span>
                              {a.distanceKm !== undefined && (
                                <p className="text-[11px] text-gray-600 font-medium">
                                  Distance: <strong className="text-gray-900">{a.distanceKm} km</strong>
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
                    <div className="py-12 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 text-xs text-gray-500 space-y-1">
                      <p className="font-semibold text-gray-700">No candidate responses recorded</p>
                      <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                        Eligible workers in the workforce pool will appear here after marking this shift as Interested.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 border border-gray-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
                      {candidates.map((c) => {
                        const workerName = c.workerId?.name || 'Worker';
                        const isSelected = c.responseStatus === 'selected';

                        return (
                          <div key={c._id} className="p-4 flex items-center justify-between gap-4 text-xs hover:bg-gray-50/70 transition-colors">
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{workerName}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                Responded: {new Date(c.respondedAt).toLocaleDateString()} at{' '}
                                {new Date(c.respondedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {c.distanceKm !== undefined && (
                                <p className="text-[11px] text-gray-600 mt-1 font-medium">
                                  Calculated Distance: <span className="font-bold text-gray-900">{c.distanceKm} km</span>
                                  {req?.maxDistanceKm && c.distanceKm > req.maxDistanceKm && (
                                    <span className="text-rose-600 font-bold ml-1.5">
                                      (Exceeded {req.maxDistanceKm} km limit)
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 shadow-2xs">
                                  <CheckCircle2 size={12} className="text-emerald-600" />
                                  Selected
                                </span>
                              ) : c.responseStatus === 'not_selected' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 shadow-2xs">
                                  <Sparkles size={11} className="text-rose-500" />
                                  Not Selected
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 shadow-2xs">
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
                  <div className="divide-y divide-gray-100 border border-gray-200/90 rounded-2xl overflow-hidden bg-white text-xs shadow-2xs">
                    {history.map((h, idx) => (
                      <div key={idx} className="p-4 space-y-1 hover:bg-gray-50/70 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900 text-sm">
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
                          &bull; Unfilled positions at time: <strong className="text-gray-900">{h.remainingCount}</strong>
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
        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100 bg-gray-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-xs font-semibold rounded-xl transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
