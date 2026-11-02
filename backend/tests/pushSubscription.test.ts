import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { PushSubscription, hashEndpoint } from '../src/modules/notifications/model/push-subscription.model.js';
import { pushSubscriptionRepository } from '../src/modules/notifications/repository/push-subscription.repository.js';
import { User } from '../src/modules/auth/model/user.model.js';

describe('Notification Milestone 3 — Part 3A: Device Subscription Management & APIs', () => {
  let server: http.Server;
  let user1Id: string;
  let user1Token: string;
  let user2Id: string;
  let user2Token: string;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '2h' });
  };

  before(async () => {
    await connectDB();

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    // Create test users
    const u1 = await User.create({
      name: 'Push Test User 1',
      email: `push.user1.${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'worker',
      phone: '+919999900001',
      isActive: true,
      emailVerified: true,
    });
    user1Id = u1._id.toString();
    user1Token = generateToken(user1Id, 'worker');

    const u2 = await User.create({
      name: 'Push Test User 2',
      email: `push.user2.${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'event_manager',
      phone: '+919999900002',
      isActive: true,
      emailVerified: true,
    });
    user2Id = u2._id.toString();
    user2Token = generateToken(user2Id, 'event_manager');
  });

  after(async () => {
    await PushSubscription.deleteMany({});
    await User.deleteMany({ _id: { $in: [user1Id, user2Id] } });

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PushSubscription.deleteMany({});
  });

  // ─── 1. Push Subscription Model & Security Tests ──────────────────────────────

  describe('PushSubscription Model & Cryptographic Security', () => {
    it('1. Persists a valid push subscription and populates SHA-256 endpointHash', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-abc-123';
      const expectedHash = hashEndpoint(endpoint);

      const sub = await PushSubscription.create({
        userId: new mongoose.Types.ObjectId(user1Id),
        endpoint,
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic0A==',
          auth: 'tBHItJI5svbpez7KI4CCXg==',
        },
        device: {
          browser: 'Chrome',
          os: 'Windows',
          deviceType: 'desktop',
          label: 'Chrome on Windows',
        },
      });

      assert.ok(sub._id);
      assert.equal(sub.endpointHash, expectedHash);
      assert.equal(sub.status, 'active');
      assert.equal(sub.device.browser, 'Chrome');
    });

    it('2. Excludes sensitive encryption keys (p256dh, auth) by default from ordinary queries', async () => {
      const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/test-endpoint-mozilla';
      await PushSubscription.create({
        userId: new mongoose.Types.ObjectId(user1Id),
        endpoint,
        keys: {
          p256dh: 'sensitive_p256dh_key',
          auth: 'sensitive_auth_secret',
        },
      });

      const found = await PushSubscription.findOne({ endpointHash: hashEndpoint(endpoint) });
      assert.ok(found);
      assert.equal(found.keys?.p256dh, undefined, 'p256dh must not be selected by default');
      assert.equal(found.keys?.auth, undefined, 'auth secret must not be selected by default');

      // But can be retrieved explicitly with .select('+keys.p256dh +keys.auth')
      const withKeys = await PushSubscription.findOne({
        endpointHash: hashEndpoint(endpoint),
      }).select('+keys.p256dh +keys.auth');
      assert.equal(withKeys?.keys?.p256dh, 'sensitive_p256dh_key');
      assert.equal(withKeys?.keys?.auth, 'sensitive_auth_secret');
    });

    it('3. toJSON transformation strips sensitive keys and raw endpoints', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-endpoint-strip';
      const sub = await PushSubscription.create({
        userId: new mongoose.Types.ObjectId(user1Id),
        endpoint,
        keys: {
          p256dh: 'sensitive_p256dh_key',
          auth: 'sensitive_auth_secret',
        },
      });

      const json = sub.toJSON();
      assert.equal(json.endpoint, undefined, 'Raw endpoint must be stripped in toJSON');
      assert.equal(json.keys?.p256dh, undefined, 'p256dh must be stripped in toJSON');
      assert.equal(json.keys?.auth, undefined, 'auth must be stripped in toJSON');
    });

    it('4. Rejects subscription creation when required fields are missing', async () => {
      await assert.rejects(
        async () => {
          await PushSubscription.create({
            userId: new mongoose.Types.ObjectId(user1Id),
            // missing endpoint and keys
          });
        },
        /Path `endpoint` is required/
      );
    });
  });

  // ─── 2. Shared-Device Handover & Repository Tests ──────────────────────────────

  describe('Shared-Device Handover & Atomic Upsert', () => {
    it('1. Atomically reassigns subscription ownership when another user registers on the same device', async () => {
      const sharedEndpoint = 'https://fcm.googleapis.com/fcm/send/shared-device-tablet-xyz';

      // User 1 registers first
      const sub1 = await pushSubscriptionRepository.upsertSubscription({
        userId: user1Id,
        endpoint: sharedEndpoint,
        keys: {
          p256dh: 'key_for_device_1',
          auth: 'auth_for_device_1',
        },
        device: { label: 'Shared Tablet' },
      });
      assert.equal(sub1.userId.toString(), user1Id);

      // Verify User 1 sees 1 active device
      let u1Devices = await pushSubscriptionRepository.findActiveByUserId(user1Id);
      assert.equal(u1Devices.length, 1);

      // User 2 logs into the SAME physical browser/device and registers the subscription
      const sub2 = await pushSubscriptionRepository.upsertSubscription({
        userId: user2Id,
        endpoint: sharedEndpoint,
        keys: {
          p256dh: 'key_for_device_1',
          auth: 'auth_for_device_1',
        },
        device: { label: 'Shared Tablet' },
      });

      // Verify ownership atomically transferred to User 2
      assert.equal(sub2._id.toString(), sub1._id.toString(), 'Same subscription record was reused');
      assert.equal(sub2.userId.toString(), user2Id, 'Ownership transferred to User 2');

      // User 1 must NO LONGER have this device associated
      u1Devices = await pushSubscriptionRepository.findActiveByUserId(user1Id);
      assert.equal(u1Devices.length, 0, 'User 1 must have 0 active devices after handover');

      // User 2 now owns this active device
      const u2Devices = await pushSubscriptionRepository.findActiveByUserId(user2Id);
      assert.equal(u2Devices.length, 1);
      assert.equal(u2Devices[0]._id.toString(), sub2._id.toString());
    });

    it('2. Deactivates a device by endpoint on local logout cleanup', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/logout-endpoint-test';
      await pushSubscriptionRepository.upsertSubscription({
        userId: user1Id,
        endpoint,
        keys: { p256dh: 'key_1', auth: 'auth_1' },
      });

      const activeBefore = await pushSubscriptionRepository.findActiveByUserId(user1Id);
      assert.equal(activeBefore.length, 1);

      const modified = await pushSubscriptionRepository.deactivateByEndpoint(endpoint, user1Id);
      assert.equal(modified, true);

      const activeAfter = await pushSubscriptionRepository.findActiveByUserId(user1Id);
      assert.equal(activeAfter.length, 0);

      const found = await pushSubscriptionRepository.findByEndpoint(endpoint);
      assert.equal(found?.status, 'inactive');
      assert.ok(found?.invalidatedAt);
    });
  });

  // ─── 3. Push API Endpoints Integration Tests ───────────────────────────────────

  describe('Push API Endpoints', () => {
    it('1. GET /api/notifications/push/config returns public VAPID configuration without exposing secrets', async () => {
      const res = await request(server).get('/api/notifications/push/config');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.enabled, true);
      assert.ok(res.body.data.publicKey);
      assert.equal(res.body.data.privateKey, undefined, 'VAPID private key must NEVER be exposed');
    });

    it('2. POST /api/notifications/push/subscriptions enforces authentication (401)', async () => {
      const res = await request(server)
        .post('/api/notifications/push/subscriptions')
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/anon-test',
          keys: { p256dh: 'k', auth: 'a' },
        });
      assert.equal(res.status, 401);
    });

    it('3. POST /api/notifications/push/subscriptions validates payload (400 on invalid URL/keys)', async () => {
      // Insecure URL
      const res1 = await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          endpoint: 'insecure-protocol://test.com',
          keys: { p256dh: 'k', auth: 'a' },
        });
      assert.equal(res1.status, 400);

      // Missing keys
      const res2 = await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/test',
        });
      assert.equal(res2.status, 400);
    });

    it('4. POST /api/notifications/push/subscriptions registers subscription and returns safe metadata (201)', async () => {
      const res = await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/my-registered-phone',
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9ic0A==',
            auth: 'tBHItJI5svbpez7KI4CCXg==',
          },
          device: {
            browser: 'Chrome Mobile',
            os: 'Android',
            deviceType: 'mobile',
            label: 'Pixel 8',
          },
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.equal(res.body.data.status, 'active');
      assert.equal(res.body.data.device.label, 'Pixel 8');
      assert.equal(res.body.data.endpoint, undefined, 'Must not return raw endpoint');
      assert.equal(res.body.data.keys, undefined, 'Must not return encryption keys');
    });

    it('5. GET /api/notifications/push/subscriptions returns only authenticated user devices', async () => {
      // Register device for User 1
      await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/user1-laptop',
          keys: { p256dh: 'key1', auth: 'auth1' },
          device: { label: 'User 1 Laptop' },
        });

      // Register device for User 2
      await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/user2-phone',
          keys: { p256dh: 'key2', auth: 'auth2' },
          device: { label: 'User 2 Phone' },
        });

      // User 1 requests subscriptions
      const res1 = await request(server)
        .get('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`);

      assert.equal(res1.status, 200);
      assert.equal(res1.body.data.count, 1);
      assert.equal(res1.body.data.subscriptions[0].device.label, 'User 1 Laptop');

      // User 2 requests subscriptions
      const res2 = await request(server)
        .get('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user2Token}`);

      assert.equal(res2.status, 200);
      assert.equal(res2.body.data.count, 1);
      assert.equal(res2.body.data.subscriptions[0].device.label, 'User 2 Phone');
    });

    it('6. DELETE /api/notifications/push/subscriptions/:id prevents cross-user deletion (404/not owned)', async () => {
      // Register device for User 2
      const reg = await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/user2-target',
          keys: { p256dh: 'k', auth: 'a' },
          device: { label: 'Target Device' },
        });

      const u2SubId = reg.body.data.id;

      // User 1 attempts to delete User 2's subscription
      const deleteAttempt = await request(server)
        .delete(`/api/notifications/push/subscriptions/${u2SubId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      assert.equal(deleteAttempt.status, 404);

      // Verify User 2 device is still active
      const check = await request(server)
        .get('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user2Token}`);
      assert.equal(check.body.data.count, 1);

      // User 2 deletes own device
      const ownDelete = await request(server)
        .delete(`/api/notifications/push/subscriptions/${u2SubId}`)
        .set('Authorization', `Bearer ${user2Token}`);
      assert.equal(ownDelete.status, 200);

      // Device now gone from active list
      const checkAfter = await request(server)
        .get('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user2Token}`);
      assert.equal(checkAfter.body.data.count, 0);
    });

    it('7. DELETE /api/notifications/push/subscriptions/current unsubscribes current browser on logout', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/current-browser-logout';

      // Register device
      await request(server)
        .post('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          endpoint,
          keys: { p256dh: 'k', auth: 'a' },
          device: { label: 'Current Browser' },
        });

      // Call current device delete
      const res = await request(server)
        .delete('/api/notifications/push/subscriptions/current')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ endpoint });

      assert.equal(res.status, 200);

      const listRes = await request(server)
        .get('/api/notifications/push/subscriptions')
        .set('Authorization', `Bearer ${user1Token}`);
      assert.equal(listRes.body.data.count, 0);
    });
  });
});

