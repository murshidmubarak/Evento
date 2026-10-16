/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { RoleRoute } from '../routes/RoleRoute';
import { RootRedirect } from '../routes/RootRedirect';

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

  it('blocks event_manager from accessing admin-only RoleRoute and redirects to /manager', () => {
    renderWithProviders(
      <Routes>
        <Route element={<RoleRoute allowedRole="admin" />}>
          <Route path="/admin" element={<div>Admin Content</div>} />
        </Route>
        <Route path="/manager" element={<div>Manager Dashboard</div>} />
      </Routes>,
      {
        initialEntries: ['/admin'],
        preloadedState: {
          auth: {
            user: { id: 'em1', name: 'Manager', email: 'em@test.com', role: 'event_manager', isActive: true, createdAt: '', updatedAt: '' },
            token: 'valid',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Manager Dashboard')).toBeDefined();
    expect(screen.queryByText('Admin Content')).toBeNull();
  });

  it('allows event_manager in RoleRoute allowedRole="event_manager"', () => {
    renderWithProviders(
      <Routes>
        <Route element={<RoleRoute allowedRole="event_manager" />}>
          <Route path="/manager" element={<div>Manager Content</div>} />
        </Route>
      </Routes>,
      {
        initialEntries: ['/manager'],
        preloadedState: {
          auth: {
            user: { id: 'em1', name: 'Manager', email: 'em@test.com', role: 'event_manager', isActive: true, createdAt: '', updatedAt: '' },
            token: 'valid',
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }
        }
      }
    );

    expect(screen.getByText('Manager Content')).toBeDefined();
  });

  describe('RootRedirect behavior', () => {
    it('redirects unauthenticated user to /login when visiting root /', () => {
      renderWithProviders(
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>,
        {
          initialEntries: ['/'],
          preloadedState: {
            auth: {
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
            },
          },
        }
      );

      expect(screen.getByText('Login Page')).toBeDefined();
    });

    it('redirects authenticated client to /client when visiting root /', () => {
      renderWithProviders(
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/client" element={<div>Client Dashboard</div>} />
        </Routes>,
        {
          initialEntries: ['/'],
          preloadedState: {
            auth: {
              user: { id: 'c1', name: 'Client User', email: 'c@test.com', role: 'client', isActive: true, createdAt: '', updatedAt: '' },
              token: 'valid',
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
          },
        }
      );

      expect(screen.getByText('Client Dashboard')).toBeDefined();
    });

    it('redirects authenticated admin to /admin when visiting root /', () => {
      renderWithProviders(
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/admin" element={<div>Admin Dashboard</div>} />
        </Routes>,
        {
          initialEntries: ['/'],
          preloadedState: {
            auth: {
              user: { id: 'a1', name: 'Admin User', email: 'a@test.com', role: 'admin', isActive: true, createdAt: '', updatedAt: '' },
              token: 'valid',
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
          },
        }
      );

      expect(screen.getByText('Admin Dashboard')).toBeDefined();
    });

    it('redirects authenticated event_manager to /manager when visiting root /', () => {
      renderWithProviders(
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/manager" element={<div>Manager Dashboard</div>} />
        </Routes>,
        {
          initialEntries: ['/'],
          preloadedState: {
            auth: {
              user: { id: 'em1', name: 'Manager User', email: 'em@test.com', role: 'event_manager', isActive: true, createdAt: '', updatedAt: '' },
              token: 'valid',
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
          },
        }
      );

      expect(screen.getByText('Manager Dashboard')).toBeDefined();
    });

    it('redirects user with expired token to /login and clears session', () => {
      // JWT with exp in the past: {"alg":"none"}.{"exp":1000,"userId":"u1","role":"client"}.sig
      const expiredJwt = 'eyJhbGciOiJub25lIn0.eyJleHAiOjEwMDAsInVzZXJJZCI6InUxIiwicm9sZSI6ImNsaWVudCJ9.sig';

      renderWithProviders(
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>,
        {
          initialEntries: ['/'],
          preloadedState: {
            auth: {
              user: null,
              token: expiredJwt,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            },
          },
        }
      );

      expect(screen.getByText('Login Page')).toBeDefined();
    });
  });
});
