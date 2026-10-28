import mongoose from 'mongoose';
import { WorkRequirementRepository } from '../repository/work-requirement.repository.js';
import { WorkResponseRepository } from '../repository/work-response.repository.js';
import { UserRepository } from '../../auth/repository/user.repository.js';
import { EventRepository } from '../../events/repository/event.repository.js';
import {
  WorkerLocationHistoryRepository,
  type EffectiveWorkerLocation,
} from '../repository/worker-location-history.repository.js';
import { User } from '../../auth/model/user.model.js';
import { WorkResponse } from '../model/work-response.model.js';
import { WorkRequirement } from '../model/work-requirement.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import {
  calculateHaversineDistanceKm,
  isValidCoordinate,
} from '../../worker-selection/utils/distance.util.js';
import { toCalendarDayString } from '../../worker-selection/utils/calendar-day.util.js';
import { workerSelectionService } from '../../worker-selection/service/worker-selection.service.js';

export class WorkerOpportunityService {
  private requirementRepository: WorkRequirementRepository;
  private responseRepository: WorkResponseRepository;
  private userRepository: UserRepository;
  private eventRepository: EventRepository;
  private locationHistoryRepository: WorkerLocationHistoryRepository;

  constructor() {
    this.requirementRepository = new WorkRequirementRepository();
    this.responseRepository = new WorkResponseRepository();
    this.userRepository = new UserRepository();
    this.eventRepository = new EventRepository();
    this.locationHistoryRepository = new WorkerLocationHistoryRepository();
  }

  private async getActiveWorker(workerId: string) {
    if (!mongoose.Types.ObjectId.isValid(workerId)) {
      throw ApiError.badRequest('Invalid worker ID format');
    }

    const user = await this.userRepository.findById(workerId);
    if (!user) {
      throw ApiError.notFound('Worker account not found');
    }
    if (user.role !== 'worker') {
      throw ApiError.forbidden('Only worker accounts can access work opportunities');
    }
    if (!user.isActive) {
      throw ApiError.forbidden('Worker account is inactive');
    }

    return user;
  }

