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

  async findByManagerId(managerId: string, filters: any = {}): Promise<IEvent[]> {
    const query: any = { eventManagerId: managerId };
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.date) {
      query.date = new Date(filters.date);
    } else {
      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) query.date.$gte = new Date(filters.startDate);
        if (filters.endDate) query.date.$lte = new Date(filters.endDate);
      }
    }

    return Event.find(query)
      .sort({ date: 1, startTime: 1 })
      .populate('selectedServices') as unknown as Promise<IEvent[]>;
  }

  async getManagerDashboardStats(managerId: string): Promise<any> {
    const totalAssigned = await Event.countDocuments({ eventManagerId: managerId });
    const upcoming = await Event.countDocuments({ eventManagerId: managerId, status: 'confirmed' });
    const ongoing = await Event.countDocuments({ eventManagerId: managerId, status: 'in_progress' });
    const completed = await Event.countDocuments({ eventManagerId: managerId, status: 'completed' });

    return { totalAssigned, upcoming, ongoing, completed };
  }
}
