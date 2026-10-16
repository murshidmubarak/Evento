import { Routes, Route } from 'react-router-dom';
import { RootRedirect } from './RootRedirect';
import { Login } from '../pages/Login';
import { Signup } from '../pages/Signup';
import { VerifyEmail } from '../pages/VerifyEmail';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';

import { AdminLayout } from '../layouts/AdminLayout';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminRequestedEvents } from '../pages/admin/AdminRequestedEvents';
import { AdminEventDetails } from '../pages/admin/AdminEventDetails';
import { AdminCreateQuotation } from '../pages/admin/AdminCreateQuotation';
import { AdminQuotations } from '../pages/admin/AdminQuotations';
import { AdminQuotationSuccess } from '../pages/admin/AdminQuotationSuccess';
import { AdminViewQuotation } from '../pages/admin/AdminViewQuotation';
import { AdminEventManagers } from '../pages/admin/AdminEventManagers';

import { ClientLayout } from '../layouts/ClientLayout';
import { ClientDashboard } from '../pages/client/ClientDashboard';
import { MyEvents } from '../pages/client/MyEvents';
import { CreateEvent } from '../pages/client/CreateEvent';
import { EventDetails } from '../pages/client/EventDetails';
import { ClientQuotations } from '../pages/client/ClientQuotations';
import { ClientViewQuotation } from '../pages/client/ClientViewQuotation';
import { ClientAdvancePayment } from '../pages/client/ClientAdvancePayment';
import { ClientPaymentReturn } from '../pages/client/ClientPaymentReturn';

import { ManagerLayout } from '../layouts/ManagerLayout';
import { ManagerDashboard } from '../pages/manager/ManagerDashboard';

import { WorkerLayout } from '../layouts/WorkerLayout';
import { WorkerDashboard } from '../pages/worker/WorkerDashboard';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      
      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        {/* Admin Routes */}
        <Route element={<RoleRoute allowedRole="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="events" element={<AdminRequestedEvents />} />
            <Route path="events/:id" element={<AdminEventDetails />} />
            <Route path="events/:id/quotation/create" element={<AdminCreateQuotation />} />
            <Route path="quotations" element={<AdminQuotations />} />
            <Route path="quotations/:id" element={<AdminViewQuotation />} />
            <Route path="quotations/success/:id" element={<AdminQuotationSuccess />} />
            <Route path="managers" element={<AdminEventManagers />} />
          </Route>
        </Route>

        {/* Client Routes */}
        <Route element={<RoleRoute allowedRole="client" />}>
          <Route path="/client" element={<ClientLayout />}>
            <Route index element={<ClientDashboard />} />
            <Route path="events" element={<MyEvents />} />
            <Route path="events/create" element={<CreateEvent />} />
            <Route path="events/:id" element={<EventDetails />} />
            <Route path="events/:id/payment" element={<ClientAdvancePayment />} />
            <Route path="payment-return" element={<ClientPaymentReturn />} />
            <Route path="quotations" element={<ClientQuotations />} />
            <Route path="quotations/:id" element={<ClientViewQuotation />} />
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

      {/* Catch-all fallback */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
};
