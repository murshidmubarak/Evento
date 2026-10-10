import './setup.js';
import test, { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Service } from '../src/modules/services/model/service.model.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { Media } from '../src/modules/media/model/media.model.js';
import { MediaService } from '../src/modules/media/service/media.service.js';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const generateToken = (userId: string, role: string) => {
  return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

describe('Event Media Upload API', () => {
  let client1Token: string;
  let client2Token: string;
  let managerToken: string;
  let client1Id: string;
  let eventId: string;
  let serviceId: string;
  let unselectedServiceId: string;

  before(async () => {
    await connectDB();
    await User.deleteMany({ email: { $in: ['client1_media@example.com', 'client2_media@example.com', 'manager_media@example.com'] } });
    await Event.deleteMany({ title: 'Media Test Event' });
    await Service.deleteMany({ name: { $in: ['Decoration', 'Catering'] } });
    await Media.deleteMany({ eventId: eventId });

    const client1 = await User.create({ name: 'Client 1', email: 'client1_media@example.com', password: 'Password123!', role: 'client', phone: '1234567890' });
    client1Id = client1._id.toString();
    client1Token = generateToken(client1Id, 'client');

    const client2 = await User.create({ name: 'Client 2', email: 'client2_media@example.com', password: 'Password123!', role: 'client', phone: '0987654321' });
    client2Token = generateToken(client2._id.toString(), 'client');

    const manager = await User.create({ name: 'Manager 1', email: 'manager_media@example.com', password: 'Password123!', role: 'event_manager', phone: '1111111111' });
    managerToken = generateToken(manager._id.toString(), 'event_manager');

    const service = await Service.create({ name: 'Decoration', description: 'Deco', pricingType: 'package', isActive: true });
    serviceId = service._id.toString();

    const service2 = await Service.create({ name: 'Catering', description: 'Food', pricingType: 'package', isActive: true });
    unselectedServiceId = service2._id.toString();

    const event = await Event.create({
      clientId: client1Id,
      title: 'Media Test Event',
      eventType: 'Wedding',
      date: new Date('2026-12-01'),
      startTime: '10:00',
      endTime: '18:00',
      location: { address: 'Test location' },
      guestCount: 100,
      selectedServices: [{ serviceId: serviceId, preferences: { style: 'modern' } }],
      status: 'requested',
    });
    eventId = event._id.toString();
  });

  after(async () => {
    await User.deleteMany({ email: { $in: ['client1_media@example.com', 'client2_media@example.com', 'manager_media@example.com'] } });
    await Event.deleteMany({ title: 'Media Test Event' });
    await Service.deleteMany({ name: { $in: ['Decoration', 'Catering'] } });
    await Media.deleteMany({ eventId: eventId });
    await mongoose.disconnect();
  });

  it('should return 401 if unauthenticated', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .field('serviceId', serviceId);
    assert.strictEqual(res.status, 401);
  });

  it('should return 403 if worker or manager tries to upload', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${managerToken}`)
      .field('serviceId', serviceId)
      .attach('images', Buffer.from('fake'), 'test.jpg');
    assert.strictEqual(res.status, 403);
  });

  it('should return 403 if different client tries to upload', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${client2Token}`)
      .field('serviceId', serviceId)
      .attach('images', Buffer.from('fake'), 'test.jpg');
    assert.strictEqual(res.status, 403);
  });

  it('should return 400 if serviceId is missing', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${client1Token}`);
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /serviceId is required/);
  });

  it('should return 400 if no files provided', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${client1Token}`)
      .field('serviceId', serviceId);
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /No files provided/);
  });

  it('should return 400 if service is not selected in event', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${client1Token}`)
      .field('serviceId', unselectedServiceId)
      .attach('images', Buffer.from('fake image data'), 'test.jpg');
    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /is not selected for this event/);
  });

  it('should return 404 for nonexistent event', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/events/${fakeId}/service-reference-images`)
      .set('Authorization', `Bearer ${client1Token}`)
      .field('serviceId', serviceId)
      .attach('images', Buffer.from('fake image data'), 'test.jpg');
    assert.strictEqual(res.status, 404);
  });

  it('should successfully upload and save metadata for valid client, event, and service', async () => {
    mock.method(MediaService.prototype, 'uploadImage', async () => ({
      url: 'https://res.cloudinary.com/demo/image/upload/v1234/test.jpg',
      publicId: 'test_public_id',
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
    }));

    // We can't easily send an actual valid image through supertest without a file, 
    // but multer memory storage handles buffers. 
    // Wait, multer fileFilter checks mimetype. 
    // If we attach it without options, supertest might send a default mime that gets rejected, or application/octet-stream.
    // Let's explicitly set content-type for the attachment.
    const res = await request(app)
      .post(`/api/events/${eventId}/service-reference-images`)
      .set('Authorization', `Bearer ${client1Token}`)
      .field('serviceId', serviceId)
      .attach('images', Buffer.from('fake image data'), { filename: 'test.jpg', contentType: 'image/jpeg' });
    
    assert.strictEqual(res.status, 200, res.body.error?.message);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.referenceImages.length, 1);
    assert.strictEqual(res.body.data.referenceImages[0].fileName, 'test.jpg');

    // Verify it was saved to DB in Media collection
    const mediaRecords = await Media.find({ eventId, serviceId });
    assert.strictEqual(mediaRecords.length, 1);
    assert.strictEqual(mediaRecords[0].publicId, 'test_public_id');

    // Verify preferences style remains untouched
    const updatedEvent = await Event.findById(eventId);
    const servicePref = updatedEvent!.selectedServices.find(s => s.serviceId.toString() === serviceId)?.preferences as any;
    assert.strictEqual(servicePref.style, 'modern');
    assert.strictEqual(servicePref.referenceImages, undefined);

    mock.restoreAll();
  });
});