  /**
   * Retrieves available open work opportunities matching the worker's category.
   */
  async getAvailableOpportunities(workerId: string): Promise<any[]> {
    const worker = await this.getActiveWorker(workerId);

    // Mandatory Location Gate (§4): Worker must have valid confirmed location
    if (!isValidCoordinate(worker.location?.lat, worker.location?.lng)) {
      throw ApiError.badRequest(
        'Location configuration required. Please select and confirm your current location before accessing work opportunities.',
        ['LOCATION_REQUIRED']
      );
    }

    const workerType = worker.workerType;
    if (!workerType) {
      return [];
    }

    // 1. Find requirements open for interest matching worker's specialization
    const openRequirements = await this.requirementRepository.findAvailableRequirementsForWorker(workerType);

    // 2. Fetch worker's existing responses
    const workerResponses = await this.responseRepository.findByWorkerId(workerId);
    const responseMap = new Map<string, string>();
    for (const r of workerResponses) {
      responseMap.set(r.requirementId.toString(), r.responseStatus);
    }

    const results = [];
    const now = Date.now();
    const todayStr = toCalendarDayString(new Date());

    for (const req of openRequirements) {
      // 1. Deadline met / expired check: Must vanish from available opportunities
      if (!req.interestDeadlineAt || req.interestDeadlineAt.getTime() <= now) {
        continue;
      }

      // 2. Status must be 'open'
      if (req.status !== 'open') {
        continue;
      }

      const event = req.eventId as any;
      if (!event || event.status !== 'confirmed') {
        continue;
      }

      // 3. If event day has passed, mark requirement as closed and vanish from available opportunities
      if (event.date) {
        let isPast = false;
        try {
          const eventDayStr = toCalendarDayString(event.date);
          if (eventDayStr < todayStr) isPast = true;
        } catch {
          if (new Date(event.date).getTime() < now) isPast = true;
        }

        if (isPast) {
          WorkRequirement.updateOne(
            { _id: req._id, status: { $nin: ['closed', 'cancelled'] } },
            { $set: { status: 'closed' } }
          ).exec().catch((err) => {
            console.error(`Failed to close past-event work requirement ${req._id}:`, err);
          });
          continue;
        }
      }

      // 4. If event coordinates are missing or invalid, do not conduct distance-based selection
      if (!isValidCoordinate(event.location?.lat, event.location?.lng)) {
        continue;
      }

      // 5. Worker assigned check: Do not show confirmed/assigned in available opportunities
      const isAssigned = (req.assignedWorkers || []).some(
        (a: any) => a.workerId?.toString() === workerId
      );
      if (isAssigned) {
        continue;
      }

      // 6. Response status check: Do not show confirmed or rejected requirements in available opportunities
      const myResponseStatus = responseMap.get(req._id.toString()) || 'not_responded';
      if (myResponseStatus === 'selected' || myResponseStatus === 'not_selected') {
        continue;
      }

      const hasResponded = responseMap.has(req._id.toString());

      // Historical publication cutoff (§6, §16):
      // Each work requirement establishes its immutable location cutoff at publication.
      // For legacy pre-history requirements without interestPublishedAt, fall back to current location (§16).
      const publicationCutoff = req.interestPublishedAt;
      let historicalLocation: EffectiveWorkerLocation | null = null;

      if (publicationCutoff) {
        historicalLocation = await this.locationHistoryRepository.findEffectiveLocationAt(
          workerId,
          publicationCutoff
        );

        // A Worker without a valid confirmed location at publication cutoff cannot become
        // eligible for that already-published requirement (§7, §16).
        if (!historicalLocation || !isValidCoordinate(historicalLocation.lat, historicalLocation.lng)) {
          if (!hasResponded) {
            continue;
          }
        }
      }

      // Calculate distance between worker's location (historical version if published with cutoff, else current) and event venue
      const coordsToUse =
        historicalLocation && isValidCoordinate(historicalLocation.lat, historicalLocation.lng)
          ? historicalLocation
          : worker.location!;

      const distanceKm = calculateHaversineDistanceKm(
        coordsToUse.lat!,
        coordsToUse.lng!,
        event.location.lat!,
        event.location.lng!
      );

      // Distance eligibility: actualDistanceKm <= maxDistanceKm
      const maxDistance = req.maxDistanceKm;
      const withinDistance =
        maxDistance !== undefined && maxDistance > 0 ? distanceKm <= maxDistance : true;

      // Exclude requirements beyond maximum permitted distance UNLESS worker already applied/responded
      if (!withinDistance && !hasResponded) {
        continue;
      }

      // Check same-calendar-day conflict
      let hasCalendarConflict = false;
      if (event.date) {
        const conflictCheck = await workerSelectionService.checkSameCalendarDayConflict(
          workerId,
          event.date,
          req._id.toString()
        );
        hasCalendarConflict = conflictCheck.hasConflict;
      }

      results.push({
        id: req._id.toString(),
        eventId: event._id.toString(),
        eventTitle: event.title,
        eventType: event.eventType,
        eventDate: event.date,
        eventLocation: {
          address: event.location?.address || 'Event Venue',
        },
        workerType: req.workerType,
        requiredCount: req.requiredCount,
        reportingTime: req.reportingTime,
        description: req.description,
        maxDistanceKm: req.maxDistanceKm,
        interestDeadlineAt: req.interestDeadlineAt,
        interestPublishedAt: req.interestPublishedAt,
        status: req.status,
        selectionRound: req.selectionRound,
        distanceKm,
        withinDistance,
        isAssigned: false,
        hasCalendarConflict,
        hasExpressedInterest: hasResponded,
        myResponseStatus,
      });
    }

    // Sort by event date ascending
    results.sort((a, b) => new Date(a.eventDate || 0).getTime() - new Date(b.eventDate || 0).getTime());

    return results;
  }

  /**
   * Identifies all genuinely eligible workers for a specific Work Requirement publication announcement.
   * Enforces all 8 canonical eligibility constraints:
   * 1. Active worker account with role 'worker'
   * 2. workerType matches requirement.workerType exactly
   * 3. Mandatory Location Gate: Worker profile has valid coordinates
   * 4. Requirement is open and belongs to a confirmed event with valid venue coordinates
   * 5. No same-calendar-day conflict on event date across all events
   * 6. Immutable location history: Worker has a valid historical location version at interestPublishedAt cutoff
   * 7. Haversine distance from effective historical location to event venue <= maxDistanceKm
   * 8. Worker is not already assigned
   */
  async findEligibleWorkersForOpportunity(requirementId: string): Promise<string[]> {
    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      return [];
    }

