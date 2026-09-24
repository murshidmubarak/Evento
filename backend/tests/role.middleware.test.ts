/// <reference path="../src/types/express.d.ts" />
import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { authorize } from '../src/middlewares/role.middleware.js';
import { ApiError } from '../src/utils/ApiError.js';
import type { UserRole } from '../src/modules/auth/model/user.model.js';

describe('RBAC Role Middleware — authorize', () => {
  const createMockReq = (
    user?: { id: string; role: UserRole },
    extra?: Partial<Request>,
  ): Request => {
    return {
      user,
      body: {},
      query: {},
      params: {},
      headers: {},
      ...extra,
    } as unknown as Request;
  };

  const createMockRes = (): Response => {
    return {} as unknown as Response;
  };

  it('1. Missing req.user → 401 Unauthorized ("Authentication required")', () => {
    const middleware = authorize('admin');
    const req = createMockReq(undefined);
    const res = createMockRes();
    let capturedError: unknown;
    let nextCalled = false;

    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true, 'next() must be called');
    assert.ok(capturedError instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedError as ApiError).statusCode, 401);
    assert.equal((capturedError as ApiError).message, 'Authentication required');
  });

  it('2. Admin accessing admin-only route → allowed', () => {
    const middleware = authorize('admin');
    const req = createMockReq({ id: 'user-admin-1', role: 'admin' });
    const res = createMockRes();
    let capturedError: unknown;
    let nextCalled = false;

    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true, 'next() must be called');
    assert.equal(capturedError, undefined, 'next() must be called with no error');
  });

  it('3. Client accessing admin-only route → 403 Forbidden ("Insufficient permissions")', () => {
    const middleware = authorize('admin');
    const req = createMockReq({ id: 'user-client-1', role: 'client' });
    const res = createMockRes();
    let capturedError: unknown;
    let nextCalled = false;

    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true, 'next() must be called');
    assert.ok(capturedError instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedError as ApiError).statusCode, 403);
    assert.equal((capturedError as ApiError).message, 'Insufficient permissions');
  });

  it('4. Event manager accessing admin-only route → 403 Forbidden ("Insufficient permissions")', () => {
    const middleware = authorize('admin');
    const req = createMockReq({ id: 'user-em-1', role: 'event_manager' });
    const res = createMockRes();
    let capturedError: unknown;
    let nextCalled = false;

    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true, 'next() must be called');
    assert.ok(capturedError instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedError as ApiError).statusCode, 403);
    assert.equal((capturedError as ApiError).message, 'Insufficient permissions');
  });

  it('5. Worker accessing admin-only route → 403 Forbidden ("Insufficient permissions")', () => {
    const middleware = authorize('admin');
    const req = createMockReq({ id: 'user-worker-1', role: 'worker' });
    const res = createMockRes();
    let capturedError: unknown;
    let nextCalled = false;

    middleware(req, res, (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true, 'next() must be called');
    assert.ok(capturedError instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedError as ApiError).statusCode, 403);
    assert.equal((capturedError as ApiError).message, 'Insufficient permissions');
  });

  it('6. Multiple allowed roles → matching role allowed', () => {
    const middleware = authorize('admin', 'event_manager');

    // Test with event_manager
    const reqEM = createMockReq({ id: 'user-em-1', role: 'event_manager' });
    let nextCalledEM = false;
    let errorEM: unknown;
    middleware(reqEM, createMockRes(), (err?: unknown) => {
      nextCalledEM = true;
      errorEM = err;
    });
    assert.equal(nextCalledEM, true, 'next() must be called for event_manager');
    assert.equal(errorEM, undefined, 'error must be undefined for event_manager');

    // Test with admin
    const reqAdmin = createMockReq({ id: 'user-admin-1', role: 'admin' });
    let nextCalledAdmin = false;
    let errorAdmin: unknown;
    middleware(reqAdmin, createMockRes(), (err?: unknown) => {
      nextCalledAdmin = true;
      errorAdmin = err;
    });
    assert.equal(nextCalledAdmin, true, 'next() must be called for admin');
    assert.equal(errorAdmin, undefined, 'error must be undefined for admin');
  });

  it('7. Multiple allowed roles → non-matching role denied', () => {
    const middleware = authorize('admin', 'event_manager');

    // Test with client
    const reqClient = createMockReq({ id: 'user-client-1', role: 'client' });
    let capturedErrorClient: unknown;
    middleware(reqClient, createMockRes(), (err?: unknown) => {
      capturedErrorClient = err;
    });
    assert.ok(capturedErrorClient instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedErrorClient as ApiError).statusCode, 403);
    assert.equal((capturedErrorClient as ApiError).message, 'Insufficient permissions');

    // Test with worker
    const reqWorker = createMockReq({ id: 'user-worker-1', role: 'worker' });
    let capturedErrorWorker: unknown;
    middleware(reqWorker, createMockRes(), (err?: unknown) => {
      capturedErrorWorker = err;
    });
    assert.ok(capturedErrorWorker instanceof ApiError, 'Error must be an instance of ApiError');
    assert.equal((capturedErrorWorker as ApiError).statusCode, 403);
    assert.equal((capturedErrorWorker as ApiError).message, 'Insufficient permissions');
  });

  it('8. Security verification: ignores role in body, query, or params', () => {
    const middleware = authorize('admin');
    const reqSpoofed = {
      body: { role: 'admin' },
      query: { role: 'admin' },
      params: { role: 'admin' },
      user: { id: 'client-attacker', role: 'client' as UserRole },
    } as unknown as Request;

    let capturedError: unknown;
    middleware(reqSpoofed, createMockRes(), (err?: unknown) => {
      capturedError = err;
    });

    assert.ok(capturedError instanceof ApiError);
    assert.equal((capturedError as ApiError).statusCode, 403);
    assert.equal((capturedError as ApiError).message, 'Insufficient permissions');
  });
});
