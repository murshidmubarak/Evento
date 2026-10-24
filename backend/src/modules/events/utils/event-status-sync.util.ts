import mongoose from 'mongoose';
import { Event } from '../model/event.model.js';
import { WorkRequirement } from '../../work-requirements/model/work-requirement.model.js';
import { isEventDatePassed } from '../../worker-selection/utils/calendar-day.util.js';

/**
 * Synchronizes passed events to 'completed' status in a single batch operation.
 * - Only queries active candidates (status NOT 'completed' and NOT 'cancelled').
 * - Selects minimal fields without heavy populates or Mongoose document instantiation (.lean()).
 * - Updates all passed events in a single atomic updateMany call.
 * - Closes any active work requirements for these events in a single atomic updateMany call.
 */
export async function syncPassedEvents(filter: Record<string, any> = {}): Promise<void> {
  const query: Record<string, any> = {
    ...filter,
    status: { $nin: ['completed', 'cancelled'] },
  };

  const activeCandidates = await Event.find(query)
    .select('_id date endTime status')
    .lean();

  if (!activeCandidates || activeCandidates.length === 0) {
    return;
  }

  const passedIds: mongoose.Types.ObjectId[] = [];
  for (const evt of activeCandidates) {
    if (isEventDatePassed(evt.date, evt.endTime)) {
      passedIds.push(evt._id as any);
    }
  }

  if (passedIds.length === 0) {
    return;
  }

  // 1 single batch write to update all passed events to 'completed'
  await Event.updateMany(
    { _id: { $in: passedIds } },
    { $set: { status: 'completed' } }
  );

  // 1 single batch write to close any active work requirements for these events
  await WorkRequirement.updateMany(
    { eventId: { $in: passedIds }, status: { $nin: ['closed', 'cancelled'] } },
    { $set: { status: 'closed' } }
  );
}

/**
 * Single-event auto-completion helper for single event detail endpoints.
 */
export async function autoCheckSingleEventCompleted(event: any): Promise<any> {
  if (!event) return event;
  if (event.status !== 'completed' && event.status !== 'cancelled' && isEventDatePassed(event.date, event.endTime)) {
    await Event.findByIdAndUpdate(event._id, { status: 'completed' });
    event.status = 'completed';
    await WorkRequirement.updateMany(
      { eventId: event._id, status: { $nin: ['closed', 'cancelled'] } },
      { $set: { status: 'closed' } }
    );
  }
  return event;
}
