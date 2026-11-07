import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  attendanceApi,
  parseTimeToMinutes,
} from '../../../features/attendance/attendanceApi';
import type {
  AttendanceSession,
  AttendanceRosterResponse,
  FinalizeCheckInPayload,
  LateExceptionInput,
  FinalizeCheckOutPayload,
  CategoryFinishTimeInput,
  IndividualCheckInPayload,
  RequirementFinishOverrideInput,
  EarlyDepartureExceptionInput,
  OvertimeExceptionInput,
  AttendanceRosterItem,
  CorrectAttendancePayload,
  VerifyAttendancePayload,
} from '../../../features/attendance/attendance.types';
import {
  AttendanceTimingBanner,
} from './AttendanceTimingBanner';
import {
  AttendanceSummaryCards,
} from './AttendanceSummaryCards';
import {
  AttendanceRosterTable,
  type WorkerExceptionState,
} from './AttendanceRosterTable';
import {
  ReviewCheckinModal,
} from './ReviewCheckinModal';
import {
  CheckoutFinishingTimeCard,
} from './CheckoutFinishingTimeCard';
import {
  CheckoutRosterTable,
  type WorkerCheckOutExceptionState,
} from './CheckoutRosterTable';
import {
  ReviewCheckoutModal,
} from './ReviewCheckoutModal';
import {
  FinalizedAttendanceView,
} from './FinalizedAttendanceView';
import {
  CorrectionModal,
} from './CorrectionModal';
import {
  VerificationModal,
} from './VerificationModal';
import {
  Loader2,
  AlertCircle,
  RotateCw,
  CheckCircle2,
  ShieldCheck,
  Undo2,
  Clock,
  ChevronRight,
  History,
} from 'lucide-react';

interface EventAttendanceWorkspaceProps {
  eventId: string;
  eventTitle: string;
  eventDate?: string | Date;
  eventStatus: string;
}

