import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeResourceAccess } from '../src/utils/resourceAuthorization.js';
import { ApiError } from '../src/utils/ApiError.js';
import type { UserRole } from '../src/modules/auth/model/user.model.js';

describe('Resource Authorization Foundation', () => {
  const adminUser = { id: 'admin123', role: 'admin' as UserRole };
  const clientA = { id: 'clientA', role: 'client' as UserRole };
  const clientB = { id: 'clientB', role: 'client' as UserRole };
  const managerA = { id: 'managerA', role: 'event_manager' as UserRole };
  const managerB = { id: 'managerB', role: 'event_manager' as UserRole };
  const workerA = { id: 'workerA', role: 'worker' as UserRole };
  const workerB = { id: 'workerB', role: 'worker' as UserRole };

  it('1. Missing authenticated user → 401 Unauthorized', () => {
    assert.throws(
      () => authorizeResourceAccess(undefined, ['some-owner-id']),
      (err: any) => err instanceof ApiError && err.statusCode === 401 && err.message === 'Authentication required'
    );
  });

  it('2. Authenticated user accessing own resource → allowed', () => {
    // Client accessing their own quotation or event
    authorizeResourceAccess(clientA, [clientA.id]);
  });

  it('3. Client accessing another client\'s resource → 403 Forbidden', () => {
    assert.throws(
      () => authorizeResourceAccess(clientA, [clientB.id]),
      (err: any) => err instanceof ApiError && err.statusCode === 403 && err.message === 'Insufficient permissions'
    );
  });

  it('4. Event Manager accessing an assigned event → allowed', () => {
    // Event belongs to clientA, and is assigned to managerA
    authorizeResourceAccess(managerA, [clientA.id, managerA.id]);
  });

  it('5. Event Manager accessing another manager\'s event → 403 Forbidden', () => {
    // Event belongs to clientA, and is assigned to managerB
    assert.throws(
      () => authorizeResourceAccess(managerA, [clientA.id, managerB.id]),
      (err: any) => err instanceof ApiError && err.statusCode === 403 && err.message === 'Insufficient permissions'
    );
  });

  it('6. Worker accessing own resource → allowed', () => {
    // Worker accessing their own earnings or attendance
    authorizeResourceAccess(workerA, [workerA.id]);
  });

  it('7. Worker accessing another worker\'s resource → 403 Forbidden', () => {
    assert.throws(
      () => authorizeResourceAccess(workerA, [workerB.id]),
      (err: any) => err instanceof ApiError && err.statusCode === 403 && err.message === 'Insufficient permissions'
    );
  });

  it('8. Admin access according to admin permission → allowed', () => {
    // Admin accessing any resource
    authorizeResourceAccess(adminUser, [clientB.id]);
  });
});
