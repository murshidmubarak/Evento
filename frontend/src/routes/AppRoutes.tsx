import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import { Login } from '../pages/Login';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';

import { AdminLayout } from '../layouts/AdminLayout';
import { AdminDashboard } from '../pages/admin/AdminDashboard';

import { ClientLayout } from '../layouts/ClientLayout';
import { ClientDashboard } from '../pages/client/ClientDashboard';
import { MyEvents } from '../pages/client/MyEvents';
import { CreateEvent } from '../pages/client/CreateEvent';
import { EventDetails } from '../pages/client/EventDetails';

import { ManagerLayout } from '../layouts/ManagerLayout';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';

import { WorkerLayout } from '../layouts/WorkerLayout';
import { WorkerDashboard } from '../pages/worker/WorkerDashboard';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
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
            <Route path="events" element={<MyEvents />} />
            <Route path="events/create" element={<CreateEvent />} />
            <Route path="events/:id" element={<EventDetails />} />
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
    </Routes>
  );
};