export const EventAttendanceWorkspace: React.FC<EventAttendanceWorkspaceProps> = ({
  eventId,
  eventTitle: _eventTitle,
  eventDate: _eventDate,
  eventStatus,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [rosterData, setRosterData] = useState<AttendanceRosterResponse | null>(null);

  // ---------------------------------------------------------
  // Check-in Exception State
  // ---------------------------------------------------------
  const [checkInExceptions, setCheckInExceptions] = useState<Record<string, WorkerExceptionState>>({});
  const [isCheckInReviewOpen, setIsCheckInReviewOpen] = useState(false);
  const [checkInIdempotencyKey, setCheckInIdempotencyKey] = useState<string>('');
  const [checkInPayloadHash, setCheckInPayloadHash] = useState<string>('');

  // ---------------------------------------------------------
  // Checkout State
  // ---------------------------------------------------------
  const [defaultFinishTime, setDefaultFinishTime] = useState<string>('');
  const [categoryFinishTimes, setCategoryFinishTimes] = useState<Record<string, string>>({});
  const [requirementOverrides, setRequirementOverrides] = useState<Record<string, string>>({});
  const [checkoutExceptions, setCheckoutExceptions] = useState<Record<string, WorkerCheckOutExceptionState>>({});
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>('');
  const [checkoutPayloadHash, setCheckoutPayloadHash] = useState<string>('');

  // When checkout is active, manager can toggle to view finalized check-in records
  const [activeStageTab, setActiveStageTab] = useState<'checkout_form' | 'checkin_history'>('checkout_form');

  // ---------------------------------------------------------
  // Phase 4.5: Correction & Verification State
  // ---------------------------------------------------------
  const [correctionWorker, setCorrectionWorker] = useState<AttendanceRosterItem | null>(null);
  const [verificationAction, setVerificationAction] = useState<'approve' | 'reject' | null>(null);

  const loadAttendanceData = useCallback(async (isRefresh = false) => {
    if (!eventId) return;
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorStatus(null);
      setErrorMessage(null);

      const [sess, rost] = await Promise.all([
        attendanceApi.getSession(eventId),
        attendanceApi.getRoster(eventId),
      ]);

      setSession(sess);
      setRosterData(rost);

      const activeSession = sess || rost.session;

      // Populate default finish time, category finish times, and overrides if session already has them
      if (activeSession?.actualNormalFinishTime) {
        setDefaultFinishTime((prev) => prev || activeSession.actualNormalFinishTime!);
      }
      if (activeSession?.categoryFinishTimes && activeSession.categoryFinishTimes.length > 0) {
        const catMap: Record<string, string> = {};
        activeSession.categoryFinishTimes.forEach((c) => {
          catMap[c.workerType] = c.normalFinishTime;
        });
        setCategoryFinishTimes((prev) => (Object.keys(prev).length === 0 ? catMap : prev));
      }
      if (activeSession?.requirementFinishOverrides && activeSession.requirementFinishOverrides.length > 0) {
        const ovMap: Record<string, string> = {};
        activeSession.requirementFinishOverrides.forEach((o) => {
          ovMap[o.requirementId] = o.normalFinishTime;
        });
        setRequirementOverrides((prev) => (Object.keys(prev).length === 0 ? ovMap : prev));
      }

      // Initialize check-in exceptions from roster data for workers with saved records
      if (rost?.roster && rost.roster.length > 0) {
        setCheckInExceptions((prev) => {
          const updated: Record<string, WorkerExceptionState> = { ...prev };
          rost.roster.forEach((w) => {
            const hasSavedRecord = Boolean(w.attendanceId || w.status === 'checked_in' || w.status === 'absent');
            const localExc = prev[w.workerId];

            if (!localExc || hasSavedRecord) {
              if (w.arrivalStatus === 'late' || (w.status === 'late' && w.arrivalStatus !== 'on_time')) {
                let arrTime = '';
                if (w.checkIn) {
                  try {
                    arrTime = new Date(w.checkIn).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    });
                  } catch {
                    arrTime = '';
                  }
                }
                if (!localExc || localExc.type === 'late' || !localExc.actualArrivalTime) {
                  updated[w.workerId] = {
                    type: 'late',
                    actualArrivalTime: arrTime || localExc?.actualArrivalTime || '',
                    delayMinutes: w.delayMinutes ?? localExc?.delayMinutes ?? 0,
                  };
                }
              } else if (w.arrivalStatus === 'absent' || w.status === 'absent') {
                if (!localExc || localExc.type === 'absent') {
                  updated[w.workerId] = {
                    type: 'absent',
                  };
                }
              } else if (w.arrivalStatus === 'on_time' || w.status === 'checked_in') {
                if (!localExc || localExc.type === 'present') {
                  updated[w.workerId] = {
                    type: 'present',
                  };
                }
              }
            }
          });
          return updated;
        });
      }
    } catch (err: any) {
      const status = err.response?.status || 500;
      setErrorStatus(status);
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to load attendance session or worker roster. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadAttendanceData();
  }, [loadAttendanceData]);

  // ---------------------------------------------------------
  // Check-in Handlers & Calculations
  // ---------------------------------------------------------
  const handleCheckInExceptionChange = (workerId: string, state: WorkerExceptionState) => {
    setCheckInExceptions((prev) => ({
      ...prev,
      [workerId]: state,
    }));
  };

  const handleResetCheckInExceptions = () => {
    setCheckInExceptions({});
    setSuccessNotice('Exceptions reset. All workers restored to default On Time.');
  };

  const handleSaveWorkerCheckIn = async (workerId: string, payload: IndividualCheckInPayload) => {
    try {
      await attendanceApi.recordWorkerCheckIn(eventId, workerId, payload);
      const worker = rosterData?.roster.find((w) => w.workerId === workerId);
      const name = worker ? worker.workerName : 'Worker';
      setSuccessNotice(
        payload.arrivalStatus === 'absent'
          ? `${name} check-in successfully confirmed and saved as Absent.`
          : payload.arrivalStatus === 'late'
            ? `${name} check-in successfully confirmed and saved as Late (${payload.actualArrivalTime}).`
            : `${name} check-in successfully confirmed and saved as Present / On Time.`
      );
      await loadAttendanceData(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save individual check-in.';
      throw new Error(msg);
    }
  };

  const checkInLiveCounts = useMemo(() => {
    const roster = rosterData?.roster || [];
    let present = 0;
    let late = 0;
    let absent = 0;
    let hasValidationError = false;

    roster.forEach((r) => {
      const exc = checkInExceptions[r.workerId];
      if (!exc || exc.type === 'present') {
        present++;
      } else if (exc.type === 'late') {
        late++;
        if (exc.error || !exc.actualArrivalTime) {
          hasValidationError = true;
        }
      } else if (exc.type === 'absent') {
        absent++;
      }
    });

    return { present, late, absent, hasValidationError };
  }, [rosterData, checkInExceptions]);

  const currentCheckInPayload = useMemo((): FinalizeCheckInPayload => {
    const lateExceptions: LateExceptionInput[] = [];
    const absentExceptions: string[] = [];

    const roster = rosterData?.roster || [];
    roster.forEach((r) => {
      const exc = checkInExceptions[r.workerId];
      if (exc?.type === 'late' && exc.actualArrivalTime && !exc.error) {
        lateExceptions.push({
          workerId: r.workerId,
          actualArrivalTime: exc.actualArrivalTime.trim(),
        });
      } else if (exc?.type === 'absent') {
        absentExceptions.push(r.workerId);
      }
    });

    return {
      lateExceptions: lateExceptions.length > 0 ? lateExceptions : undefined,
      absentExceptions: absentExceptions.length > 0 ? absentExceptions : undefined,
    };
  }, [rosterData, checkInExceptions]);

  const computedCheckInHash = useMemo(() => {
    return JSON.stringify({
      late: (currentCheckInPayload.lateExceptions || []).sort(
        (a: LateExceptionInput, b: LateExceptionInput) => a.workerId.localeCompare(b.workerId)
      ),
      absent: (currentCheckInPayload.absentExceptions || []).sort(),
    });
  }, [currentCheckInPayload]);

  const handleOpenCheckInReview = () => {
    if (checkInLiveCounts.hasValidationError) return;
    if (!checkInIdempotencyKey || computedCheckInHash !== checkInPayloadHash) {
      const newKey = `chk_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setCheckInIdempotencyKey(newKey);
      setCheckInPayloadHash(computedCheckInHash);
    }
    setIsCheckInReviewOpen(true);
  };

  const handleRegenerateCheckInKey = () => {
    const newKey = `chk_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCheckInIdempotencyKey(newKey);
  };

  const handleConfirmFinalizeCheckIn = async (keyToUse: string) => {
    try {
      await attendanceApi.finalizeCheckIn(eventId, currentCheckInPayload, keyToUse);
      setIsCheckInReviewOpen(false);
      setSuccessNotice('Check-in has been successfully finalized! You may now manage checkout when shifts conclude.');
      await loadAttendanceData(true);
    } catch (err: any) {
      if (err.response?.status === 409) {
        const latestSession = await attendanceApi.getSession(eventId);
        if (latestSession.checkInFinalized) {
          setIsCheckInReviewOpen(false);
          await loadAttendanceData(true);
          setSuccessNotice('Check-in has already been finalized.');
          return;
        }
        // True conflict: re-throw to allow modal to display error while preserving exceptions
        throw err;
      }
      throw err;
    }
  };

  // ---------------------------------------------------------
  // Checkout Handlers & Calculations
  // ---------------------------------------------------------
  const handleCheckoutExceptionChange = (workerId: string, state: WorkerCheckOutExceptionState) => {
    setCheckoutExceptions((prev) => ({
      ...prev,
      [workerId]: state,
    }));
  };

  const handleResetCheckoutExceptions = () => {
    setCheckoutExceptions({});
  };

  const defaultFinishTimeError = useMemo(() => {
    if (!defaultFinishTime.trim()) return undefined;
    if (parseTimeToMinutes(defaultFinishTime) === null) {
      return 'Please enter a valid time (e.g. 17:00, 05:00 PM, or 20:30)';
    }
    return undefined;
  }, [defaultFinishTime]);

  const categoryErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    Object.entries(categoryFinishTimes).forEach(([cat, timeStr]) => {
      if (timeStr && parseTimeToMinutes(timeStr) === null) {
        errs[cat] = 'Invalid time format (e.g. 23:00 or 11:00 PM)';
      }
    });
    return errs;
  }, [categoryFinishTimes]);

  const hasCategoryErrors = Object.keys(categoryErrors).length > 0;

  const isFinishingTimeConfigured = useMemo(() => {
    const hasValidDefault = Boolean(defaultFinishTime.trim() && parseTimeToMinutes(defaultFinishTime) !== null);
    if (hasValidDefault) return true;

    // If no valid default finish time, verify that every distinct category present in the roster has a valid finish time
    const distinctWorkerTypes = new Set((rosterData?.roster || []).map((r) => r.workerType));
    if (distinctWorkerTypes.size === 0) {
      return Object.values(categoryFinishTimes).some((t) => t && t.trim() && parseTimeToMinutes(t) !== null);
    }

    for (const type of distinctWorkerTypes) {
      const catTime = categoryFinishTimes[type];
      if (!catTime || !catTime.trim() || parseTimeToMinutes(catTime) === null) {
        return false;
      }
    }
    return true;
  }, [defaultFinishTime, categoryFinishTimes, rosterData]);

  const checkoutLiveCounts = useMemo(() => {
    const roster = rosterData?.roster || [];
    let normal = 0;
    let early = 0;
    let overtime = 0;
    let absent = 0;
    let hasValidationError = false;

    roster.forEach((r) => {
      const isAbsent = r.arrivalStatus === 'absent' || r.status === 'absent';
      if (isAbsent) {
        absent++;
        return;
      }

      const exc = checkoutExceptions[r.workerId];
      if (!exc || exc.type === 'normal') {
        normal++;
      } else if (exc.type === 'early') {
        early++;
        if (exc.error || !exc.actualCheckoutTime || parseTimeToMinutes(exc.actualCheckoutTime) === null) {
          hasValidationError = true;
        }
      } else if (exc.type === 'overtime') {
        overtime++;
        if (exc.error || !exc.actualCheckoutTime || parseTimeToMinutes(exc.actualCheckoutTime) === null) {
          hasValidationError = true;
        }
      }
    });

    return { normal, early, overtime, absent, hasValidationError };
  }, [rosterData, checkoutExceptions]);

  const currentCheckoutPayload = useMemo((): FinalizeCheckOutPayload => {
    const overridesList: RequirementFinishOverrideInput[] = Object.entries(requirementOverrides)
      .filter(([_, time]) => time && time.trim())
      .map(([requirementId, normalFinishTime]) => ({ requirementId, normalFinishTime: normalFinishTime.trim() }));

    const categoriesList: CategoryFinishTimeInput[] = Object.entries(categoryFinishTimes)
      .filter(([_, time]) => time && time.trim())
      .map(([workerType, normalFinishTime]) => ({ workerType, normalFinishTime: normalFinishTime.trim() }));

    const earlyExceptions: EarlyDepartureExceptionInput[] = [];
    const overtimeExceptions: OvertimeExceptionInput[] = [];

    const roster = rosterData?.roster || [];
    roster.forEach((r) => {
      const isAbsent = r.arrivalStatus === 'absent' || r.status === 'absent';
      if (isAbsent) return;

      const exc = checkoutExceptions[r.workerId];
      if (exc?.type === 'early' && exc.actualCheckoutTime && !exc.error) {
        earlyExceptions.push({
          workerId: r.workerId,
          actualCheckoutTime: exc.actualCheckoutTime.trim(),
        });
      } else if (exc?.type === 'overtime' && exc.actualCheckoutTime && !exc.error) {
        overtimeExceptions.push({
          workerId: r.workerId,
          actualCheckoutTime: exc.actualCheckoutTime.trim(),
        });
      }
    });

    return {
      actualNormalFinishTime: defaultFinishTime.trim() || undefined,
      categoryFinishTimes: categoriesList.length > 0 ? categoriesList : undefined,
      requirementFinishOverrides: overridesList.length > 0 ? overridesList : undefined,
      earlyDepartureExceptions: earlyExceptions.length > 0 ? earlyExceptions : undefined,
      overtimeExceptions: overtimeExceptions.length > 0 ? overtimeExceptions : undefined,
    };
  }, [defaultFinishTime, categoryFinishTimes, requirementOverrides, checkoutExceptions, rosterData]);

  const computedCheckoutHash = useMemo(() => {
    return JSON.stringify({
      finish: currentCheckoutPayload.actualNormalFinishTime,
      categories: (currentCheckoutPayload.categoryFinishTimes || []).sort((a, b) =>
        a.workerType.localeCompare(b.workerType)
      ),
      overrides: (currentCheckoutPayload.requirementFinishOverrides || []).sort((a, b) =>
        a.requirementId.localeCompare(b.requirementId)
      ),
      early: (currentCheckoutPayload.earlyDepartureExceptions || []).sort((a, b) =>
        a.workerId.localeCompare(b.workerId)
      ),
      overtime: (currentCheckoutPayload.overtimeExceptions || []).sort((a, b) =>
        a.workerId.localeCompare(b.workerId)
      ),
    });
  }, [currentCheckoutPayload]);

  const handleOpenCheckoutReview = () => {
    if (!isFinishingTimeConfigured || hasCategoryErrors || checkoutLiveCounts.hasValidationError) return;
    if (!checkoutIdempotencyKey || computedCheckoutHash !== checkoutPayloadHash) {
      const newKey = `chkout_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setCheckoutIdempotencyKey(newKey);
      setCheckoutPayloadHash(computedCheckoutHash);
    }
    setIsCheckoutReviewOpen(true);
  };

  const handleRegenerateCheckoutKey = () => {
    const newKey = `chkout_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCheckoutIdempotencyKey(newKey);
    setCheckoutPayloadHash(computedCheckoutHash);
  };

  const handleConfirmFinalizeCheckout = async (keyToUse: string) => {
    try {
      await attendanceApi.finalizeCheckOut(eventId, currentCheckoutPayload, keyToUse);
      setIsCheckoutReviewOpen(false);
      setSuccessNotice('Checkout has been successfully finalized! Complete attendance records are now saved.');
      await loadAttendanceData(true);
    } catch (err: any) {
      if (err.response?.status === 409) {
        const latestSession = await attendanceApi.getSession(eventId);
        if (latestSession.checkOutFinalized) {
          setIsCheckoutReviewOpen(false);
          await loadAttendanceData(true);
          setSuccessNotice('Checkout was already finalized for this event.');
          return;
        }
        // True conflict: re-throw so modal displays conflict message while retaining unsaved exception state
        throw err;
      }
      throw err;
    }
  };

  // ---------------------------------------------------------
  // Phase 4.5: Correction & Verification Handlers
  // ---------------------------------------------------------
  const handleCorrectAttendance = async (attendanceId: string, payload: CorrectAttendancePayload) => {
    await attendanceApi.correctAttendance(attendanceId, payload);
    await loadAttendanceData(true);
    setSuccessNotice(
      'Attendance record corrected successfully. Event verification status has been returned to Pending Review.'
    );
  };

  const handleVerifyAttendance = async (payload: VerifyAttendancePayload) => {
    const res = await attendanceApi.verifyAttendance(eventId, payload);
    await loadAttendanceData(true);
    setSuccessNotice(
      res.verificationStatus === 'approved'
        ? 'Event attendance has been officially approved and verified.'
        : 'Event attendance has been marked as Rejected.'
    );
  };

  // ---------------------------------------------------------
  // Render States: Cancelled, Loading, Error
  // ---------------------------------------------------------
  if (eventStatus === 'cancelled') {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-2xl mx-auto my-6 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <AlertCircle size={24} />
        </div>
        <h3 className="text-base font-bold text-gray-900">Attendance Inactive</h3>
        <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
          This event has been cancelled. Attendance check-in and roster operations cannot be performed on cancelled events.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200/80 p-16 text-center max-w-2xl mx-auto my-6 shadow-xs flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
        <h3 className="text-sm font-bold text-gray-900">Loading Attendance Workspace...</h3>
        <p className="text-xs text-gray-500 mt-1">
          Retrieving attendance session lifecycle and worker roster.
        </p>
      </div>
    );
  }

  if (errorMessage && !rosterData) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-xl mx-auto my-6 shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle size={24} />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900">
            {errorStatus === 403 ? 'Access Restricted' : 'Failed to Load Attendance'}
          </h3>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{errorMessage}</p>
        </div>
        <button
          type="button"
          onClick={() => loadAttendanceData()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors shadow-xs"
        >
          <RotateCw size={14} />
          Retry Loading
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------
  // Lifecycle Stage Determination
  // ---------------------------------------------------------
  const isCheckInFinalized = Boolean(session?.checkInFinalized || rosterData?.session?.checkInFinalized);
  const isCheckoutFinalized = Boolean(session?.checkOutFinalized || rosterData?.session?.checkOutFinalized);
  const canFinalizeCheckIn = rosterData?.canFinalizeCheckIn ?? false;
  const latestTime = rosterData?.latestReportingTime || '';
  const roster = rosterData?.roster || [];
  const requirements = rosterData?.requirements || [];

  return (
    <div className="space-y-6">
      {/* Top Success Banner */}
      {successNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-4 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Lifecycle Progress Stepper Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/90 p-3 sm:p-4 shadow-xs flex items-center justify-between gap-2 overflow-x-auto">
        {/* Step 1: Check-in */}
        <div className="flex items-center gap-2.5 min-w-[150px]">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${isCheckInFinalized
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              }`}
          >
            {isCheckInFinalized ? <CheckCircle2 size={16} /> : '1'}
          </div>
          <div>
            <span className="text-xs font-bold text-gray-900 block leading-tight">Step 1: Check-in</span>
            <span className="text-[10px] text-gray-500">
              {isCheckInFinalized ? 'Completed' : 'Exception-Based'}
            </span>
          </div>
        </div>

        <ChevronRight size={16} className="text-gray-300 shrink-0" />

        {/* Step 2: Checkout */}
        <div className="flex items-center gap-2.5 min-w-[150px]">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${isCheckoutFinalized
                ? 'bg-emerald-600 text-white'
                : isCheckInFinalized
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 ring-2 ring-emerald-500/20'
                  : 'bg-gray-100 text-gray-400'
              }`}
          >
            {isCheckoutFinalized ? <CheckCircle2 size={16} /> : '2'}
          </div>
          <div>
            <span className="text-xs font-bold text-gray-900 block leading-tight">Step 2: Checkout</span>
            <span className="text-[10px] text-gray-500">
              {isCheckoutFinalized ? 'Completed' : isCheckInFinalized ? 'Active' : 'Locked'}
            </span>
          </div>
        </div>

        <ChevronRight size={16} className="text-gray-300 shrink-0" />

        {/* Step 3: Complete Records */}
        <div className="flex items-center gap-2.5 min-w-[150px]">
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${isCheckoutFinalized
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-400'
              }`}
          >
            {isCheckoutFinalized ? <CheckCircle2 size={16} /> : '3'}
          </div>
          <div>
            <span className="text-xs font-bold text-gray-900 block leading-tight">Step 3: Complete</span>
            <span className="text-[10px] text-gray-500">
              {isCheckoutFinalized ? 'Official Archive' : 'Pending Checkout'}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          STAGE 1: CHECK-IN PENDING (Phase 4.3 Workspace)
      ========================================================================= */}
      {!isCheckInFinalized ? (
        <div className="space-y-6">
          {/* Timing Banner */}
          <AttendanceTimingBanner
            latestReportingTime={latestTime}
            canFinalizeCheckIn={canFinalizeCheckIn}
            checkInFinalized={false}
            totalAssigned={roster.length}
          />

          {/* Metric Summary Cards */}
          <AttendanceSummaryCards
            totalAssigned={roster.length}
            presentCount={checkInLiveCounts.present}
            lateCount={checkInLiveCounts.late}
            absentCount={checkInLiveCounts.absent}
            latestReportingTime={latestTime}
            canFinalizeCheckIn={canFinalizeCheckIn}
            checkInFinalized={false}
          />

          {/* Check-in Exception Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-gray-900">Check-in Exceptions Workspace</h3>
              <p className="text-xs text-gray-500">
                Staff not marked late or absent are automatically recorded as Present / On Time.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => loadAttendanceData(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
              >
                <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              {(checkInLiveCounts.late > 0 || checkInLiveCounts.absent > 0) && (
                <button
                  type="button"
                  onClick={handleResetCheckInExceptions}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
                >
                  <Undo2 size={13} />
                  <span>Reset to Default</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleOpenCheckInReview}
                disabled={!canFinalizeCheckIn || roster.length === 0 || checkInLiveCounts.hasValidationError}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors shrink-0"
              >
                <ShieldCheck size={14} />
                Review & Finalize Check-in
              </button>
            </div>
          </div>

          {/* Check-in Roster Table */}
          <AttendanceRosterTable
            roster={roster}
            exceptions={checkInExceptions}
            onExceptionChange={handleCheckInExceptionChange}
            onSaveWorkerCheckIn={handleSaveWorkerCheckIn}
            disabled={false}
          />

          {/* Check-in Review Modal */}
          <ReviewCheckinModal
            isOpen={isCheckInReviewOpen}
            onClose={() => setIsCheckInReviewOpen(false)}
            onConfirm={handleConfirmFinalizeCheckIn}
            roster={roster}
            exceptions={checkInExceptions}
            idempotencyKey={checkInIdempotencyKey}
            onRegenerateKey={handleRegenerateCheckInKey}
          />
        </div>
      ) : isCheckoutFinalized ? (
        /* =========================================================================
            STAGE 3: FULL ATTENDANCE FINALIZED (Read-Only)
        ========================================================================= */
        <FinalizedAttendanceView
          session={session || rosterData!.session}
          roster={roster}
          onRefresh={() => loadAttendanceData(true)}
          onOpenCorrection={(w) => setCorrectionWorker(w)}
          onOpenVerification={(act) => setVerificationAction(act)}
        />
      ) : (
        /* =========================================================================
            STAGE 2: CHECK-IN FINALIZED, CHECKOUT ACTIVE (Phase 4.4 Workspace)
        ========================================================================= */
        <div className="space-y-6">
          {/* Checkout Stage Banner */}
          <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-emerald-50/90 border border-emerald-200 rounded-2xl p-5 flex items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-300">
                <Clock size={20} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-emerald-950">
                  Checkout Stage Active — Enter Normal Finishing Time
                </h4>
                <p className="text-xs text-emerald-800">
                  Check-in has been finalized. Once shifts conclude, specify the actual normal finishing time and record any early departures or overtime.
                </p>
              </div>
            </div>

            {/* Stage View Switcher */}
            <div className="inline-flex rounded-xl bg-emerald-100/70 p-1 border border-emerald-200/80 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveStageTab('checkout_form')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${activeStageTab === 'checkout_form'
                    ? 'bg-white text-emerald-950 shadow-2xs'
                    : 'text-emerald-800 hover:text-emerald-950'
                  }`}
              >
                Checkout Workspace
              </button>
              <button
                type="button"
                onClick={() => setActiveStageTab('checkin_history')}
                className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-all ${activeStageTab === 'checkin_history'
                    ? 'bg-white text-emerald-950 shadow-2xs'
                    : 'text-emerald-800 hover:text-emerald-950'
                  }`}
              >
                <History size={12} />
                <span>Check-in Baseline</span>
              </button>
            </div>
          </div>

          {activeStageTab === 'checkin_history' ? (
            /* Historical Check-in Baseline View */
            <FinalizedAttendanceView
              session={{ ...(session || rosterData?.session), checkOutFinalized: false } as any}
              roster={roster}
              onRefresh={() => loadAttendanceData(true)}
              onOpenCorrection={(w) => setCorrectionWorker(w)}
              onOpenVerification={(act) => setVerificationAction(act)}
            />
          ) : (
            /* Checkout Active Workspace Form */
            <div className="space-y-6">
              {/* Finishing Time Configuration Card */}
              <CheckoutFinishingTimeCard
                defaultFinishTime={defaultFinishTime}
                onDefaultFinishTimeChange={setDefaultFinishTime}
                defaultFinishTimeError={defaultFinishTimeError}
                categoryFinishTimes={categoryFinishTimes}
                onCategoryFinishTimesChange={setCategoryFinishTimes}
                categoryErrors={categoryErrors}
                overrides={requirementOverrides}
                onOverridesChange={setRequirementOverrides}
                requirements={requirements}
                disabled={false}
              />

              {/* Checkout Action Toolbar */}
              <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-gray-900">Checkout Exceptions Management</h3>
                  <p className="text-xs text-gray-500">
                    Checked-in staff default to normal checkout at their applicable finishing time.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => loadAttendanceData(true)}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                  >
                    <RotateCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>

                  {(checkoutLiveCounts.early > 0 || checkoutLiveCounts.overtime > 0) && (
                    <button
                      type="button"
                      onClick={handleResetCheckoutExceptions}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
                    >
                      <Undo2 size={13} />
                      <span>Reset Exceptions</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleOpenCheckoutReview}
                    disabled={
                      !isFinishingTimeConfigured ||
                      hasCategoryErrors ||
                      checkoutLiveCounts.hasValidationError ||
                      roster.length === 0
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors shrink-0"
                    title={
                      !isFinishingTimeConfigured
                        ? 'Enter an Event Default or Category Normal Finishing Time to continue'
                        : hasCategoryErrors
                          ? 'Resolve category finishing time format errors before finalizing'
                          : checkoutLiveCounts.hasValidationError
                            ? 'Resolve departure time errors before finalizing'
                            : 'Review summary and finalize checkout'
                    }
                  >
                    <ShieldCheck size={14} />
                    Review & Finalize Checkout
                  </button>
                </div>
              </div>

              {/* Checkout Roster Table */}
              <CheckoutRosterTable
                roster={roster}
                defaultFinishTime={defaultFinishTime}
                categoryFinishTimes={categoryFinishTimes}
                overrides={requirementOverrides}
                exceptions={checkoutExceptions}
                onExceptionChange={handleCheckoutExceptionChange}
                disabled={false}
              />

              {/* Review Checkout Modal */}
              <ReviewCheckoutModal
                isOpen={isCheckoutReviewOpen}
                onClose={() => setIsCheckoutReviewOpen(false)}
                onConfirm={handleConfirmFinalizeCheckout}
                roster={roster}
                defaultFinishTime={defaultFinishTime}
                categoryFinishTimes={categoryFinishTimes}
                overrides={requirementOverrides}
                exceptions={checkoutExceptions}
                idempotencyKey={checkoutIdempotencyKey}
                onRegenerateKey={handleRegenerateCheckoutKey}
              />
            </div>
          )}
        </div>
      )}

      {/* Phase 4.5: Correction Modal */}
      {correctionWorker && (
        <CorrectionModal
          worker={correctionWorker}
          isCheckoutFinalized={isCheckoutFinalized}
          defaultFinishTime={
            defaultFinishTime ||
            (session as any)?.actualNormalFinishTime ||
            (rosterData?.session as any)?.actualNormalFinishTime
          }
          onClose={() => setCorrectionWorker(null)}
          onSubmit={handleCorrectAttendance}
        />
      )}

      {/* Phase 4.5: Final Manager Verification Modal */}
      {verificationAction && (
        <VerificationModal
          action={verificationAction}
          roster={roster}
          onClose={() => setVerificationAction(null)}
          onSubmit={handleVerifyAttendance}
        />
      )}
    </div>
  );
};
