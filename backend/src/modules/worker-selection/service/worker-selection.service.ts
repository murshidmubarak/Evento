import mongoose from 'mongoose';
import { WorkRequirementRepository } from '../../work-requirements/repository/work-requirement.repository.js';
import { WorkResponseRepository } from '../../work-requirements/repository/work-response.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import { UserRepository } from '../../auth/repository/user.repository.js';
import {
  WorkerLocationHistoryRepository,
  type EffectiveWorkerLocation,
} from '../../work-requirements/repository/worker-location-history.repository.js';
import { WorkRequirement, type IWorkRequirement } from '../../work-requirements/model/work-requirement.model.js';
import { DistanceOnlyRankingStrategy } from '../ranking/distance-only.strategy.js';
import type { CandidateEvaluation, IRankingStrategy } from '../ranking/ranking-strategy.interface.js';
import {
  calculateHaversineDistanceKm,
  calculateDistanceScore,
  isValidCoordinate,
} from '../utils/distance.util.js';
import { toCalendarDayString, isSameCalendarDay } from '../utils/calendar-day.util.js';
import { ApiError } from '../../../utils/ApiError.js';

export interface SelectionResult {
  requirementId: string;
  eventId: string;
  selectionRound: number;
  requiredCount: number;
  previouslyRetainedCount: number;
  newlySelectedCount: number;
  totalAssignedCount: number;
  remainingCount: number;
  status: string;
  selectedWorkers: Array<{
    workerId: string;
    name: string;
    workerType: string;
    distanceKm: number;
    distanceScore: number;
    assignedAt: Date;
    selectionRound: number;
  }>;
  evaluatedCandidates: CandidateEvaluation[];
  excludedCandidates: Array<{
    workerId: string;
    name: string;
    reason: string;
  }>;
}

export class WorkerSelectionService {
  private requirementRepository: WorkRequirementRepository;
  private responseRepository: WorkResponseRepository;
  private eventRepository: EventRepository;
  private userRepository: UserRepository;
  private locationHistoryRepository: WorkerLocationHistoryRepository;
  private rankingStrategy: IRankingStrategy;

  constructor(rankingStrategy?: IRankingStrategy) {
    this.requirementRepository = new WorkRequirementRepository();
    this.responseRepository = new WorkResponseRepository();
    this.eventRepository = new EventRepository();
    this.userRepository = new UserRepository();
    this.locationHistoryRepository = new WorkerLocationHistoryRepository();
    // Default active strategy is strictly distance-only (no fake performance scores)
    this.rankingStrategy = rankingStrategy || new DistanceOnlyRankingStrategy();
  }

  /**
   * Checks whether a worker already has another active assignment on the given calendar day.
   * This applies across all events and all work requirements.
   */
  async checkSameCalendarDayConflict(
    workerId: string,
    targetEventDate: Date,
    currentRequirementId?: string
  ): Promise<{ hasConflict: boolean; conflictingEventTitle?: string }> {
    const assignedRequirements = await this.requirementRepository.findAssignedRequirementsByWorker(workerId);
    const targetDayStr = toCalendarDayString(targetEventDate);

    for (const req of assignedRequirements) {
      // If checking for a different requirement or same requirement
      if (currentRequirementId && req._id.toString() === currentRequirementId) {
        continue;
      }

      const event = req.eventId as any;
      if (!event || event.status === 'cancelled') {
        continue;
      }

      if (event.date) {
        try {
          const eventDayStr = toCalendarDayString(event.date);
          if (eventDayStr === targetDayStr) {
            return {
              hasConflict: true,
              conflictingEventTitle: event.title || 'Another Event',
            };
          }
        } catch {
          // If date calculation fails, continue
        }
      }
    }

    return { hasConflict: false };
  }

  /**
   * Executes deterministic candidate selection for an expired interest window.
   *
   * Critical guarantees:
   * 1. Preserves all previously assigned workers.
   * 2. Calculates remaining unfilled staffing positions (requiredCount - existingAssignedCount).
   * 3. Selects candidates ONLY up to remaining unfilled positions.
   * 4. Enforces manager-configured maximum distance strictly.
   * 5. Enforces same-calendar-day conflict rule.
   * 6. Ranks eligible candidates deterministically using distance & tie-breakers.
   * 7. Sets status to 'filled' ONLY when total assigned reaches requiredCount.
   * 8. Concurrency protection via atomic operations.
   */
  async executeSelection(requirementId: string, expectedRound?: number): Promise<SelectionResult> {
    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      throw ApiError.badRequest('Invalid work requirement ID format');
    }

