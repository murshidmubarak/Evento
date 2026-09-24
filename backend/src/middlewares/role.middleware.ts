import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import type { UserRole } from '../modules/auth/model/user.model.js';

/**
 * authorize — Reusable Role-Based Access Control (RBAC) middleware factory.
 *
 * Responsibilities:
 * 1. Checks that the user is authenticated (req.user exists).
 * 2. Checks that req.user.role matches one of the allowedRoles.
 * 3. If req.user is missing -> 401 Unauthorized ("Authentication required").
 * 4. If role is not allowed -> 403 Forbidden ("Insufficient permissions").
 * 5. If role is allowed -> calls next().
 *
 * Security guarantees:
 * - Reads role strictly from req.user.role (verified backend authentication context).
 * - Does NOT accept role from request body, query, URL parameters, or headers.
 * - Does NOT perform database queries.
 * - Does NOT handle resource ownership (handled in resource authorization layer).
 *
 * @param allowedRoles - Spread of allowed UserRole values
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }

    next();
  };
};

export default authorize;
