import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchCurrentUser, forceLogout } from '../features/auth/authSlice';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { isTokenExpired } from '../utils/localStorage';
import type { UserRole } from '../types/auth';

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: '/admin',
  client: '/client',
  event_manager: '/manager',
  worker: '/worker',
};

export const RootRedirect: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user, token, isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!token) return;

    if (isTokenExpired(token)) {
      dispatch(forceLogout());
      return;
    }

    if (!user && !isLoading) {
      dispatch(fetchCurrentUser());
    }
  }, [token, user, isLoading, dispatch]);

  // While restoring session or authenticating
  if (isLoading || (token && !user && !isTokenExpired(token))) {
    return <LoadingSpinner />;
  }

  // Already authenticated with valid session
  if (isAuthenticated && user) {
    const destination = ROLE_DASHBOARDS[user.role] || '/login';
    return <Navigate to={destination} replace />;
  }

  // Not logged in or expired
  return <Navigate to="/login" replace />;
};
