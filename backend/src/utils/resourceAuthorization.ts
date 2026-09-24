import { ApiError } from './ApiError.js';
import type { AuthUser } from '../types/express.js'; // Can be imported or we can use structural typing

/**
 * authorizeResourceAccess
 * 
 * Reusable foundation for resource-based authorization.
 * Intended to be used within the Business/Service layer after fetching a resource.
 * 
 * @param user - The authenticated user (e.g., from req.user)
 * @param resourceOwnerIds - An array of user IDs associated with the resource.
 *                           If the user's ID is in this array, access is granted.
 *                           Can include undefined/null for flexible checking.
 * 
 * @throws {ApiError} 401 - If the user is unauthenticated.
 * @throws {ApiError} 403 - If the user does not have permission to access the resource.
 */
export const authorizeResourceAccess = (
  user: { id: string; role: string } | undefined,
  resourceOwnerIds: (string | undefined | null)[],
): void => {
  if (!user) {
    throw ApiError.unauthorized('Authentication required');
  }

  // Admin bypass: Admins can access system-wide resources.
  if (user.role === 'admin') {
    return;
  }

  // Check if the user's ID matches any of the resource's owner IDs.
  const isOwner = resourceOwnerIds.some(
    (ownerId) => ownerId && ownerId.toString() === user.id.toString()
  );

  if (!isOwner) {
    throw ApiError.forbidden('Insufficient permissions');
  }
};
