import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import type { UserRole } from '../types/auth';

interface RoleRouteProps {
  allowedRole?: UserRole;
  allowedRoles?: UserRole[];
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRole, allowedRoles }) => {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roles = allowedRoles || (allowedRole ? [allowedRole] : []);
  const isAllowed = roles.length === 0 || roles.includes(user.role);

  if (!isAllowed) {
    // Redirect unauthorized user to their respective dashboard
    const redirects: Record<UserRole, string> = {
      admin: '/admin',
      client: '/client',
      event_manager: '/manager',
      worker: '/worker',
    };
    return <Navigate to={redirects[user.role]} replace />;
  }

  return <Outlet />;
};
