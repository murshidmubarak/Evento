import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from '../pages/Login';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';

import { AdminLayout } from '../layouts/AdminLayout';
import { ClientLayout } from '../layouts/ClientLayout';
import { ManagerLayout } from '../layouts/ManagerLayout';
import { WorkerLayout } from '../layouts/WorkerLayout';

import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { ClientDashboard } from '../pages/client/ClientDashboard';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';
import { WorkerDashboard } from '../pages/worker/WorkerDashboard';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        {/* Admin Routes */}
        <Route element={<RoleRoute allowedRole="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* Client Routes */}
        <Route element={<RoleRoute allowedRole="client" />}>
          <Route path="/client" element={<ClientLayout />}>
            <Route index element={<ClientDashboard />} />
          </Route>
        </Route>

        {/* Manager Routes */}
        <Route element={<RoleRoute allowedRole="event_manager" />}>
          <Route path="/manager" element={<ManagerLayout />}>
            <Route index element={<ManagerDashboard />} />
          </Route>
        </Route>

        {/* Worker Routes */}
        <Route element={<RoleRoute allowedRole="worker" />}>
          <Route path="/worker" element={<WorkerLayout />}>
            <Route index element={<WorkerDashboard />} />
          </Route>
        </Route>
      </Route>

      {/* Default fallback to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
