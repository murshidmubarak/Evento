/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { RoleRoute } from '../routes/RoleRoute';

const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({ reducer: { auth: authReducer }, preloadedState }),
    initialEntries = ['/'],
  } = {}
) => {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </Provider>
  );
};

describe('Auth Routing', () => {
  it('redirects unauthenticated users from ProtectedRoute to /login', () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>,
      {
        initialEntries: ['/protected'],
        preloadedState: {
          auth: {
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Login Page')).toBeDefined();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('allows authenticated users to see ProtectedRoute', () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
      </Routes>,
      {
        initialEntries: ['/protected'],
        preloadedState: {
          auth: {
            user: { id: '1', name: 'Test', email: 'test@example.com', role: 'admin', isActive: true, createdAt: '', updatedAt: '' },
            token: 'valid',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('redirects user to correct dashboard if wrong role in RoleRoute', () => {
    renderWithProviders(
      <Routes>
        <Route element={<RoleRoute allowedRole="client" />}>
          <Route path="/client" element={<div>Client Content</div>} />
        </Route>
        <Route path="/manager" element={<div>Manager Dashboard</div>} />
      </Routes>,
      {
        initialEntries: ['/client'],
        preloadedState: {
          auth: {
            user: { id: '1', name: 'Manager', email: 'mgr@example.com', role: 'event_manager', isActive: true, createdAt: '', updatedAt: '' },
            token: 'valid',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Manager Dashboard')).toBeDefined();
    expect(screen.queryByText('Client Content')).toBeNull();
  });

  it('allows user with correct role in RoleRoute', () => {
    renderWithProviders(
      <Routes>
        <Route element={<RoleRoute allowedRole="client" />}>
          <Route path="/client" element={<div>Client Content</div>} />
        </Route>
      </Routes>,
      {
        initialEntries: ['/client'],
        preloadedState: {
          auth: {
            user: { id: '1', name: 'Client', email: 'client@example.com', role: 'client', isActive: true, createdAt: '', updatedAt: '' },
            token: 'valid',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Client Content')).toBeDefined();
  });
});
