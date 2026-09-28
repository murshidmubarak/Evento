import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { fetchCurrentUser, forceLogout } from '../features/auth/authSlice';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading, user, token } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();

  useEffect(() => {
    // Session restore logic
    if (token && !user && !isLoading) {
      dispatch(fetchCurrentUser());
    } else if (!token && isLoading) {
       // Stop loading if no token
       dispatch(forceLogout());
    }
  }, [token, user, isLoading, dispatch]);

  if (isLoading || (token && !user)) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};
