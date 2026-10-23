import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import '../src/modules/services/model/service.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { WorkResponse } from '../src/modules/work-requirements/model/work-response.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import { WorkerOpportunityService } from '../src/modules/work-requirements/service/worker-opportunity.service.js';
import { WorkRequirementService } from '../src/modules/work-requirements/service/work-requirement.service.js';
import { workerSelectionService } from '../src/modules/worker-selection/service/worker-selection.service.js';
import { workerSelectionQueueService } from '../src/modules/worker-selection/queues/worker-selection.queue.js';

describe('Work Requirement Status Lifecycle: Event Day Passed -> Status: closed', () => {
  let managerId: string;
  let workerId: string;
  let clientId: string;
  let pastEventId: string;
  let futureEventId: string;

  let workerOppService: WorkerOpportunityService;
  let workReqService: WorkRequirementService;

  before(async () => {
    await connectDB();
    workerOppService = new WorkerOpportunityService();
    workReqService = new WorkRequirementService();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    await WorkResponse.deleteMany({});
    await User.deleteMany({});

    const manager = await User.create({
      name: 'Manager Test',
      email: 'manager_test@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerId = manager._id.toString();

    const worker = await User.create({
      name: 'Chef Worker',
      email: 'chef_worker@example.com',
      password: 'password',
      role: 'worker',
      workerType: 'Chef',
      isActive: true,
      location: {
        address: 'Downtown',
        lat: 12.9716,
        lng: 77.5946,
        confirmedAt: new Date(),
      },
    });
    workerId = worker._id.toString();

    const client = await User.create({
      name: 'Client Test',
      email: 'client_test@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });
    clientId = client._id.toString();

    // Past event (e.g. 5 days ago)
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const pastEvt = await Event.create({
      clientId,
      eventManagerId: managerId,
      title: 'Past Event',
      eventType: 'Wedding',
      date: pastDate,
      startTime: '10:00',
      endTime: '16:00',
      location: { address: 'Venue A', lat: 12.9716, lng: 77.5946 },
      guestCount: 100,
      status: 'confirmed',
    });
    pastEventId = pastEvt._id.toString();

    // Future event (e.g. 5 days in the future)
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const futureEvt = await Event.create({
      clientId,
      eventManagerId: managerId,
      title: 'Future Event',
      eventType: 'Wedding',
      date: futureDate,
      startTime: '10:00',
      endTime: '16:00',
      location: { address: 'Venue B', lat: 12.9716, lng: 77.5946 },
      guestCount: 100,
      status: 'confirmed',
    });
    futureEventId = futureEvt._id.toString();
  });

  it('1. getAvailableOpportunities automatically closes open requirement whose event day has passed', async () => {
    // Create open requirement on past event
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // Deadline hasn't passed, but event day HAS passed
      status: 'open',
      interestPublishedAt: new Date(),
    });

    const opps = await workerOppService.getAvailableOpportunities(workerId);
    // Should not be in available opportunities
    const foundInOpps = opps.find((o) => o._id === pastReq._id.toString());
    assert.equal(foundInOpps, undefined, 'Past event requirement must not be available');

    // Give asynchronous update a tiny tick to persist
    await new Promise((r) => setTimeout(r, 100));

    // Must be updated to 'closed' in DB
    const updated = await WorkRequirement.findById(pastReq._id);
    assert.equal(updated?.status, 'closed', 'Work requirement status must transition to closed');
  });

  it('2. expressInterest transitions status to closed and rejects when event day has passed', async () => {
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: 'open',
      interestPublishedAt: new Date(),
    });

    await assert.rejects(
      async () => {
        await workerOppService.expressInterest(workerId, pastReq._id.toString());
      },
      /event date has already passed.*closed/i
    );

    const updated = await WorkRequirement.findById(pastReq._id);
    assert.equal(updated?.status, 'closed', 'Requirement must be marked closed');
  });

  it('3. extendDeadline transitions status to closed and rejects when event day has passed', async () => {
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 60 * 60 * 1000), // deadline passed
      status: 'open',
      selectionRound: 1,
      interestPublishedAt: new Date(),
    });

    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await assert.rejects(
      async () => {
        await workReqService.extendDeadline(managerId, pastReq._id.toString(), futureDeadline);
      },
      /event day has already passed and this work requirement is now closed/i
    );

    const updated = await WorkRequirement.findById(pastReq._id);
    assert.equal(updated?.status, 'closed', 'Requirement must be closed');
  });

  it('4. executeSelection transitions status to closed and aborts when event day has passed', async () => {
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 60 * 60 * 1000), // deadline passed
      status: 'open',
      selectionRound: 1,
      interestPublishedAt: new Date(),
    });

    await assert.rejects(
      async () => {
        await workerSelectionService.executeSelection(pastReq._id.toString(), 1);
      },
      /event date.*has already passed.*status changed to 'closed'/i
    );

    const updated = await WorkRequirement.findById(pastReq._id);
    assert.equal(updated?.status, 'closed', 'Requirement must be closed');
  });

  it('5. scanAndProcessExpiredDeadlines auto-closes requirements whose event day has passed', async () => {
    const pastReq = await WorkRequirement.create({
      eventId: pastEventId,
      workerType: 'Chef',
      requiredCount: 2,
      reportingTime: '09:00',
      maxDistanceKm: 25,
      interestDeadlineAt: new Date(Date.now() - 60 * 60 * 1000), // expired deadline
      status: 'open',
      selectionRound: 1,
      interestPublishedAt: new Date(),
    });

    await workerSelectionQueueService.scanAndProcessExpiredDeadlines();

    const updated = await WorkRequirement.findById(pastReq._id);
    assert.equal(updated?.status, 'closed', 'Requirement must be closed by background scan');
  });
});