    // 1. Concurrency guard: atomically lock requirement into 'selection_in_progress' if in 'open' status
    const initialRequirement = await this.requirementRepository.findById(requirementId);
    if (!initialRequirement) {
      throw ApiError.notFound('Work requirement not found');
    }

    // If requirement is cancelled or closed, do not process
    if (initialRequirement.status === 'cancelled' || initialRequirement.status === 'closed') {
      throw ApiError.badRequest(`Cannot run selection on a requirement with status '${initialRequirement.status}'`);
    }

    // Stale scheduled job protection: verify selectionRound
    if (expectedRound !== undefined && initialRequirement.selectionRound !== expectedRound) {
      console.log(`ℹ️ [WorkerSelectionService] Skipping stale selection job for req ${requirementId}: expected round ${expectedRound}, current round is ${initialRequirement.selectionRound}`);
      return this.buildResult(initialRequirement, [], [], []);
    }

    // Validate interest deadline has arrived
    if (initialRequirement.interestDeadlineAt && initialRequirement.interestDeadlineAt.getTime() > Date.now()) {
      throw ApiError.badRequest(
        `Interest window has not yet expired. Deadline: ${initialRequirement.interestDeadlineAt.toISOString()}, Current time: ${new Date().toISOString()}`
      );
    }

    // Retrieve event
    const event = await this.eventRepository.findById(initialRequirement.eventId.toString());
    if (!event) {
      throw ApiError.notFound('Associated event not found');
    }
    if (event.status !== 'confirmed') {
      throw ApiError.badRequest(`Event must be in confirmed status for worker selection. Current: '${event.status}'`);
    }

    // Validate event date has not passed; if passed, mark requirement closed and abort
    if (event.date) {
      const todayStr = toCalendarDayString(new Date());
      let isPast = false;
      try {
        if (toCalendarDayString(event.date) < todayStr) isPast = true;
      } catch {
        if (new Date(event.date).getTime() < Date.now()) isPast = true;
      }

      if (isPast) {
        await WorkRequirement.updateOne(
          { _id: requirementId, status: { $nin: ['closed', 'cancelled'] } },
          { $set: { status: 'closed' } }
        );
        throw ApiError.badRequest(
          `Cannot run worker selection: Event date (${toCalendarDayString(event.date)}) has already passed. Work requirement status changed to 'closed'.`
        );
      }
    }

    // Lock status to selection_in_progress
    let lockedRequirement = await WorkRequirement.findOneAndUpdate(
      {
        _id: initialRequirement._id,
        status: { $in: ['open', 'selection_in_progress'] },
      },
      { $set: { status: 'selection_in_progress' } },
      { new: true }
    );

    if (!lockedRequirement) {
      // If requirement is already 'filled', return current state safely
      const freshReq = await this.requirementRepository.findById(requirementId);
      if (freshReq && freshReq.status === 'filled') {
        return this.buildResult(freshReq, [], [], []);
      }
      throw ApiError.badRequest('Selection cannot proceed: Requirement is not in an open or selectable state');
    }

    // 2. Calculate remaining positions
    const existingAssigned = lockedRequirement.assignedWorkers || [];
    const previouslyAssignedWorkerIds = new Set(existingAssigned.map((a) => a.workerId.toString()));
    const remainingCount = Math.max(0, lockedRequirement.requiredCount - existingAssigned.length);

    if (remainingCount === 0) {
      // Already fully staffed
      const filledReq = await this.requirementRepository.updateById(requirementId, { status: 'filled' });
      return this.buildResult(filledReq || lockedRequirement, [], [], []);
    }

    // 3. Retrieve interested workers
    const responses = await this.responseRepository.findInterestedByRequirement(requirementId);

    const evaluatedCandidates: CandidateEvaluation[] = [];
    const excludedCandidates: Array<{ workerId: string; name: string; reason: string }> = [];

    // 4. Evaluate each interested candidate using location version valid at publication cutoff (§7, §14, §16)
    const publicationCutoff = lockedRequirement.interestPublishedAt;

