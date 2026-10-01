import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { UserService } from '../src/modules/auth/service/user.service.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

describe('Admin Creation Bootstrap Flow', () => {
  let userService: UserService;

  before(async () => {
    await connectDB();
    userService = new UserService();
  });

  after(async () => {
    await User.deleteMany({ email: /@admintest\.com$/ });
  });

  beforeEach(async () => {
    await User.deleteMany({ email: /@admintest\.com$/ });
  });

  it('1. First Admin can be created via service method', async () => {
    const admin = await userService.createAdmin({
      name: 'System Admin',
      email: 'admin1@admintest.com',
      password: 'Password123!',
    });

    assert.equal(admin.name, 'System Admin');
    assert.equal(admin.email, 'admin1@admintest.com');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.isActive, true);
    assert.equal(admin.emailVerified, true);
  });

  it('2. Admin password is hashed and raw password is not returned/stored', async () => {
    const rawPassword = 'SecurePassword123!';
    const admin = await userService.createAdmin({
      name: 'Secure Admin',
      email: 'admin2@admintest.com',
      password: rawPassword,
    });

    // Check SafeUser payload
    assert.equal((admin as any).password, undefined);

    // Check DB
    const dbAdmin = await User.findOne({ email: 'admin2@admintest.com' }).select('+password');
    assert.ok(dbAdmin);
    assert.notEqual(dbAdmin.password, rawPassword);
    
    // Verify hash
    const isValid = await bcrypt.compare(rawPassword, dbAdmin.password);
    assert.equal(isValid, true);
  });

  it('3. Duplicate admin email is rejected safely', async () => {
    await userService.createAdmin({
      name: 'First',
      email: 'duplicate@admintest.com',
      password: 'Password123!',
    });

    try {
      await userService.createAdmin({
        name: 'Second',
        email: 'duplicate@admintest.com',
        password: 'Password123!',
      });
      assert.fail('Should have thrown an error for duplicate email');
    } catch (err: any) {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Email is already registered/);
    }
  });

  it('4. Normal login works with the created Admin', async () => {
    await userService.createAdmin({
      name: 'Login Admin',
      email: 'login@admintest.com',
      password: 'Password123!',
    });

    const loginResult = await userService.loginUser({
      email: 'login@admintest.com',
      password: 'Password123!'
    });

    assert.ok(loginResult.token);
    assert.equal(loginResult.user.email, 'login@admintest.com');
    assert.equal(loginResult.user.role, 'admin');
  });
});
