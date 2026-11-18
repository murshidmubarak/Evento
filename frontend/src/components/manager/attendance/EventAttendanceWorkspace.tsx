import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  attendanceApi,
  parseTimeToMinutes,
} from '../../../features/attendance/attendanceApi';
import { formatTimeTo12Hour } from '../../../utils/formatters';
import type {
  AttendanceSession,
  AttendanceRosterResponse,
  FinalizeCheckOutPayload,
  CategoryFinishTimeInput,
  IndividualCheckInPayload,
  AttendanceRosterItem,
  CorrectAttendancePayload,
  VerifyAttendancePayload,
} from '../../../features/attendance/attendance.types';
import {
  AttendanceRosterTable,
  type WorkerExceptionState,
} from './AttendanceRosterTable';
import {
  ReviewCheckinModal,
} from './ReviewCheckinModal';
import {
  CheckoutCategoryCard,
} from './CheckoutCategoryCard';
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
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Lock,
} from 'lucide-react';

interface EventAttendanceWorkspaceProps {
  eventId: string;
  eventTitle: string;
  eventDate?: string | Date;
  eventStatus: string;
  initialTab?: 'checkin' | 'checkout_form' | 'checkin_history' | 'finalized';
}

export const EventAttendanceWorkspace: React.FC<EventAttendanceWorkspaceProps> = ({
  eventId,
  eventTitle: _eventTitle,
  eventDate: _eventDate,
  eventStatus,
  initialTab = 'checkin',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [rosterData, setRosterData] = useState<AttendanceRosterResponse | null>(null);

  // ---------------------------------------------------------
  // Check-in Exception & Finalization State
  // ---------------------------------------------------------
  const [checkInExceptions, setCheckInExceptions] = useState<Record<string, WorkerExceptionState>>({});
  const [isCheckInReviewOpen, setIsCheckInReviewOpen] = useState(false);
  const [selectedCheckInCategory, setSelectedCheckInCategory] = useState<string | null>(null);
  const [checkInIdempotencyKey, setCheckInIdempotencyKey] = useState<string>('');

  // ---------------------------------------------------------
  // Checkout State
  // ---------------------------------------------------------
  const [defaultFinishTime, setDefaultFinishTime] = useState<string>('');
  const [categoryFinishTimes, setCategoryFinishTimes] = useState<Record<string, string>>({});
  const [isCheckoutReviewOpen, setIsCheckoutReviewOpen] = useState(false);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>('');
  const [checkoutPayloadHash, setCheckoutPayloadHash] = useState<string>('');

  // Active workspace tab (defaults to checkin; navigation to checkout happens only via user clicking Checkout button)
  const [activeStageTab, setActiveStageTab] = useState<'checkin' | 'checkout_form' | 'checkin_history' | 'finalized'>(initialTab);

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

      if (!isRefresh && activeSession?.checkOutFinalized) {
        setActiveStageTab((prev) => (prev === 'checkin' ? 'finalized' : prev));
      }

      // Populate default finish time and category finish times if session already has them
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

  const handleSaveWorkerCheckIn = async (workerId: string, payload: IndividualCheckInPayload) => {
    try {
      const worker = rosterData?.roster.find((w) => w.workerId === workerId);
      if (worker?.attendanceId) {
        // Operation 2: Existing record update -> use correction API!
        await attendanceApi.correctAttendance(worker.attendanceId, {
          arrivalStatus: payload.arrivalStatus,
          actualArrivalTime: payload.actualArrivalTime,
          status: payload.status,
          applyDefaultCheckout: true,
          reason: 'Manager adjusted attendance exception in roster',
        });
        setSuccessNotice(
          payload.arrivalStatus === 'absent'
            ? `${worker.workerName} attendance successfully updated to Absent.`
            : payload.arrivalStatus === 'late'
              ? `${worker.workerName} attendance successfully updated to Late (${formatTimeTo12Hour(payload.actualArrivalTime)}).`
              : `${worker.workerName} attendance successfully updated to Present / On Time.`
        );
      } else {
        // Operation 1: Initial Late/Absent marking -> use recordWorkerCheckIn!
        await attendanceApi.recordWorkerCheckIn(eventId, workerId, payload);
        const name = worker ? worker.workerName : 'Worker';
        setSuccessNotice(
          payload.arrivalStatus === 'absent'
            ? `${name} check-in successfully confirmed and saved as Absent.`
            : payload.arrivalStatus === 'late'
              ? `${name} check-in successfully confirmed and saved as Late (${formatTimeTo12Hour(payload.actualArrivalTime)}).`
              : `${name} check-in successfully confirmed and saved as Present / On Time.`
        );
      }
      await loadAttendanceData(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save individual check-in.';
      throw new Error(msg);
    }
  };

  const handleOpenCheckInReview = () => {
    setSelectedCheckInCategory(null);
    const newKey = `chkin_${eventId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCheckInIdempotencyKey(newKey);
    setIsCheckInReviewOpen(true);
  };

  const handleOpenCategoryCheckInReview = (workerType: string) => {
    setSelectedCheckInCategory(workerType);
    const newKey = `chkin_${eventId}_${workerType}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCheckInIdempotencyKey(newKey);
    setIsCheckInReviewOpen(true);
  };

  const handleRegenerateCheckInKey = () => {
    const prefix = selectedCheckInCategory ? `chkin_${eventId}_${selectedCheckInCategory}_` : `chkin_${eventId}_`;
    const newKey = `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setCheckInIdempotencyKey(newKey);
  };

  const handleConfirmFinalizeCheckIn = async (keyToUse: string) => {
    try {
      const lateExceptions = Object.entries(checkInExceptions)
        .filter(([_, state]) => state.type === 'late' && state.actualArrivalTime)
        .map(([workerId, state]) => ({
          workerId,
          actualArrivalTime: state.actualArrivalTime!,
        }));

      const absentExceptions = Object.entries(checkInExceptions)
        .filter(([_, state]) => state.type === 'absent')
        .map(([workerId]) => workerId);

      if (selectedCheckInCategory) {
        // Scoped to category
        const catWorkers = (rosterData?.roster || []).filter(
          (w) => w.workerType.trim().toLowerCase() === selectedCheckInCategory.trim().toLowerCase()
        );
        const catWorkerIds = new Set(catWorkers.map((w) => w.workerId));

        const scopedLate = lateExceptions.filter((l) => catWorkerIds.has(l.workerId));
        const scopedAbsent = absentExceptions.filter((wId) => catWorkerIds.has(wId));

        await attendanceApi.finalizeCategoryCheckIn(
          eventId,
          selectedCheckInCategory,
          {
            lateExceptions: scopedLate.length > 0 ? scopedLate : undefined,
            absentExceptions: scopedAbsent.length > 0 ? scopedAbsent : undefined,
          },
          keyToUse
        );

        const confirmedCat = selectedCheckInCategory;
        setIsCheckInReviewOpen(false);
        setSelectedCheckInCategory(null);
        setSuccessNotice(
          `Check-in has been successfully confirmed for category '${confirmedCat}'! Checkout for this category is now unlocked.`
        );
        await loadAttendanceData(true);
        return;
      }

      const isReFinalize = Boolean(
        session?.checkInFinalized ||
        rosterData?.session?.checkInFinalized ||
        rosterData?.checkInFinalized
      );
      const currentRev = rosterData?.checkInRevision || session?.checkInRevision || 1;

      await attendanceApi.finalizeCheckIn(
        eventId,
        {
          lateExceptions: lateExceptions.length > 0 ? lateExceptions : undefined,
          absentExceptions: absentExceptions.length > 0 ? absentExceptions : undefined,
        },
        keyToUse
      );

      setIsCheckInReviewOpen(false);
      setSuccessNotice(
        isReFinalize
          ? `Check-in has been successfully re-finalized (Revision ${currentRev + 1})!`
          : 'Check-in has been successfully finalized! All assigned workers are confirmed.'
      );
      await loadAttendanceData(true);
    } catch (err: any) {
      if (err.response?.status === 409) {
        const latestSession = await attendanceApi.getSession(eventId);
        if (latestSession.checkInFinalized && !latestSession.checkInChangesPending) {
          setIsCheckInReviewOpen(false);
          setSelectedCheckInCategory(null);
          await loadAttendanceData(true);
          setSuccessNotice('Check-in is already finalized in its latest state.');
          return;
        }
        throw err;
      }
      throw err;
    }
  };

  // ---------------------------------------------------------
  // Checkout Category-Wise Handlers
  // ---------------------------------------------------------
  const handleSaveCategoryDeparture = async (
    workerType: string,
    departureDate: string,
    departureTime: string,
    reason?: string
  ) => {
    try {
      await attendanceApi.recordCategoryDeparture(eventId, {
        workerType,
        actualDepartureDate: departureDate,
        actualDepartureTime: departureTime,
        reason,
      });
      setSuccessNotice(`Category actual departure saved for ${workerType.replace(/_/g, ' ')} (${departureDate} ${formatTimeTo12Hour(departureTime)}).`);
      await loadAttendanceData(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save category departure.';
      setErrorMessage(msg);
      throw err;
    }
  };

  const handleMarkWorkerCheckOutException = async (
    workerId: string,
    departureDate: string,
    departureTime: string,
    reason?: string
  ) => {
    try {
      const res = await attendanceApi.recordWorkerCheckOutException(eventId, workerId, {
        actualDepartureDate: departureDate,
        actualDepartureTime: departureTime,
        reason,
      });
      setSuccessNotice(
        `Recorded individual checkout exception: ${res.departureStatus === 'early_departure' ? 'Early Departure' : 'Overtime'} (${formatTimeTo12Hour(res.actualDepartureTime || res.checkOut || departureTime)}).`
      );
      await loadAttendanceData(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save worker checkout exception.';
      setErrorMessage(msg);
      throw err;
    }
  };

  const handleClearWorkerCheckOutException = async (workerId: string) => {
    try {
      await attendanceApi.clearWorkerCheckOutException(eventId, workerId);
      setSuccessNotice('Cleared exception. Worker returned to category default checkout.');
      await loadAttendanceData(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to clear worker checkout exception.';
      setErrorMessage(msg);
      throw err;
    }
  };

  const isFinishingTimeConfigured = useMemo(() => {
    if (rosterData?.categorySummaries && rosterData.categorySummaries.length > 0) {
      const pendingCategories = rosterData.categorySummaries.filter(
        (c) => c.eligibleCount > 0 && (!c.actualDepartureTime || !c.actualDepartureTime.trim())
      );
      return pendingCategories.length === 0;
    }

    const hasValidDefault = Boolean(defaultFinishTime.trim() && parseTimeToMinutes(defaultFinishTime) !== null);
    if (hasValidDefault) return true;

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

  const currentCheckoutPayload = useMemo((): FinalizeCheckOutPayload => {
    const categoriesList: CategoryFinishTimeInput[] = (rosterData?.categoryActualDepartures || []).map((c) => ({
      workerType: c.workerType,
      normalFinishTime: c.actualDepartureTime,
    }));

    return {
      actualNormalFinishTime: defaultFinishTime.trim() || undefined,
      categoryFinishTimes: categoriesList.length > 0 ? categoriesList : undefined,
    };
  }, [defaultFinishTime, rosterData]);

  const computedCheckoutHash = useMemo(() => {
    return JSON.stringify({
      categories: (rosterData?.categoryActualDepartures || []).map((c) => ({
        type: c.workerType,
        time: c.actualDepartureTime,
      })),
      rosterCheckout: (rosterData?.roster || []).map((w) => ({
        id: w.workerId,
        source: w.checkOutSource,
        status: w.departureStatus,
        out: w.checkOut,
      })),
    });
  }, [rosterData]);

  const isCheckInFinalized = Boolean(
    session?.checkInFinalized ||
    rosterData?.session?.checkInFinalized ||
    rosterData?.checkInFinalized
  );

  const isCheckInChangesPending = Boolean(
    session?.checkInChangesPending ||
    rosterData?.session?.checkInChangesPending ||
    rosterData?.checkInChangesPending
  );

  const allCategoriesConfirmed = useMemo(() => {
    if (!rosterData?.categorySummaries || rosterData.categorySummaries.length === 0) return false;
    return rosterData.categorySummaries.every((c) => c.checkInFinalized && !c.checkInChangesPending);
  }, [rosterData]);

  const anyCategoryChangesPending = useMemo(() => {
    if (!rosterData?.categorySummaries || rosterData.categorySummaries.length === 0) return false;
    return rosterData.categorySummaries.some((c) => c.checkInChangesPending);
  }, [rosterData]);

  const displayCategorySummaries = useMemo(() => {
    if (rosterData?.categorySummaries && rosterData.categorySummaries.length > 0) {
      return rosterData.categorySummaries;
    }
    if (!rosterData?.roster || rosterData.roster.length === 0) return [];

    const groups = new Map<string, typeof rosterData.roster>();
    rosterData.roster.forEach((w) => {
      const type = w.workerType || 'General Staff';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(w);
    });

    return Array.from(groups.entries()).map(([workerType, workers]) => {
      const totalAssigned = workers.length;
      let normalCount = 0;
      let absentCount = 0;
      workers.forEach((w) => {
        const exc = checkInExceptions[w.workerId]?.type || (w.arrivalStatus === 'absent' ? 'absent' : 'present');
        if (exc === 'absent') absentCount++;
        else normalCount++;
      });

      return {
        workerType,
        totalAssigned,
        normalCount,
        absentCount,
        checkInFinalized: isCheckInFinalized,
        checkInChangesPending: isCheckInChangesPending,
        canFinalizeCheckIn: rosterData.canFinalizeCheckIn,
        checkInRevision: rosterData.checkInRevision || session?.checkInRevision || 1,
      };
    });
  }, [rosterData, checkInExceptions, isCheckInFinalized, isCheckInChangesPending, session]);

  const handleOpenCheckoutReview = () => {
    if (!isCheckInFinalized && !allCategoriesConfirmed) {
      setErrorMessage(
        'Check-in must be confirmed for all worker categories before overall checkout can be finalized.'
      );
      return;
    }
    if (isCheckInChangesPending || anyCategoryChangesPending) {
      setErrorMessage(
        'Cannot finalize checkout while check-in has pending changes. Please re-confirm check-in first.'
      );
      return;
    }
    if (!isFinishingTimeConfigured) return;
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
  const isCheckoutFinalized = Boolean(session?.checkOutFinalized || rosterData?.session?.checkOutFinalized);
  const isEventDay = rosterData?.isEventDay ?? true;
  const eventDateFormatted = rosterData?.eventDate
    ? new Date(rosterData.eventDate).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    : undefined;
  const roster = rosterData?.roster || [];

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

      {/* Top Error Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs p-4 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-950 font-bold text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Header & Action Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 tracking-tight">
            {activeStageTab === 'checkout_form'
              ? 'Category-Wise Checkout Workspace'
              : activeStageTab === 'finalized'
                ? 'Finalized Attendance Summary'
                : 'Check-in Exceptions Workspace'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeStageTab === 'checkout_form'
              ? 'Record actual category departures. Only early or overtime workers require individual exception entries.'
              : activeStageTab === 'finalized'
                ? 'Official finalized attendance records and duration breakdowns.'
                : 'Staff not marked late or absent are recorded as Present / On Time.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
          {isCheckoutFinalized && (
            <button
              type="button"
              onClick={() => setActiveStageTab('finalized')}
              className={`flex-1 sm:flex-none h-10 px-5 inline-flex items-center justify-center text-xs rounded-lg transition-all ${activeStageTab === 'finalized'
                ? 'bg-gray-900 text-white font-bold shadow-xs'
                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold'
                }`}
            >
              Summary
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveStageTab('checkin')}
            className={`flex-1 sm:flex-none h-10 px-5 inline-flex items-center justify-center text-xs rounded-lg transition-all ${activeStageTab === 'checkin'
              ? 'bg-slate-900 text-white font-semibold shadow-xs'
              : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold'
              }`}
          >
            Check-in
          </button>

          <button
            type="button"
            onClick={() => setActiveStageTab('checkout_form')}
            className={`flex-1 sm:flex-none h-10 px-5 inline-flex items-center justify-center text-xs rounded-lg transition-all ${activeStageTab === 'checkout_form'
              ? 'bg-slate-900 text-white font-semibold shadow-xs'
              : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 font-semibold'
              }`}
          >
            Checkout
          </button>
        </div>
      </div>

      {activeStageTab === 'finalized' ? (
        /* =========================================================================
            STAGE 3: FULL ATTENDANCE FINALIZED (Read-Only Summary)
        ========================================================================= */
        <FinalizedAttendanceView
          session={session || rosterData!.session}
          roster={roster}
          openConcernsCount={rosterData?.openConcernsCount || 0}
          onRefresh={() => loadAttendanceData(true)}
          onOpenCorrection={(w) => setCorrectionWorker(w)}
          onOpenVerification={(act) => setVerificationAction(act)}
        />
      ) : activeStageTab === 'checkin' ? (
        /* =========================================================================
            STAGE 1: CHECK-IN EXCEPTIONS & FINALIZATION
        ========================================================================= */
        <div className="space-y-6">
          {/* Pending Re-finalization Banner */}
          {isCheckInChangesPending && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-4 rounded-xl flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold">Check-in Changes Pending:</span>
                  <span className="ml-1 text-amber-800">
                    Attendance records were updated after initial finalization. Re-finalization is required before checkout can be finalized.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenCheckInReview}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors shrink-0"
              >
                Review & Re-finalize Check-in
              </button>
            </div>
          )}

          {/* Post-Event Day Lock Notice */}
          {rosterData?.isAfterEventDay && (
            <div className="bg-gray-100 border border-gray-200 text-gray-700 text-xs p-4 rounded-xl flex items-center gap-2 shadow-2xs">
              <Lock size={16} className="text-gray-500 shrink-0" />
              <div>
                <span className="font-bold">Check-in Editing Closed:</span>
                <span className="ml-1 text-gray-600">
                  The scheduled event day has ended. Ordinary check-in status and arrival time modifications are permanently locked.
                </span>
              </div>
            </div>
          )}

          {/* Independent Category Check-in Confirmation Cards */}
          {displayCategorySummaries.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
                <h5 className="text-sm font-bold text-gray-900">
                  Category check-in status & eligibility
                </h5>
                <span className="text-xs text-gray-400">
                  Confirming a category unlocks its checkout independently
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayCategorySummaries.map((cat) => {
                  const isCatConfirmed = Boolean(cat.checkInFinalized);
                  const isCatChangesPending = Boolean(cat.checkInChangesPending);

                  return (
                    <div
                      key={cat.workerType}
                      className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-gray-300 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-900 text-base">{cat.workerType}</span>
                          {isCatConfirmed ? (
                            isCatChangesPending ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 animate-pulse whitespace-nowrap shrink-0">
                                <AlertTriangle size={12} />
                                Re-confirm
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap shrink-0">
                                <CheckCircle2 size={12} className="text-emerald-600" />
                                Confirmed
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap shrink-0">
                              <Clock size={12} className="text-amber-600" />
                              Pending confirmation
                            </span>
                          )}
                        </div>

                        {/* 3 Metric Columns */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-1">
                          <div>
                            <div className="text-2xl sm:text-3xl font-bold text-gray-900">{cat.totalAssigned}</div>
                            <div className="text-xs text-gray-500 font-normal mt-0.5">Assigned</div>
                          </div>
                          <div>
                            <div className="text-2xl sm:text-3xl font-bold text-emerald-600">{cat.normalCount}</div>
                            <div className="text-xs text-gray-500 font-normal mt-0.5">Present</div>
                          </div>
                          <div>
                            <div className={`text-2xl sm:text-3xl font-bold ${cat.absentCount > 0 ? 'text-rose-600' : 'text-gray-900'}`}>{cat.absentCount}</div>
                            <div className="text-xs text-gray-500 font-normal mt-0.5">Absent</div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 mt-auto">
                        <span className="text-xs font-medium">
                          {isCatConfirmed && !isCatChangesPending ? (
                            <span className="text-emerald-700">Checkout unlocked</span>
                          ) : (
                            <span className="text-gray-400">Checkout locked</span>
                          )}
                        </span>
                        {!isCatConfirmed ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCategoryCheckInReview(cat.workerType)}
                            disabled={!cat.canFinalizeCheckIn || eventStatus === 'cancelled'}
                            className="px-3.5 py-1.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed border border-gray-200/80 rounded-lg transition-colors cursor-pointer"
                          >
                            Review & Confirm
                          </button>
                        ) : isCatChangesPending ? (
                          <button
                            type="button"
                            onClick={() => handleOpenCategoryCheckInReview(cat.workerType)}
                            disabled={eventStatus === 'cancelled'}
                            className="px-3.5 py-1.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-2xs animate-pulse cursor-pointer"
                          >
                            <AlertTriangle size={13} />
                            Review & Re-confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenCategoryCheckInReview(cat.workerType)}
                            className="px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            Confirmed ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <AttendanceRosterTable
            roster={roster}
            exceptions={checkInExceptions}
            onExceptionChange={handleCheckInExceptionChange}
            onSaveWorkerCheckIn={handleSaveWorkerCheckIn}
            onCorrectAttendance={handleCorrectAttendance}
            isEventDay={isEventDay}
            eventDateFormatted={eventDateFormatted}
            isBeforeEventDay={rosterData?.isBeforeEventDay}
            isAfterEventDay={rosterData?.isAfterEventDay}
            canNormalCorrect={rosterData?.canNormalCorrect}
            isAfterCorrectionDeadline={rosterData?.isAfterCorrectionDeadline}
            eventStatus={eventStatus}
            disabled={eventStatus === 'cancelled'}
          />
        </div>
      ) : (
        /* =========================================================================
            STAGE 2: CHECKOUT WORKSPACE (Category-Wise Actual Departures)
        ========================================================================= */
        <div className="space-y-6">
          {/* Category-Wise Check-in Status Notice */}
          {rosterData?.categorySummaries &&
            rosterData.categorySummaries.some((c) => !c.checkInFinalized || c.checkInChangesPending) && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-4 rounded-xl flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Category Check-in Notice:</span>
                    <span className="ml-1 text-amber-800">
                      Some categories have unconfirmed check-in or pending changes. Each category unlocks independently once its check-in is confirmed on the Check-in tab.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveStageTab('checkin')}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-colors shrink-0"
                >
                  Go to Check-in
                </button>
              </div>
            )}
          {/* Post-Event Day Lock Notice */}
          {!rosterData?.canModifyCheckout && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-amber-100 text-amber-800 border-amber-300">
                  <Lock size={20} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold text-amber-950">
                    Checkout Editing Closed (Locked)
                  </h4>
                  <p className="text-xs text-amber-800">
                    Checkout departure times can only be set on the scheduled event day and are permanently closed after the event day. Further edits are disabled.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Checkout Overall Summary Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Staff</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{rosterData?.summary?.total ?? roster.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Eligible</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">
                {(rosterData?.summary?.total ?? roster.length) - (rosterData?.summary?.absent ?? 0)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Normal</p>
              <p className="text-xl font-bold text-emerald-700 mt-0.5">{rosterData?.summary?.normalCount ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Early Departure</p>
              <p className="text-xl font-bold text-amber-700 mt-0.5">{rosterData?.summary?.earlyDepartureCount ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">Overtime</p>
              <p className="text-xl font-bold text-indigo-700 mt-0.5">{rosterData?.summary?.overtimeCount ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">Absent Excluded</p>
              <p className="text-xl font-bold text-rose-700 mt-0.5">{rosterData?.summary?.absent ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200/90 p-3 shadow-2xs">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pending Out</p>
              <p className="text-xl font-bold text-gray-700 mt-0.5">{rosterData?.summary?.pendingCheckOutCount ?? 0}</p>
            </div>
          </div>

          {/* Checkout Action Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-gray-900">Category Departure Management</h3>
              <p className="text-xs text-gray-500">
                Record actual departure times per category. Normal workers inherit this timestamp as their checkout.
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

              <button
                type="button"
                onClick={handleOpenCheckoutReview}
                disabled={!isFinishingTimeConfigured || roster.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors shrink-0"
                title={
                  !isFinishingTimeConfigured
                    ? 'Record actual departure times for categories with eligible workers to finalize'
                    : 'Review summary and finalize checkout'
                }
              >
                <ShieldCheck size={14} />
                Review & Finalize Checkout
              </button>
            </div>
          </div>

          {/* Category-Wise Checkout Cards */}
          <div className="space-y-5">
            {rosterData?.categorySummaries && rosterData.categorySummaries.length > 0 ? (
              rosterData.categorySummaries.map((catSummary) => {
                const savedDep = rosterData.categoryActualDepartures?.find(
                  (d) => d.workerType.toLowerCase() === catSummary.workerType.toLowerCase()
                );
                return (
                  <CheckoutCategoryCard
                    key={catSummary.workerType}
                    category={catSummary}
                    roster={roster}
                    savedDeparture={savedDep}
                    defaultDate={rosterData?.eventOperationalDate || (typeof rosterData?.eventDate === 'string' ? rosterData.eventDate.split('T')[0] : '')}
                    onSaveDeparture={handleSaveCategoryDeparture}
                    onMarkException={handleMarkWorkerCheckOutException}
                    onClearException={handleClearWorkerCheckOutException}
                    disabled={!rosterData.canModifyCheckout || eventStatus === 'cancelled'}
                    isLocked={!rosterData.canModifyCheckout}
                  />
                );
              })
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500 text-xs">
                No worker categories found for this event roster.
              </div>
            )}
          </div>

          {/* Review Checkout Modal */}
          <ReviewCheckoutModal
            isOpen={isCheckoutReviewOpen}
            onClose={() => setIsCheckoutReviewOpen(false)}
            onConfirm={handleConfirmFinalizeCheckout}
            roster={roster}
            categorySummaries={rosterData?.categorySummaries || []}
            defaultFinishTime={defaultFinishTime}
            categoryFinishTimes={categoryFinishTimes}
            idempotencyKey={checkoutIdempotencyKey}
            onRegenerateKey={handleRegenerateCheckoutKey}
          />
        </div>
      )}

      {/* Review & Finalize / Re-finalize Check-in Modal */}
      {isCheckInReviewOpen && (
        <ReviewCheckinModal
          isOpen={isCheckInReviewOpen}
          onClose={() => {
            setIsCheckInReviewOpen(false);
            setSelectedCheckInCategory(null);
          }}
          onConfirm={handleConfirmFinalizeCheckIn}
          roster={roster}
          exceptions={checkInExceptions}
          idempotencyKey={checkInIdempotencyKey}
          onRegenerateKey={handleRegenerateCheckInKey}
          categoryName={selectedCheckInCategory || undefined}
          workerType={selectedCheckInCategory || undefined}
          isReFinalize={
            selectedCheckInCategory
              ? Boolean(
                rosterData?.categorySummaries?.find(
                  (c) => c.workerType.trim().toLowerCase() === selectedCheckInCategory.trim().toLowerCase()
                )?.checkInFinalized
              )
              : isCheckInFinalized
          }
          currentRevision={
            selectedCheckInCategory
              ? rosterData?.categorySummaries?.find(
                (c) => c.workerType.trim().toLowerCase() === selectedCheckInCategory.trim().toLowerCase()
              )?.checkInRevision || 1
              : rosterData?.checkInRevision || session?.checkInRevision || 1
          }
          previousFinalizedAt={
            selectedCheckInCategory
              ? rosterData?.categorySummaries?.find(
                (c) => c.workerType.trim().toLowerCase() === selectedCheckInCategory.trim().toLowerCase()
              )?.checkInFinalizedAt || undefined
              : rosterData?.session?.checkInFinalizedAt || session?.checkInFinalizedAt
          }
          previousFinalizedBy={
            selectedCheckInCategory
              ? rosterData?.categorySummaries?.find(
                (c) => c.workerType.trim().toLowerCase() === selectedCheckInCategory.trim().toLowerCase()
              )?.checkInFinalizedBy || undefined
              : rosterData?.session?.checkInFinalizedBy || session?.checkInFinalizedBy
          }
        />
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
