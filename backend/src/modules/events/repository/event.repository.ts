import { Event, type IEvent } from '../model/event.model.js';

export class EventRepository {
  async create(eventData: Partial<IEvent>): Promise<IEvent> {
    const event = new Event(eventData);
    return (await event.save()) as unknown as Promise<IEvent>;
  }

  async findById(id: string): Promise<IEvent | null> {
    return Event.findById(id).populate('selectedServices') as unknown as Promise<IEvent | null>;
  }

  async findByClientId(clientId: string): Promise<IEvent[]> {
    return Event.find({ clientId }).sort({ createdAt: -1 }).populate('selectedServices') as unknown as Promise<IEvent[]>;
  }

  async findActiveAssignedEventsForDateRange(startDate: Date, endDate: Date): Promise<IEvent[]> {
    return Event.find({
      eventManagerId: { $exists: true, $ne: null },
      status: { $nin: ['completed', 'cancelled'] },
      date: { $gte: startDate, $lte: endDate }
    }).select('eventManagerId startTime endTime').exec() as unknown as Promise<IEvent[]>;
  }
}
