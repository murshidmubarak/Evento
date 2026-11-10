import React, { useState, useEffect } from 'react';
import {
  attendanceApi,
} from '../../features/attendance/attendanceApi';
import type {
  WorkerAttendanceRecordWithConcern,
  AttendanceConcern,
  ConcernCategory,
} from '../../features/attendance/attendance.types';
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Send,
  RotateCw,
  MessageSquare,
  ChevronRight,
  ShieldAlert,
  Calendar,
  MapPin,
  X,
} from 'lucide-react';

export const WorkerAttendanceConcerns: React.FC = () => {
  const [records, setRecords] = useState<WorkerAttendanceRecordWithConcern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Thread State
  const [selectedRecordForConcern, setSelectedRecordForConcern] =
    useState<WorkerAttendanceRecordWithConcern | null>(null);
  const [activeConcernDetail, setActiveConcernDetail] = useState<AttendanceConcern | null>(null);
  const [isThreadLoading, setIsThreadLoading] = useState(false);

  // Form State
  const [concernCategory, setConcernCategory] = useState<ConcernCategory>('late_dispute');
  const [explanation, setExplanation] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reply State
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const loadRecords = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await attendanceApi.getWorkerAttendanceRecords();
      setRecords(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load attendance records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleOpenRaiseModal = (rec: WorkerAttendanceRecordWithConcern) => {
    setSelectedRecordForConcern(rec);
    setConcernCategory(rec.arrivalStatus === 'late' ? 'late_dispute' : 'absent_dispute');
    setExplanation('');
    setAdditionalDetails('');
    setSubmitError(null);
  };

  const handleSubmitConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecordForConcern) return;

    if (!explanation.trim() || explanation.trim().length < 5) {
      setSubmitError('Please provide a detailed explanation of at least 5 characters');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await attendanceApi.submitConcern({
        attendanceId: selectedRecordForConcern.attendanceId,
        concernCategory,
        explanation: explanation.trim(),
        additionalDetails: additionalDetails.trim() || undefined,
      });

      setSelectedRecordForConcern(null);
      await loadRecords();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || err?.message || 'Failed to submit concern');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenThread = async (concernId: string) => {
    setIsThreadLoading(true);
    try {
      const concern = await attendanceApi.getConcernById(concernId);
      setActiveConcernDetail(concern);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to load concern details');
    } finally {
      setIsThreadLoading(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConcernDetail || !replyMessage.trim()) return;

    setIsSendingReply(true);
    try {
      const updated = await attendanceApi.addConcernMessage(
        activeConcernDetail._id,
        replyMessage.trim()
      );
      setActiveConcernDetail(updated);
      setReplyMessage('');
      await loadRecords();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSendingReply(false);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
            <ShieldAlert className="text-emerald-700" size={24} />
            Attendance Concerns
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Review your shift attendance and dispute any Late or Absent markings within 24 hours of event end.
          </p>
        </div>
        <button
          type="button"
          onClick={loadRecords}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors self-start sm:self-auto"
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Roster & Concerns List */}
      <div className="space-y-4">
        {isLoading && records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            <RotateCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
            Loading your attendance records...
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 text-sm">
            No completed shifts or attendance records found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {records.map((rec) => {
              const isLate = rec.arrivalStatus === 'late';
              const isAbsent = rec.arrivalStatus === 'absent' || rec.status === 'absent';
              const isOnTime = rec.arrivalStatus === 'on_time';

              return (
                <div
                  key={rec.attendanceId}
                  className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-xs hover:border-gray-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{rec.eventTitle}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {rec.eventType}
                      </span>
                      {rec.isStatusLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                          <Lock size={10} />
                          Locked
                        </span>
                      )}
                      {rec.hasOpenConcern && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock size={10} />
                          Concern Under Review
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} />
                        {formatDateTime(rec.eventDate)}
                      </span>
                      {rec.eventLocation?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin size={13} />
                          {rec.eventLocation.address}
                        </span>
                      )}
                      <span>Role: <strong className="text-gray-700">{rec.workerType}</strong></span>
                      <span>Reporting: <strong className="text-gray-700">{rec.reportingTime}</strong></span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs font-semibold text-gray-600">Attendance:</span>
                      {isOnTime && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          <CheckCircle2 size={13} />
                          On Time / Present
                        </span>
                      )}
                      {isLate && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          <Clock size={13} />
                          Late ({rec.delayMinutes}m delay)
                        </span>
                      )}
                      {isAbsent && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                          <XCircle size={13} />
                          Absent
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions & Eligibility */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 md:self-center shrink-0">
                    {rec.canRaiseConcern && (
                      <button
                        type="button"
                        onClick={() => handleOpenRaiseModal(rec)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-colors"
                      >
                        <AlertCircle size={13} />
                        <span>Raise Concern</span>
                      </button>
                    )}

                    {rec.concern && (
                      <button
                        type="button"
                        onClick={() => handleOpenThread(rec.concern!.concernId)}
                        disabled={isThreadLoading}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                      >
                        <MessageSquare size={13} />
                        <span>
                          {rec.concern.status === 'open' ? 'View Conversation' : 'View Resolution'}
                        </span>
                        <ChevronRight size={13} />
                      </button>
                    )}

                    {!rec.canRaiseConcern && !rec.concern && (
                      <span className="text-[11px] text-gray-400 italic">
                        {rec.eligibilityReason === 'status_on_time'
                          ? 'On-time record (No concern required)'
                          : rec.eligibilityReason === 'event_not_ended'
                          ? 'Event in progress (Concern opens at conclusion)'
                          : rec.eligibilityReason === 'deadline_expired'
                          ? '24-hour dispute window has closed'
                          : rec.eligibilityReason === 'permanently_locked'
                          ? 'Attendance status permanently locked'
                          : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Raise Concern Form */}
      {selectedRecordForConcern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShieldAlert className="text-emerald-700" size={18} />
                Raise Attendance Concern
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRecordForConcern(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200/80 text-xs text-emerald-950 space-y-1">
              <p>
                <strong>Event:</strong> {selectedRecordForConcern.eventTitle}
              </p>
              <p>
                <strong>Current Status:</strong>{' '}
                <span className="uppercase font-bold">{selectedRecordForConcern.arrivalStatus}</span>
              </p>
              <p className="text-[11px] text-emerald-800 pt-0.5">
                Deadline: Concerns must be submitted within 24 hours of event conclusion. Exactly one concern thread is permitted per shift.
              </p>
            </div>

            {submitError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmitConcern} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Concern Category
                </label>
                <select
                  value={concernCategory}
                  onChange={(e) => setConcernCategory(e.target.value as ConcernCategory)}
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="late_dispute">Dispute Late Arrival (I was On Time)</option>
                  <option value="absent_dispute">Dispute Absence (I was Present)</option>
                  <option value="time_recording_error">Time Recording / Scanner Error</option>
                  <option value="technical_issue">Security / Gate Clearance Delay</option>
                  <option value="other">Other Circumstance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Explanation <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain why this attendance marking is inaccurate..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Additional Details / Badge ID (Optional)
                </label>
                <input
                  type="text"
                  value={additionalDetails}
                  onChange={(e) => setAdditionalDetails(e.target.value)}
                  placeholder="e.g. badge number, security gate, lead worker on duty"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecordForConcern(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 rounded-xl shadow-xs"
                >
                  {isSubmitting ? <RotateCw size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>Submit Concern</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Thread Drawer: Conversation Details */}
      {activeConcernDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-100 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="text-emerald-700" size={18} />
                  Concern Discussion
                </h3>
                <span className="text-[11px] text-gray-500">
                  Status:{' '}
                  <strong className={activeConcernDetail.status === 'open' ? 'text-amber-700' : 'text-slate-700'}>
                    {activeConcernDetail.status.toUpperCase()}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveConcernDetail(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resolution Notice if Closed */}
            {activeConcernDetail.status === 'closed' && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-1 shrink-0 ${
                  activeConcernDetail.resolutionOutcome === 'accepted'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  {activeConcernDetail.resolutionOutcome === 'accepted' ? (
                    <CheckCircle2 size={16} className="text-emerald-700" />
                  ) : (
                    <XCircle size={16} className="text-rose-700" />
                  )}
                  Concern {activeConcernDetail.resolutionOutcome?.toUpperCase()}
                </div>
                <p className="text-[11px]">{activeConcernDetail.resolutionExplanation}</p>
                <p className="text-[10px] text-gray-500 pt-1">
                  Closed on {formatDateTime(activeConcernDetail.closedAt)}. Attendance status is permanently locked.
                </p>
              </div>
            )}

            {/* Messages Thread */}
            <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
              {activeConcernDetail.messages.map((msg, idx) => {
                const isWorker = msg.senderRole === 'worker';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isWorker ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-0.5">
                      <span>{isWorker ? 'You (Worker)' : 'Event Manager'}</span>
                      <span>•</span>
                      <span>{formatDateTime(msg.sentAt)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] px-3.5 py-2 text-xs rounded-2xl ${
                        isWorker
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
            {activeConcernDetail.status === 'open' ? (
              <form onSubmit={handleSendReply} className="flex gap-2 pt-2 shrink-0">
                <input
                  type="text"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type a response to your manager..."
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                />
                <button
                  type="submit"
                  disabled={isSendingReply || !replyMessage.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 rounded-xl shadow-xs shrink-0"
                >
                  {isSendingReply ? <RotateCw size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
            ) : (
              <div className="text-center text-[11px] text-gray-400 py-1 shrink-0">
                This concern is resolved and closed. No further messages can be submitted.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