    for (const resp of responses) {
      const workerIdStr = resp.workerId.toString();

      // If worker is already assigned from an earlier round, preserve without re-evaluating
      if (previouslyAssignedWorkerIds.has(workerIdStr)) {
        continue;
      }

      const user = await this.userRepository.findById(workerIdStr);
      if (!user) {
        excludedCandidates.push({ workerId: workerIdStr, name: 'Unknown', reason: 'Worker account not found' });
        continue;
      }

      const workerName = user.name || 'Worker';

      // Check account activation and status
      if (!user.isActive) {
        excludedCandidates.push({ workerId: workerIdStr, name: workerName, reason: 'Worker account is inactive' });
        evaluatedCandidates.push({
          workerId: workerIdStr,
          workerName,
          workerType: user.workerType || '',
          respondedAt: resp.respondedAt,
          distanceKm: 0,
          distanceScore: 0,
          eligible: false,
          ineligibilityReason: 'Worker account is inactive',
        });
        continue;
      }

      // Check workerType matches requirement
      if (user.workerType !== lockedRequirement.workerType) {
        excludedCandidates.push({
          workerId: workerIdStr,
          name: workerName,
          reason: `Worker type '${user.workerType}' does not match required '${lockedRequirement.workerType}'`,
        });
        evaluatedCandidates.push({
          workerId: workerIdStr,
          workerName,
          workerType: user.workerType || '',
          respondedAt: resp.respondedAt,
          distanceKm: 0,
          distanceScore: 0,
          eligible: false,
          ineligibilityReason: `Worker type '${user.workerType}' does not match requirement`,
        });
        continue;
      }

      // Check event coordinates validity
      const eventHasCoords = isValidCoordinate(event.location?.lat, event.location?.lng);

      // Resolve candidate's location version valid at the requirement's publication cutoff (§7, §14, §16)
      let historicalLocation: EffectiveWorkerLocation | null = null;
      if (publicationCutoff) {
        historicalLocation = await this.locationHistoryRepository.findEffectiveLocationAt(
          workerIdStr,
          publicationCutoff
        );
      }

      const effectiveCoords =
        historicalLocation && isValidCoordinate(historicalLocation.lat, historicalLocation.lng)
          ? historicalLocation
          : !publicationCutoff && user.location && isValidCoordinate(user.location.lat, user.location.lng)
          ? {
              address: user.location.address,
              lat: user.location.lat!,
              lng: user.location.lng!,
              effectiveFrom: user.location.confirmedAt || user.createdAt,
              versionId: undefined,
            }
          : null;

      if (!effectiveCoords || !eventHasCoords) {
        const reason = !effectiveCoords
          ? publicationCutoff
            ? 'Worker missing valid confirmed location at requirement publication cutoff'
            : 'Worker missing valid starting coordinates'
          : 'Event missing valid location coordinates';
        excludedCandidates.push({ workerId: workerIdStr, name: workerName, reason });
        evaluatedCandidates.push({
          workerId: workerIdStr,
          workerName,
          workerType: user.workerType || '',
          respondedAt: resp.respondedAt,
          distanceKm: 0,
          distanceScore: 0,
          eligible: false,
          ineligibilityReason: reason,
        });
        continue;
      }

      // Calculate Haversine distance
      const actualDistanceKm = calculateHaversineDistanceKm(
        effectiveCoords.lat,
        effectiveCoords.lng,
        event.location!.lat!,
        event.location!.lng!
      );

      // Enforce maximum distance limit
      const maxDistance = lockedRequirement.maxDistanceKm;
      if (maxDistance !== undefined && maxDistance > 0 && actualDistanceKm > maxDistance) {
        const reason = `Distance (${actualDistanceKm} km) exceeds maximum permitted limit (${maxDistance} km)`;
        excludedCandidates.push({ workerId: workerIdStr, name: workerName, reason });
        evaluatedCandidates.push({
          workerId: workerIdStr,
          workerName,
          workerType: user.workerType || '',
          respondedAt: resp.respondedAt,
          distanceKm: actualDistanceKm,
          distanceScore: calculateDistanceScore(actualDistanceKm, maxDistance),
          eligible: false,
          ineligibilityReason: reason,
        });
        continue;
      }

      // Strict same-calendar-day assignment check
      const sameDayCheck = await this.checkSameCalendarDayConflict(
        workerIdStr,
        event.date,
        lockedRequirement._id.toString()
      );
      if (sameDayCheck.hasConflict) {
        const reason = `Same-calendar-day assignment conflict with ${sameDayCheck.conflictingEventTitle || 'another event'}`;
        excludedCandidates.push({ workerId: workerIdStr, name: workerName, reason });
        evaluatedCandidates.push({
          workerId: workerIdStr,
          workerName,
          workerType: user.workerType || '',
          respondedAt: resp.respondedAt,
          distanceKm: actualDistanceKm,
          distanceScore: calculateDistanceScore(actualDistanceKm, maxDistance || 50),
          eligible: false,
          ineligibilityReason: reason,
        });
        continue;
      }

      // Candidate is fully eligible
      const distanceScore = calculateDistanceScore(actualDistanceKm, maxDistance || 50);
      evaluatedCandidates.push({
        workerId: workerIdStr,
        workerName,
        workerType: user.workerType || '',
        respondedAt: resp.respondedAt,
        distanceKm: actualDistanceKm,
        distanceScore,
        eligible: true,
      });
    }