    const req = await this.requirementRepository.findById(requirementId);
    if (!req || req.status !== 'open' || !req.workerType) {
      return [];
    }

    const event = await this.eventRepository.findById(req.eventId.toString());
    if (!event || event.status !== 'confirmed') {
      return [];
    }

    if (!isValidCoordinate(event.location?.lat, event.location?.lng)) {
      return [];
    }

    // Query active workers of matching specialization
    const candidateWorkers = await User.find({
      role: 'worker',
      isActive: true,
      workerType: req.workerType,
      'location.lat': { $exists: true, $ne: null },
      'location.lng': { $exists: true, $ne: null },
    }).lean();

    const eligibleWorkerIds: string[] = [];
    const publicationCutoff = req.interestPublishedAt || new Date();

    for (const worker of candidateWorkers) {
      const workerIdStr = worker._id.toString();

      // 1. Mandatory Location Gate check
      if (!isValidCoordinate(worker.location?.lat, worker.location?.lng)) {
        continue;
      }

      // 2. Already assigned check
      const isAssigned = (req.assignedWorkers || []).some(
        (a: any) => a.workerId?.toString() === workerIdStr
      );
      if (isAssigned) {
        continue;
      }

      // 3. Calendar conflict check on event day
      if (event.date) {
        const conflict = await workerSelectionService.checkSameCalendarDayConflict(
          workerIdStr,
          event.date,
          req._id.toString()
        );
        if (conflict.hasConflict) {
          continue;
        }
      }

      // 4. Historical publication cutoff location version
      let historicalLocation: EffectiveWorkerLocation | null = null;
      if (req.interestPublishedAt) {
        historicalLocation = await this.locationHistoryRepository.findEffectiveLocationAt(
          workerIdStr,
          publicationCutoff
        );
        if (!historicalLocation || !isValidCoordinate(historicalLocation.lat, historicalLocation.lng)) {
          // Ineligible because no valid location on file at cutoff
          continue;
        }
      }

      const coordsToUse =
        historicalLocation && isValidCoordinate(historicalLocation.lat, historicalLocation.lng)
          ? historicalLocation
          : worker.location!;

      // 5. Distance check
      const distanceKm = calculateHaversineDistanceKm(
        coordsToUse.lat!,
        coordsToUse.lng!,
        event.location.lat!,
        event.location.lng!
      );

      const maxDistance = req.maxDistanceKm;
      if (maxDistance !== undefined && maxDistance > 0 && distanceKm > maxDistance) {
        continue;
      }

      eligibleWorkerIds.push(workerIdStr);
    }

