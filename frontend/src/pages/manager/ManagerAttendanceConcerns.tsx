import React, { useState, useEffect } from 'react';
import { attendanceApi } from '../../features/attendance/attendanceApi';
import type { AttendanceConcern } from '../../features/attendance/attendance.types';
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCw,
  MessageSquare,
  AlertCircle,
  Send,
  Lock,
  X,
  Check,
} from 'lucide-react';

export const ManagerAttendanceConcerns: React.FC = () => {
  const [concerns, setConcerns] = useState<AttendanceConcern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open');

  // Review & Conversation Modal
  const [selectedConcern, setSelectedConcern] = useState<AttendanceConcern | null>(null);

  // Manager Reply
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Resolution Mode: null | 'accept' | 'reject'
  const [resolveAction, setResolveAction] = useState<'accept' | 'reject' | null>(null);
  const [resultingStatus, setResultingStatus] = useState<'on_time' | 'late' | 'absent'>('on_time');
  const [actualArrivalTime, setActualArrivalTime] = useState('08:00');
  const [resolutionExplanation, setResolutionExplanation] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const loadConcerns = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await attendanceApi.getConcerns(
        statusFilter === 'all' ? undefined : { status: statusFilter }
      );
      setConcerns(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load concerns');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConcerns();
  }, [statusFilter]);

  const handleOpenConcern = async (concernId: string) => {
    setResolveAction(null);
    setResolutionExplanation('');
    setResolutionError(null);
    try {
      const detail = await attendanceApi.getConcernById(concernId);
      setSelectedConcern(detail);
      // Preset sensible default resulting status
      setResultingStatus('on_time');
      setActualArrivalTime(
        (detail.attendanceId as any)?.reportingTimeSnapshot || '08:00'
      );
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to load concern details');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConcern || !replyText.trim()) return;

    setIsSendingReply(true);
    try {
      const updated = await attendanceApi.addConcernMessage(
        selectedConcern._id,
        replyText.trim()
      );
      setSelectedConcern(updated);
      setReplyText('');
      await loadConcerns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleConfirmResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConcern || !resolveAction) return;

    if (!resolutionExplanation.trim() || resolutionExplanation.trim().length < 5) {
      setResolutionError('Resolution explanation is mandatory (minimum 5 characters)');
      return;
    }

    setIsResolving(true);
    setResolutionError(null);
    try {
      const resolved = await attendanceApi.resolveConcern(selectedConcern._id, {
        action: resolveAction,
        resolutionExplanation: resolutionExplanation.trim(),
        resultingArrivalStatus: resolveAction === 'accept' ? resultingStatus : undefined,
        resultingActualArrivalTime:
          resolveAction === 'accept' && resultingStatus === 'late'
            ? actualArrivalTime.trim()
            : undefined,
      });

      setSelectedConcern(resolved);
      setResolveAction(null);
      await loadConcerns();
    } catch (err: any) {
      setResolutionError(err?.response?.data?.message || err?.message || 'Failed to resolve concern');
    } finally {
      setIsResolving(false);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="text-emerald-700" size={24} />
            Worker Attendance Concerns
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Review worker disputes regarding Late and Absent attendance marks, message workers, and record formal resolution decisions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Status Filter Tabs */}
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setStatusFilter('open')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'open'
                  ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('closed')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'closed'
                  ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Closed
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All
            </button>
          </div>

          <button
            type="button"
            onClick={loadConcerns}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
          >
            <RotateCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Concerns Table / List */}
      <div className="space-y-3">
        {isLoading && concerns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            <RotateCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
            Loading attendance concerns...
          </div>
        ) : concerns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 text-sm">
            No {statusFilter === 'all' ? '' : statusFilter} attendance concerns found.
          </div>
        ) : (
          concerns.map((c) => {
            const worker = c.workerId as any;
            const event = c.eventId as any;
            const att = c.attendanceId as any;
            const isOpen = c.status === 'open';

            return (
              <div
                key={c._id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-gray-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{worker?.name || 'Worker'}</span>
                    <span className="text-xs text-gray-500 font-mono">({worker?.businessId || worker?.workerType || 'Staff'})</span>
                    <span className="text-[11px] text-gray-400">•</span>
                    <span className="text-xs font-semibold text-emerald-900">{event?.title || 'Event'}</span>

                    {isOpen ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock size={10} />
                        OPEN
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          c.resolutionOutcome === 'accepted'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {c.resolutionOutcome === 'accepted' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                        {c.resolutionOutcome?.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic">
                    "{c.explanation}"
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
                    <span>Submitted: <strong>{formatDateTime(c.createdAt)}</strong></span>
                    <span>Dispute Type: <strong className="capitalize">{c.concernCategory.replace('_', ' ')}</strong></span>
                    <span>
                      Recorded Status:{' '}
                      <strong className="uppercase font-bold text-gray-700">
                        {att?.arrivalStatus || 'N/A'}
                      </strong>
                    </span>
                    <span>Messages: <strong>{c.messages?.length || 1}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 md:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenConcern(c._id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                  >
                    <MessageSquare size={13} />
                    <span>{isOpen ? 'Review & Resolve' : 'View Decision'}</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Review & Resolution Modal */}
      {selectedConcern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-100 space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="text-emerald-700" size={18} />
                  Concern Review — {(selectedConcern.workerId as any)?.name}
                </h3>
                <p className="text-xs text-gray-500">
                  {(selectedConcern.eventId as any)?.title} • Category:{' '}
                  <span className="font-semibold">{selectedConcern.concernCategory}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConcern(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Closed Notice */}
            {selectedConcern.status === 'closed' && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-1 shrink-0 ${
                  selectedConcern.resolutionOutcome === 'accepted'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {selectedConcern.resolutionOutcome === 'accepted' ? (
                    <CheckCircle2 size={16} className="text-emerald-700" />
                  ) : (
                    <XCircle size={16} className="text-rose-700" />
                  )}
                  Concern Decision: {selectedConcern.resolutionOutcome?.toUpperCase()}
                </div>
                <p>{selectedConcern.resolutionExplanation}</p>
                <p className="text-[10px] text-gray-500 pt-1">
                  Closed on {formatDateTime(selectedConcern.closedAt)}. The attendance record is permanently locked against further adjustments.
                </p>
              </div>
            )}

            {/* Conversation Log */}
            <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200 min-h-[160px]">
              {selectedConcern.messages.map((msg, idx) => {
                const isManager = msg.senderRole === 'event_manager' || msg.senderRole === 'admin';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isManager ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5">
                      <span>{isManager ? 'You (Event Manager)' : 'Worker'}</span>
                      <span>•</span>
                      <span>{formatDateTime(msg.sentAt)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2 text-xs rounded-2xl ${
                        isManager
                          ? 'bg-emerald-700 text-white rounded-br-xs'
                          : 'bg-white text-gray-900 border border-gray-200 rounded-bl-xs shadow-2xs'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input (if Open) */}
            {selectedConcern.status === 'open' && (
              <form onSubmit={handleSendReply} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Ask worker for details or clarify gate logs..."
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyText.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 rounded-xl shadow-xs shrink-0"
                >
                  {isSendingReply ? <RotateCw size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
            )}

            {/* Resolution Actions / Form */}
            {selectedConcern.status === 'open' && (
              <div className="border-t pt-3 space-y-3 shrink-0">
                {resolutionError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                    {resolutionError}
                  </div>
                )}

                {resolveAction === null ? (
                  <div className="flex items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-gray-900">Make Final Decision</span>
                      <p className="text-[11px] text-gray-500">
                        Resolving permanently locks this worker's attendance record.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResolveAction('accept');
                          setResolutionError(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs"
                      >
                        <Check size={14} />
                        Accept Concern
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResolveAction('reject');
                          setResolutionError(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl shadow-xs"
                      >
                        <X size={14} />
                        Reject Concern
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleConfirmResolve} className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <Lock size={12} className="text-emerald-700" />
                        Confirming Decision:{' '}
                        <strong className={resolveAction === 'accept' ? 'text-emerald-800' : 'text-rose-800'}>
                          {resolveAction.toUpperCase()}
                        </strong>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setResolveAction(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>

                    {resolveAction === 'accept' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Resulting Attendance Status
                          </label>
                          <select
                            value={resultingStatus}
                            onChange={(e) => setResultingStatus(e.target.value as any)}
                            className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-xl bg-white"
                          >
                            <option value="on_time">Present / On Time</option>
                            <option value="late">Late (Correct Arrival Time)</option>
                            <option value="absent">Absent</option>
                          </select>
                        </div>

                        {resultingStatus === 'late' && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Actual Arrival Time
                            </label>
                            <input
                              type="text"
                              value={actualArrivalTime}
                              onChange={(e) => setActualArrivalTime(e.target.value)}
                              placeholder="e.g. 08:15 or 08:15 AM"
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-xl bg-white"
                              required
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Mandatory Resolution Explanation <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={resolutionExplanation}
                        onChange={(e) => setResolutionExplanation(e.target.value)}
                        placeholder="Provide reason for accepting/rejecting this concern..."
                        className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-xl bg-white"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setResolveAction(null)}
                        disabled={isResolving}
                        className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isResolving}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white rounded-xl shadow-xs ${
                          resolveAction === 'accept'
                            ? 'bg-emerald-700 hover:bg-emerald-800'
                            : 'bg-rose-700 hover:bg-rose-800'
                        }`}
                      >
                        {isResolving && <RotateCw size={13} className="animate-spin" />}
                        <span>Confirm & Lock Decision</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