    // 5. Rank eligible candidates deterministically using current ranking strategy
    const eligibleCandidates = evaluatedCandidates.filter((c) => c.eligible);
    const rankedEligible = this.rankingStrategy.rank(eligibleCandidates);

    // 6. Select up to remainingCount
    const selectedBatch = rankedEligible.slice(0, remainingCount);

    // 7. Persist selections safely and atomically
    const newAssignments = selectedBatch.map((c) => ({
      workerId: new mongoose.Types.ObjectId(c.workerId),
      assignedAt: new Date(),
      distanceKm: c.distanceKm,
      distanceScore: c.distanceScore,
      selectionRound: lockedRequirement.selectionRound || 1,
    }));

    const newTotalAssigned = existingAssigned.length + newAssignments.length;
    const finalStatus = newTotalAssigned >= lockedRequirement.requiredCount ? 'filled' : 'open';

    const updatedRequirement = await this.requirementRepository.appendAssignedWorkers(
      requirementId,
      newAssignments,
      finalStatus
    );

    // 8. Update WorkResponse records
    const selectedWorkerIds = new Set(selectedBatch.map((c) => c.workerId));
    for (const c of evaluatedCandidates) {
      const isSelected = selectedWorkerIds.has(c.workerId);
      const respStatus = isSelected ? 'selected' : 'not_selected';
      await this.responseRepository.updateManyStatus(requirementId, [c.workerId], {
        responseStatus: respStatus,
        selectedAt: isSelected ? new Date() : undefined,
        distanceKm: c.distanceKm,
        distanceScore: c.distanceScore,
        selectionRound: lockedRequirement.selectionRound || 1,
      });
    }

    const finalReq = updatedRequirement || lockedRequirement;

    return this.buildResult(
      finalReq,
      selectedBatch.map((s) => ({
        workerId: s.workerId,
        name: s.workerName,
        workerType: s.workerType,
        distanceKm: s.distanceKm,
        distanceScore: s.distanceScore,
        assignedAt: new Date(),
        selectionRound: lockedRequirement.selectionRound || 1,
      })),
      evaluatedCandidates,
      excludedCandidates
    );
  }

  /**
   * Helper to construct formatted SelectionResult
   */
  private buildResult(
    req: IWorkRequirement,
    selectedWorkers: any[],
    evaluatedCandidates: CandidateEvaluation[],
    excludedCandidates: any[]
  ): SelectionResult {
    const totalAssigned = req.assignedWorkers?.length || 0;
    const newlySelectedCount = selectedWorkers.length;
    const previouslyRetainedCount = Math.max(0, totalAssigned - newlySelectedCount);
    const remainingCount = Math.max(0, req.requiredCount - totalAssigned);

    return {
      requirementId: req._id.toString(),
      eventId: req.eventId.toString(),
      selectionRound: req.selectionRound || 1,
      requiredCount: req.requiredCount,
      previouslyRetainedCount,
      newlySelectedCount,
      totalAssignedCount: totalAssigned,
      remainingCount,
      status: req.status,
      selectedWorkers,
      evaluatedCandidates,
      excludedCandidates,
    };
  }
}

export const workerSelectionService = new WorkerSelectionService();
