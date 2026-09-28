import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import type { UserRole } from '../types/auth';

interface RoleRouteProps {
  allowedRole: UserRole;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ allowedRole }) => {
  const { user } = useAppSelector((state) => state.auth);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== allowedRole) {
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