    return eligibleWorkerIds;
  }

  /**
   * Allows an eligible worker to express interest in a specific Work Requirement.
   */
  async expressInterest(workerId: string, requirementId: string): Promise<any> {
    const worker = await this.getActiveWorker(workerId);

    if (!mongoose.Types.ObjectId.isValid(requirementId)) {
      throw ApiError.badRequest('Invalid work requirement ID format');
    }

    const requirement = await this.requirementRepository.findById(requirementId);
    if (!requirement) {
      throw ApiError.notFound('Work requirement not found');
    }

    if (requirement.status !== 'open') {
      throw ApiError.badRequest(`This work requirement is not open for interest. Current status: '${requirement.status}'`);
    }

    // Check interest deadline
    if (!requirement.interestDeadlineAt || requirement.interestDeadlineAt.getTime() <= Date.now()) {
      throw ApiError.badRequest('The interest deadline for this work requirement has expired');
    }

    // Check event confirmation
    const event = await this.eventRepository.findById(requirement.eventId.toString());
    if (!event || event.status !== 'confirmed') {
      throw ApiError.badRequest('The event for this requirement is not eligible');
    }

    // Check if event day has passed: close requirement if so
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
          { _id: requirement._id, status: { $nin: ['closed', 'cancelled'] } },
          { $set: { status: 'closed' } }
        );
        throw ApiError.badRequest('Cannot express interest: Event date has already passed. This work requirement is now closed.');
      }
    }

    // Check worker type match
    if (worker.workerType !== requirement.workerType) {
      throw ApiError.badRequest(
        `Your worker type '${worker.workerType}' does not match the requirement's role '${requirement.workerType}'`
      );
    }

    // Check if already assigned
    const alreadyAssigned = (requirement.assignedWorkers || []).some(
      (a) => a.workerId.toString() === workerId
    );
    if (alreadyAssigned) {
      throw ApiError.badRequest('You are already assigned to this work requirement');
    }

    // Check if duplicate interest already submitted
    const existingResponse = await this.responseRepository.findByRequirementAndWorker(
      requirementId,
      workerId
    );
    if (existingResponse) {
      throw ApiError.badRequest('You have already expressed interest in this work requirement');
    }

    // Check strict same-calendar-day conflict
    if (event.date) {
      const conflictCheck = await workerSelectionService.checkSameCalendarDayConflict(
        workerId,
        event.date,
        requirementId
      );
      if (conflictCheck.hasConflict) {
        throw ApiError.badRequest(
          `Cannot express interest: You already have a confirmed work assignment on this calendar day (${toCalendarDayString(event.date)})`
        );
      }
    }

    // Mandatory Location Gate (§4)
    if (!isValidCoordinate(worker.location?.lat, worker.location?.lng)) {
      throw ApiError.badRequest(
        'Location configuration required. You must set and confirm your current location before expressing interest in work requirements.',
        ['LOCATION_REQUIRED']
      );
    }

    // Venue coordinates verification
    if (!isValidCoordinate(event.location?.lat, event.location?.lng)) {
      throw ApiError.badRequest('This event venue location is not configured with valid coordinates for distance verification.');
    }

    // Immutable Location History Cutoff (§6, §7, §16):
    // Retrieve the location version that was valid at requirement's publication cutoff.
    // For legacy pre-history requirements created without interestPublishedAt, fall back to current location (§16).
    const publicationCutoff = requirement.interestPublishedAt;
    let historicalLocation: EffectiveWorkerLocation | null = null;

    if (publicationCutoff) {
      historicalLocation = await this.locationHistoryRepository.findEffectiveLocationAt(
        workerId,
        publicationCutoff
      );

      if (!historicalLocation || !isValidCoordinate(historicalLocation.lat, historicalLocation.lng)) {
        throw ApiError.badRequest(
          'You did not have a confirmed location on file when this work requirement was published, and cannot express interest in it.',
          ['NO_HISTORICAL_LOCATION']
        );
      }
    }

    const effectiveCoords =
      historicalLocation && isValidCoordinate(historicalLocation.lat, historicalLocation.lng)
        ? historicalLocation
        : {
            address: worker.location?.address || 'Confirmed Location',
            lat: worker.location!.lat!,
            lng: worker.location!.lng!,
            effectiveFrom: worker.location?.confirmedAt || new Date(),
            versionId: undefined,
          };

    // Location coordinates & distance validation
    const distanceKm = calculateHaversineDistanceKm(
      effectiveCoords.lat,
      effectiveCoords.lng,
      event.location.lat!,
      event.location.lng!
    );

    if (requirement.maxDistanceKm !== undefined && requirement.maxDistanceKm > 0 && distanceKm > requirement.maxDistanceKm) {
      throw ApiError.badRequest(
        `Your distance (${distanceKm} km as of requirement publication) exceeds the maximum permitted distance (${requirement.maxDistanceKm} km) for this requirement`
      );
    }

    // Server authoritative submission timestamp
    const authoritativeTimestamp = new Date();

    const response = await this.responseRepository.create({
      requirementId: requirement._id as any,
      workerId: worker._id as any,
      eventId: event._id as any,
      responseStatus: 'interested',
      respondedAt: authoritativeTimestamp,
      distanceKm,
      selectionRound: requirement.selectionRound || 1,
      locationSnapshot: {
        address: effectiveCoords.address || 'Confirmed Location',
        lat: effectiveCoords.lat,
        lng: effectiveCoords.lng,
        confirmedAt: (effectiveCoords as any).effectiveFrom || authoritativeTimestamp,
        versionId: effectiveCoords.versionId,
      },
    });

    return response;
  }

  /**
   * Updates and confirms the worker's current location.
   * Creates an immutable location version in history for future opportunities (§4, §5).
   * Does NOT alter pending work responses or recalculate distances for already-published requirements (§5, §8).
   */
  async updateWorkerLocation(
    workerId: string,
    coords: { lat: number; lng: number; address?: string }
  ): Promise<any> {
    const worker = await this.getActiveWorker(workerId);

    if (!isValidCoordinate(coords.lat, coords.lng)) {
      throw ApiError.badRequest(
        'Invalid coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.',
        ['INVALID_COORDINATES']
      );
    }

    const trimmedAddress = coords.address?.trim() || worker.location?.address || 'Confirmed Location';

    // Anti-redundancy check (§5): If coordinates and address are identical, do not create duplicate version
    const curr = worker.location;
    const isIdentical =
      curr &&
      isValidCoordinate(curr.lat, curr.lng) &&
      Math.abs((curr.lat ?? 0) - coords.lat) < 0.00001 &&
      Math.abs((curr.lng ?? 0) - coords.lng) < 0.00001 &&
      (curr.address || '').trim() === trimmedAddress;

    if (isIdentical) {
      return {
        id: worker._id.toString(),
        name: worker.name,
        email: worker.email,
        role: worker.role,
        workerType: worker.workerType,
        businessId: worker.businessId,
        isActive: worker.isActive,
        location: worker.location,
      };
    }

    const confirmedAt = new Date();

    // 1. Create an immutable version in location history (§4, §5)
    await this.locationHistoryRepository.createVersion({
      workerId,
      address: trimmedAddress,
      lat: coords.lat,
      lng: coords.lng,
      effectiveFrom: confirmedAt,
    });

    // 2. Update worker profile with the new latest location
    const updatedUser = await User.findByIdAndUpdate(
      workerId,
      {
        $set: {
          location: {
            address: trimmedAddress,
            lat: coords.lat,
            lng: coords.lng,
            confirmedAt,
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      throw ApiError.notFound('Worker user not found');
    }

    // NOTE: Per §5 & §8 anti-manipulation rules, updating the current profile location
    // affects ONLY future opportunities. Pending responses and published requirements
    // preserve the historical location version that was valid at their respective cutoffs.

    return {
      id: updatedUser._id.toString(),
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      workerType: updatedUser.workerType,
      businessId: updatedUser.businessId,
      isActive: updatedUser.isActive,
      location: updatedUser.location,
    };
  }

  /**
   * Retrieves the current saved location for a worker.
   */
  async getWorkerLocation(workerId: string): Promise<any> {
    const worker = await this.getActiveWorker(workerId);
    return worker.location || null;
  }

  /**
   * Retrieves all confirmed assignments for this worker.
   */
  async getWorkerAssignments(workerId: string): Promise<any[]> {
    await this.getActiveWorker(workerId);

    const requirements = await this.requirementRepository.findAssignedRequirementsByWorker(workerId);

    const assignments = [];
    const todayStr = toCalendarDayString(new Date());

    for (const req of requirements) {
      if (req.status === 'cancelled') continue;

      const event = req.eventId as any;
      if (!event || event.status === 'cancelled') continue;

      // Filter out if event day has passed
      if (event.date) {
        try {
          const eventDayStr = toCalendarDayString(event.date);
          if (eventDayStr < todayStr) continue;
        } catch {
          if (new Date(event.date).getTime() < Date.now()) continue;
        }
      }

      const assignmentRecord = (req.assignedWorkers || []).find(
        (a) => a.workerId.toString() === workerId
      );

      assignments.push({
        requirementId: req._id.toString(),
        eventId: event._id.toString(),
        eventTitle: event.title,
        eventType: event.eventType,
        eventDate: event.date,
        eventLocation: event.location,
        workerType: req.workerType,
        reportingTime: req.reportingTime,
        description: req.description,
        assignedAt: assignmentRecord?.assignedAt || req.updatedAt,
        distanceKm: assignmentRecord?.distanceKm,
      });
    }

    return assignments;
  }
}

export const workerOpportunityService = new WorkerOpportunityService();

