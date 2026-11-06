import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import '../src/modules/auth/model/user.model.js';
import '../src/modules/events/model/event.model.js';
import { AttendanceSession } from '../src/modules/attendance/model/attendance-session.model.js';
import { Attendance } from '../src/modules/attendance/model/attendance.model.js';
import { attendanceSessionRepository } from '../src/modules/attendance/repository/attendance-session.repository.js';
import { attendanceRepository } from '../src/modules/attendance/repository/attendance.repository.js';
import {
  isValidTimeString,
  validateCheckInFinalization,
  validateCheckOutFinalization,
  validateAttendanceCorrection,
  validateAttendanceVerification,
} from '../src/modules/attendance/validation/attendance.validation.js';

describe('Milestone 4 — Phase 4.1: Attendance Models, Repositories & Validation', () => {
  before(async () => {
    await connectDB();
    // Ensure test indexes are built
    await AttendanceSession.syncIndexes();
    await Attendance.syncIndexes();
  });

  after(async () => {
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await AttendanceSession.deleteMany({});
    await Attendance.deleteMany({});
  });

  // ---------------------------------------------------------------------------
  // 1. Validation Utilities & Middlewares
  // ---------------------------------------------------------------------------
  describe('Time String Validation (isValidTimeString)', () => {
    it('accepts valid 24-hour time strings and normalizes them', () => {
      const res1 = isValidTimeString('08:30');
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.normalized24h, '08:30');

      const res2 = isValidTimeString('19:45');
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.normalized24h, '19:45');

      const res3 = isValidTimeString('9:05');
      assert.strictEqual(res3.valid, true);
      assert.strictEqual(res3.normalized24h, '09:05');

      const res4 = isValidTimeString('08:30:00');
      assert.strictEqual(res4.valid, true);
      assert.strictEqual(res4.normalized24h, '08:30');
    });

    it('accepts valid 12-hour AM/PM time strings and normalizes to 24-hour', () => {
      const res1 = isValidTimeString('08:30 AM');
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.normalized24h, '08:30');

      const res2 = isValidTimeString('08:30 PM');
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.normalized24h, '20:30');

      const res3 = isValidTimeString('12:15 PM');
      assert.strictEqual(res3.valid, true);
      assert.strictEqual(res3.normalized24h, '12:15');

      const res4 = isValidTimeString('12:45 AM');
      assert.strictEqual(res4.valid, true);
      assert.strictEqual(res4.normalized24h, '00:45');

      const res5 = isValidTimeString('08:30:00 AM');
      assert.strictEqual(res5.valid, true);
      assert.strictEqual(res5.normalized24h, '08:30');

      const res6 = isValidTimeString('00:30 AM');
      assert.strictEqual(res6.valid, true);
      assert.strictEqual(res6.normalized24h, '00:30');
    });

    it('accepts valid ISO datetime strings and extracts HH:mm', () => {
      const res = isValidTimeString('2026-11-06T19:00:00.000Z');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.normalized24h, '19:00');
    });

    it('rejects invalid or non-time strings', () => {
      assert.strictEqual(isValidTimeString('25:00').valid, false);
      assert.strictEqual(isValidTimeString('12:65').valid, false);
      assert.strictEqual(isValidTimeString('invalid_time').valid, false);
      assert.strictEqual(isValidTimeString('').valid, false);
      assert.strictEqual(isValidTimeString(null).valid, false);
      assert.strictEqual(isValidTimeString(undefined).valid, false);
    });
  });

  describe('Check-In Finalization Validation (validateCheckInFinalization)', () => {
    it('passes on valid check-in finalization payload', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const lateWorker = new mongoose.Types.ObjectId().toString();
      const absentWorker = new mongoose.Types.ObjectId().toString();

      const req: any = {
        params: { eventId },
        body: {
          lateExceptions: [{ workerId: lateWorker, actualArrivalTime: '09:15 AM' }],
          absentExceptions: [absentWorker],
        },
      };
      let nextCalledWith: any = null;
      validateCheckInFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.strictEqual(nextCalledWith, undefined);
    });

    it('fails when eventId is invalid', () => {
      const req: any = {
        params: { eventId: 'invalid-id' },
        body: {},
      };
      let nextCalledWith: any = null;
      validateCheckInFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('Invalid event ID format')));
    });

    it('fails when late exception has invalid actualArrivalTime', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const req: any = {
        params: { eventId },
        body: {
          lateExceptions: [{ workerId: new mongoose.Types.ObjectId().toString(), actualArrivalTime: 'bad-time' }],
        },
      };
      let nextCalledWith: any = null;
      validateCheckInFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('actualArrivalTime')));
    });

    it('fails when duplicate workerId is present in lateExceptions or absentExceptions', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const workerId = new mongoose.Types.ObjectId().toString();
      const req: any = {
        params: { eventId },
        body: {
          lateExceptions: [
            { workerId, actualArrivalTime: '08:30' },
            { workerId, actualArrivalTime: '08:45' },
          ],
        },
      };
      let nextCalledWith: any = null;
      validateCheckInFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('Duplicate workerId')));
    });

    it('fails when a worker appears in BOTH late and absent exceptions', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const workerId = new mongoose.Types.ObjectId().toString();
      const req: any = {
        params: { eventId },
        body: {
          lateExceptions: [{ workerId, actualArrivalTime: '08:30' }],
          absentExceptions: [workerId],
        },
      };
      let nextCalledWith: any = null;
      validateCheckInFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('both late and absent')));
    });
  });

  describe('Check-Out Finalization Validation (validateCheckOutFinalization)', () => {
    it('passes on valid check-out payload with overrides and exceptions', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const reqId = new mongoose.Types.ObjectId().toString();
      const earlyWorker = new mongoose.Types.ObjectId().toString();
      const otWorker = new mongoose.Types.ObjectId().toString();

      const req: any = {
        params: { eventId },
        body: {
          actualNormalFinishTime: '18:00',
          requirementFinishOverrides: [{ requirementId: reqId, normalFinishTime: '19:30' }],
          earlyDepartureExceptions: [{ workerId: earlyWorker, actualCheckoutTime: '17:00' }],
          overtimeExceptions: [{ workerId: otWorker, actualCheckoutTime: '20:00' }],
        },
      };
      let nextCalledWith: any = null;
      validateCheckOutFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.strictEqual(nextCalledWith, undefined);
    });

    it('fails when actualNormalFinishTime is missing', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const req: any = {
        params: { eventId },
        body: {},
      };
      let nextCalledWith: any = null;
      validateCheckOutFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('actualNormalFinishTime')));
    });

    it('fails when a worker appears in BOTH early departure and overtime exceptions', () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const workerId = new mongoose.Types.ObjectId().toString();
      const req: any = {
        params: { eventId },
        body: {
          actualNormalFinishTime: '18:00',
          earlyDepartureExceptions: [{ workerId, actualCheckoutTime: '16:00' }],
          overtimeExceptions: [{ workerId, actualCheckoutTime: '20:00' }],
        },
      };
      let nextCalledWith: any = null;
      validateCheckOutFinalization(req, {} as any, (err?: any) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.strictEqual(nextCalledWith.statusCode, 400);
      assert.ok(nextCalledWith.errors.some((e: string) => e.includes('both early departure and overtime')));
    });
  });

  describe('Attendance Correction & Verification Validation', () => {
    it('validateAttendanceCorrection validates reason length and status', () => {
      const id = new mongoose.Types.ObjectId().toString();

      // Missing reason
      const req1: any = { params: { id }, body: { reason: 'hi' } };
      let err1: any = null;
      validateAttendanceCorrection(req1, {} as any, (err?: any) => { err1 = err; });
      assert.ok(err1);
      assert.ok(err1.errors.some((e: string) => e.includes('at least 5 characters')));

      // Invalid status
      const req2: any = { params: { id }, body: { reason: 'Valid correction reason', status: 'invalid_status' } };
      let err2: any = null;
      validateAttendanceCorrection(req2, {} as any, (err?: any) => { err2 = err; });
      assert.ok(err2);
      assert.ok(err2.errors.some((e: string) => e.includes('Invalid status')));

      // Valid
      const req3: any = { params: { id }, body: { reason: 'Manager manual adjustment', status: 'checked_in' } };
      let err3: any = null;
      validateAttendanceCorrection(req3, {} as any, (err?: any) => { err3 = err; });
      assert.strictEqual(err3, undefined);
    });

    it('validateAttendanceVerification enforces action and rejectionReason', () => {
      const eventId = new mongoose.Types.ObjectId().toString();

      // Approve passes without reason
      const reqApprove: any = { params: { eventId }, body: { action: 'approve' } };
      let errApprove: any = null;
      validateAttendanceVerification(reqApprove, {} as any, (err?: any) => { errApprove = err; });
      assert.strictEqual(errApprove, undefined);

      // Reject requires rejectionReason >= 5 chars
      const reqRejectFail: any = { params: { eventId }, body: { action: 'reject' } };
      let errRejectFail: any = null;
      validateAttendanceVerification(reqRejectFail, {} as any, (err?: any) => { errRejectFail = err; });
      assert.ok(errRejectFail);
      assert.ok(errRejectFail.errors.some((e: string) => e.includes('Rejection reason is mandatory')));

      // Reject succeeds with valid reason
      const reqRejectOk: any = { params: { eventId }, body: { action: 'reject', rejectionReason: 'Discrepancy in hours' } };
      let errRejectOk: any = null;
      validateAttendanceVerification(reqRejectOk, {} as any, (err?: any) => { errRejectOk = err; });
      assert.strictEqual(errRejectOk, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AttendanceSession Model & Repository Tests
  // ---------------------------------------------------------------------------
  describe('AttendanceSession Model & Repository', () => {
    it('creates session with correct defaults', async () => {
      const eventId = new mongoose.Types.ObjectId();
      const session = await attendanceSessionRepository.create({ eventId });

      assert.strictEqual(session.eventId.toString(), eventId.toString());
      assert.strictEqual(session.checkInFinalized, false);
      assert.strictEqual(session.checkOutFinalized, false);
      assert.strictEqual(session.lifecycleStatus, 'checkin_in_progress');
      assert.deepStrictEqual(session.requirementFinishOverrides, []);
    });

    it('enforces unique index on eventId', async () => {
      const eventId = new mongoose.Types.ObjectId();
      await attendanceSessionRepository.create({ eventId });

      await assert.rejects(
        async () => {
          await attendanceSessionRepository.create({ eventId });
        },
        (err: any) => err.code === 11000
      );
    });

    it('atomic getOrCreateSession is idempotent and safe against races', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();

      // 1st call creates
      const session1 = await attendanceSessionRepository.getOrCreateSession(eventId);
      assert.strictEqual(session1.eventId.toString(), eventId);
      assert.strictEqual(session1.lifecycleStatus, 'checkin_in_progress');

      // 2nd call returns identical session
      const session2 = await attendanceSessionRepository.getOrCreateSession(eventId);
      assert.strictEqual(session2._id.toString(), session1._id.toString());

      const count = await AttendanceSession.countDocuments({ eventId: new mongoose.Types.ObjectId(eventId) });
      assert.strictEqual(count, 1);
    });

    it('getOrCreateSession safely handles concurrent execution without throwing duplicate key errors', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();

      // Fire 5 concurrent requests simultaneously for the same event
      const results = await Promise.all([
        attendanceSessionRepository.getOrCreateSession(eventId),
        attendanceSessionRepository.getOrCreateSession(eventId),
        attendanceSessionRepository.getOrCreateSession(eventId),
        attendanceSessionRepository.getOrCreateSession(eventId),
        attendanceSessionRepository.getOrCreateSession(eventId),
      ]);

      assert.strictEqual(results.length, 5);
      const firstId = results[0]._id.toString();
      for (const res of results) {
        assert.strictEqual(res._id.toString(), firstId);
        assert.strictEqual(res.eventId.toString(), eventId);
      }

      const totalDocs = await AttendanceSession.countDocuments({ eventId: new mongoose.Types.ObjectId(eventId) });
      assert.strictEqual(totalDocs, 1);
    });

    it('getOrCreateSession gracefully recovers when findOneAndUpdate throws E11000 duplicate key error', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      // Pre-create the session
      const initial = await attendanceSessionRepository.getOrCreateSession(eventId);

      // Simulate a concurrent collision where findOneAndUpdate throws code 11000
      const originalFindOneAndUpdate = AttendanceSession.findOneAndUpdate.bind(AttendanceSession);
      (AttendanceSession as any).findOneAndUpdate = async () => {
        const dupError: any = new Error('E11000 duplicate key error');
        dupError.code = 11000;
        dupError.name = 'MongoServerError';
        throw dupError;
      };

      try {
        const recovered = await attendanceSessionRepository.getOrCreateSession(eventId);
        assert.ok(recovered);
        assert.strictEqual(recovered._id.toString(), initial._id.toString());
        assert.strictEqual(recovered.eventId.toString(), eventId);
      } finally {
        (AttendanceSession as any).findOneAndUpdate = originalFindOneAndUpdate;
      }
    });

    it('atomicFinalizeCheckIn successfully locks check-in and persists all 5 idempotency fields', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const managerId = new mongoose.Types.ObjectId();
      await attendanceSessionRepository.getOrCreateSession(eventId);

      const idempotencyData = {
        idempotencyKey: 'key_123',
        payloadHash: 'hash_abc',
        finalizedAt: new Date('2026-11-06T08:30:00.000Z'),
        finalizedBy: managerId,
        committedSummary: { presentCount: 5, lateCount: 1, absentCount: 0 },
      };

      // 1. First finalization succeeds
      const finalized = await attendanceSessionRepository.atomicFinalizeCheckIn(eventId, idempotencyData);
      assert.ok(finalized);
      assert.strictEqual(finalized.checkInFinalized, true);
      assert.strictEqual(finalized.lifecycleStatus, 'checkin_finalized');
      assert.strictEqual(finalized.checkInFinalizedBy?.toString(), managerId.toString());

      // Verify all 5 idempotency fields are persisted
      assert.ok(finalized.checkInIdempotency);
      assert.strictEqual(finalized.checkInIdempotency.idempotencyKey, 'key_123');
      assert.strictEqual(finalized.checkInIdempotency.payloadHash, 'hash_abc');
      assert.strictEqual(finalized.checkInIdempotency.finalizedBy.toString(), managerId.toString());
      assert.strictEqual(finalized.checkInIdempotency.finalizedAt.toISOString(), '2026-11-06T08:30:00.000Z');
      assert.deepStrictEqual(finalized.checkInIdempotency.committedSummary, { presentCount: 5, lateCount: 1, absentCount: 0 });

      // 2. Second finalization returns null (state precondition checkInFinalized: false fails)
      const duplicateFinalize = await attendanceSessionRepository.atomicFinalizeCheckIn(eventId, idempotencyData);
      assert.strictEqual(duplicateFinalize, null);
    });

    it('atomicFinalizeCheckOut enforces check-in finalization and persists all 5 checkout idempotency fields', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      const managerId = new mongoose.Types.ObjectId();
      await attendanceSessionRepository.getOrCreateSession(eventId);

      const finishData = {
        actualNormalFinishTime: '20:00',
        actualNormalFinishDate: new Date('2026-11-06T20:00:00.000Z'),
      };
      const idempotencyData = {
        idempotencyKey: 'co_key_456',
        payloadHash: 'hash_xyz',
        finalizedAt: new Date('2026-11-06T20:00:00.000Z'),
        finalizedBy: managerId,
        committedSummary: { normalCount: 4, overtimeCount: 1, earlyDepartureCount: 0 },
      };

      // 1. Fails if check-in is not finalized
      const prematureCheckout = await attendanceSessionRepository.atomicFinalizeCheckOut(eventId, finishData, idempotencyData);
      assert.strictEqual(prematureCheckout, null);

      // 2. Finalize check-in first
      await attendanceSessionRepository.atomicFinalizeCheckIn(eventId, {
        finalizedAt: new Date(),
        finalizedBy: managerId,
      });

      // 3. Checkout finalization now succeeds
      const finalizedCheckout = await attendanceSessionRepository.atomicFinalizeCheckOut(eventId, finishData, idempotencyData);
      assert.ok(finalizedCheckout);
      assert.strictEqual(finalizedCheckout.checkOutFinalized, true);
      assert.strictEqual(finalizedCheckout.lifecycleStatus, 'checkout_finalized');
      assert.strictEqual(finalizedCheckout.actualNormalFinishTime, '20:00');

      // Verify all 5 checkout idempotency fields are persisted
      assert.ok(finalizedCheckout.checkOutIdempotency);
      assert.strictEqual(finalizedCheckout.checkOutIdempotency.idempotencyKey, 'co_key_456');
      assert.strictEqual(finalizedCheckout.checkOutIdempotency.payloadHash, 'hash_xyz');
      assert.strictEqual(finalizedCheckout.checkOutIdempotency.finalizedBy.toString(), managerId.toString());
      assert.strictEqual(finalizedCheckout.checkOutIdempotency.finalizedAt.toISOString(), '2026-11-06T20:00:00.000Z');
      assert.deepStrictEqual(finalizedCheckout.checkOutIdempotency.committedSummary, { normalCount: 4, overtimeCount: 1, earlyDepartureCount: 0 });

      // 4. Repeated checkout attempt returns null (state precondition checkOutFinalized: false fails)
      const secondCheckout = await attendanceSessionRepository.atomicFinalizeCheckOut(eventId, finishData, idempotencyData);
      assert.strictEqual(secondCheckout, null);
    });

    it('setLifecycleStatus updates status properly', async () => {
      const eventId = new mongoose.Types.ObjectId().toString();
      await attendanceSessionRepository.getOrCreateSession(eventId);

      const updated = await attendanceSessionRepository.setLifecycleStatus(eventId, 'cancelled');
      assert.ok(updated);
      assert.strictEqual(updated.lifecycleStatus, 'cancelled');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Attendance Model & Repository Tests
  // ---------------------------------------------------------------------------
  describe('Attendance Model & Repository', () => {
    it('creates attendance record and enforces compound unique constraint on { eventId, workerId }', async () => {
      const eventId = new mongoose.Types.ObjectId();
      const requirementId = new mongoose.Types.ObjectId();
      const workerId = new mongoose.Types.ObjectId();

      const record1 = await attendanceRepository.create({
        eventId,
        requirementId,
        workerId,
        workerType: 'catering_boy',
        reportingTimeSnapshot: '08:00 AM',
        status: 'not_started',
      });

      assert.strictEqual(record1.eventId.toString(), eventId.toString());
      assert.strictEqual(record1.workerId.toString(), workerId.toString());
      assert.strictEqual(record1.status, 'not_started');
      assert.strictEqual(record1.verificationStatus, 'pending_review');
      assert.strictEqual(record1.delayMinutes, 0);
      assert.strictEqual(record1.overtimeMinutes, 0);

      // Attempt duplicate creation for same (eventId, workerId)
      await assert.rejects(
        async () => {
          await attendanceRepository.create({
            eventId,
            requirementId: new mongoose.Types.ObjectId(),
            workerId,
            workerType: 'catering_boy',
            reportingTimeSnapshot: '09:00 AM',
          });
        },
        (err: any) => err.code === 11000
      );
    });

    it('bulkUpsertAttendances cleanly inserts and updates records by compound key', async () => {
      const eventId = new mongoose.Types.ObjectId();
      const reqId = new mongoose.Types.ObjectId();
      const worker1 = new mongoose.Types.ObjectId();
      const worker2 = new mongoose.Types.ObjectId();

      // 1. Initial insert of two records
      const initialUpsert = await attendanceRepository.bulkUpsertAttendances([
        {
          eventId,
          requirementId: reqId,
          workerId: worker1,
          workerType: 'cameraman',
          reportingTimeSnapshot: '08:00',
          status: 'checked_in',
          arrivalStatus: 'on_time',
          checkInSource: 'system_default',
        },
        {
          eventId,
          requirementId: reqId,
          workerId: worker2,
          workerType: 'cameraman',
          reportingTimeSnapshot: '08:00',
          status: 'absent',
          arrivalStatus: 'absent',
          checkInSource: 'not_recorded',
        },
      ]);

      assert.strictEqual(initialUpsert.upsertedCount, 2);

      // 2. Perform second bulk upsert updating worker1 and inserting worker3
      const worker3 = new mongoose.Types.ObjectId();
      const secondUpsert = await attendanceRepository.bulkUpsertAttendances([
        {
          eventId,
          workerId: worker1,
          status: 'checked_out',
          departureStatus: 'normal',
          durationMinutes: 480,
        },
        {
          eventId,
          requirementId: reqId,
          workerId: worker3,
          workerType: 'cameraman',
          reportingTimeSnapshot: '08:00',
          status: 'checked_in',
        },
      ]);

      assert.strictEqual(secondUpsert.upsertedCount, 1);
      assert.strictEqual(secondUpsert.modifiedCount, 1);

      // Check updated worker1 record
      const fetchedWorker1 = await attendanceRepository.findByEventAndWorker(
        eventId.toString(),
        worker1.toString()
      );
      assert.ok(fetchedWorker1);
      assert.strictEqual(fetchedWorker1.status, 'checked_out');
      assert.strictEqual(fetchedWorker1.durationMinutes, 480);
      assert.strictEqual(fetchedWorker1.reportingTimeSnapshot, '08:00'); // Preserved from initial insert
    });

    it('addCorrection appends an audit entry and applies field updates', async () => {
      const eventId = new mongoose.Types.ObjectId();
      const reqId = new mongoose.Types.ObjectId();
      const workerId = new mongoose.Types.ObjectId();
      const managerId = new mongoose.Types.ObjectId();

      const created = await attendanceRepository.create({
        eventId,
        requirementId: reqId,
        workerId,
        workerType: 'photographer',
        reportingTimeSnapshot: '09:00 AM',
        status: 'absent',
        arrivalStatus: 'absent',
      });

      const updated = await attendanceRepository.addCorrection(
        created._id.toString(),
        {
          modifiedBy: managerId,
          modifiedAt: new Date(),
          field: 'status',
          previousStatus: 'absent',
          newStatus: 'checked_in',
          reason: 'Worker arrived late with manager authorization, resolving false absence',
        },
        {
          status: 'checked_in',
          arrivalStatus: 'late',
          delayMinutes: 30,
        }
      );

      assert.ok(updated);
      assert.strictEqual(updated.status, 'checked_in');
      assert.strictEqual(updated.arrivalStatus, 'late');
      assert.strictEqual(updated.delayMinutes, 30);
      assert.strictEqual(updated.corrections.length, 1);
      assert.strictEqual(updated.corrections[0].field, 'status');
      assert.strictEqual(updated.corrections[0].previousStatus, 'absent');
      assert.strictEqual(updated.corrections[0].newStatus, 'checked_in');
      assert.strictEqual(updated.corrections[0].modifiedBy.toString(), managerId.toString());
    });

    it('getEventAttendanceSummary calculates accurate operational metrics', async () => {
      const eventId = new mongoose.Types.ObjectId();
      const reqId = new mongoose.Types.ObjectId();

      // Worker 1: on time, normal checkout, 480 min
      const w1 = new mongoose.Types.ObjectId();
      await attendanceRepository.create({
        eventId,
        requirementId: reqId,
        workerId: w1,
        workerType: 'chef',
        reportingTimeSnapshot: '08:00',
        status: 'checked_out',
        arrivalStatus: 'on_time',
        departureStatus: 'normal',
        durationMinutes: 480,
        verificationStatus: 'approved',
      });

      // Worker 2: late, overtime, 540 min with 60 min overtime
      const w2 = new mongoose.Types.ObjectId();
      await attendanceRepository.create({
        eventId,
        requirementId: reqId,
        workerId: w2,
        workerType: 'chef',
        reportingTimeSnapshot: '08:00',
        status: 'checked_out',
        arrivalStatus: 'late',
        delayMinutes: 30,
        departureStatus: 'overtime',
        overtimeMinutes: 60,
        durationMinutes: 510,
        verificationStatus: 'approved',
      });

      // Worker 3: early departure, 360 min
      const w3 = new mongoose.Types.ObjectId();
      await attendanceRepository.create({
        eventId,
        requirementId: reqId,
        workerId: w3,
        workerType: 'chef',
        reportingTimeSnapshot: '08:00',
        status: 'checked_out',
        arrivalStatus: 'on_time',
        departureStatus: 'early_departure',
        earlyDepartureMinutes: 60,
        durationMinutes: 360,
        verificationStatus: 'pending_review',
      });

      // Worker 4: absent
      const w4 = new mongoose.Types.ObjectId();
      await attendanceRepository.create({
        eventId,
        requirementId: reqId,
        workerId: w4,
        workerType: 'chef',
        reportingTimeSnapshot: '08:00',
        status: 'absent',
        arrivalStatus: 'absent',
        durationMinutes: 0,
        verificationStatus: 'rejected',
      });

      const summary = await attendanceRepository.getEventAttendanceSummary(eventId.toString());

      assert.strictEqual(summary.total, 4);
      assert.strictEqual(summary.checkedOut, 3);
      assert.strictEqual(summary.absent, 1);
      assert.strictEqual(summary.onTime, 2);
      assert.strictEqual(summary.late, 1);
      assert.strictEqual(summary.overtime, 1);
      assert.strictEqual(summary.earlyDeparture, 1);
      assert.strictEqual(summary.approved, 2);
      assert.strictEqual(summary.pendingReview, 1);
      assert.strictEqual(summary.rejected, 1);
      assert.strictEqual(summary.totalDurationMinutes, 480 + 510 + 360);
      assert.strictEqual(summary.totalOvertimeMinutes, 60);
    });

    it('findByWorkerId and countByWorkerId work with pagination', async () => {
      const workerId = new mongoose.Types.ObjectId();
      const reqId = new mongoose.Types.ObjectId();

      for (let i = 0; i < 5; i++) {
        await attendanceRepository.create({
          eventId: new mongoose.Types.ObjectId(),
          requirementId: reqId,
          workerId,
          workerType: 'decoration_worker',
          reportingTimeSnapshot: '10:00',
          status: 'checked_out',
        });
      }

      const total = await attendanceRepository.countByWorkerId(workerId.toString());
      assert.strictEqual(total, 5);

      const page1 = await attendanceRepository.findByWorkerId(workerId.toString(), { limit: 2, skip: 0 });
      assert.strictEqual(page1.length, 2);

      const page2 = await attendanceRepository.findByWorkerId(workerId.toString(), { limit: 2, skip: 2 });
      assert.strictEqual(page2.length, 2);

      const page3 = await attendanceRepository.findByWorkerId(workerId.toString(), { limit: 2, skip: 4 });
      assert.strictEqual(page3.length, 1);
    });
  });
});

