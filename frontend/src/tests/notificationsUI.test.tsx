import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '../features/auth/authSlice';
import notificationReducer, {
  notificationReceived,
  type NotificationItem,
} from '../features/notifications/notificationSlice';
import { NotificationBell } from '../components/common/NotificationBell';
import { notificationsApi } from '../features/notifications/notificationsApi';

// Mock notificationsApi
vi.mock('../features/notifications/notificationsApi', () => ({
  notificationsApi: {
    getNotifications: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

// Mock socketClient
vi.mock('../services/socketClient', () => ({
  initializeSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => null),
  getSocketUrl: vi.fn(() => 'http://localhost:5000'),
}));

const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('NotificationBell & Notification UI Component Tests', () => {
  const sampleNotifications: NotificationItem[] = [
    {
      _id: 'notif_1',
      recipientId: 'user_1',
      type: 'work_opportunity',
      title: 'New catering opportunity',
      message: 'A new requirement matching your skills has been announced.',
      isRead: false,
      destinationRoute: '/worker',
      createdAt: new Date(Date.now() - 60000).toISOString(), // 1m ago
    },
    {
      _id: 'notif_2',
      recipientId: 'user_1',
      type: 'assignment_confirmed',
      title: 'Assignment confirmed',
      message: 'You have been selected for Global Summit 2026.',
      isRead: true,
      destinationRoute: '/worker',
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
    },
  ];

  const createTestStore = (initialNotificationState?: any) => {
    return configureStore({
      reducer: {
        auth: authReducer,
        notifications: notificationReducer,
      },
      preloadedState: {
        auth: {
          user: {
            id: 'user_1',
            name: 'Test Worker',
            email: 'worker@eventops.com',
            role: 'worker',
            isActive: true,
          } as any,
          token: 'valid_token_abc',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
        notifications: initialNotificationState || {
          items: sampleNotifications,
          unreadCount: 1,
          isLoading: false,
          error: null,
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasMore: false,
          isConnected: true,
        },
      },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationsApi.getNotifications).mockResolvedValue({
      notifications: sampleNotifications,
      unreadCount: 1,
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    vi.mocked(notificationsApi.markAsRead).mockImplementation(async (id) => {
      const match = sampleNotifications.find((n) => n._id === id);
      return { ...(match || sampleNotifications[0]), isRead: true, readAt: new Date().toISOString() };
    });
    vi.mocked(notificationsApi.markAllAsRead).mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders NotificationBell with unread badge count when unreadCount > 0', () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const badge = screen.getByTestId('unread-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('1');
  });

  it('2. Opens notification panel on click displaying notifications, title, and relative time', () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const button = screen.getByRole('button', { name: /View notifications/i });
    fireEvent.click(button);

    const panel = screen.getByTestId('notification-panel');
    expect(panel).toBeInTheDocument();

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('New catering opportunity')).toBeInTheDocument();
    expect(screen.getByText('Assignment confirmed')).toBeInTheDocument();
    expect(screen.getByText('1m ago')).toBeInTheDocument();
  });

  it('3. Renders empty state when user has no notifications', async () => {
    vi.mocked(notificationsApi.getNotifications).mockResolvedValueOnce({
      notifications: [],
      unreadCount: 0,
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const store = createTestStore({
      items: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasMore: false,
      isConnected: true,
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const button = screen.getByRole('button', { name: /View notifications/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
  });

  it('4. Filters notifications between All and Unread tabs', () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const button = screen.getByRole('button', { name: /View notifications/i });
    fireEvent.click(button);

    // Initial 'All' tab shows both
    expect(screen.getByText('New catering opportunity')).toBeInTheDocument();
    expect(screen.getByText('Assignment confirmed')).toBeInTheDocument();

    // Click 'Unread' tab
    const unreadTab = screen.getByRole('button', { name: /Unread \(1\)/i });
    fireEvent.click(unreadTab);

    // Unread item remains, read item is hidden
    expect(screen.getByText('New catering opportunity')).toBeInTheDocument();
    expect(screen.queryByText('Assignment confirmed')).not.toBeInTheDocument();
  });

  it('5. Marks all notifications as read when clicking Mark all read', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const button = screen.getByRole('button', { name: /View notifications/i });
    fireEvent.click(button);

    const markAllBtn = screen.getByRole('button', { name: /Mark all read/i });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(notificationsApi.markAllAsRead).toHaveBeenCalledTimes(1);
    });
  });

  it('6. Marks notification as read and navigates to safe internal route on click', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    const button = screen.getByRole('button', { name: /View notifications/i });
    fireEvent.click(button);

    const unreadItem = screen.getByText('New catering opportunity');
    fireEvent.click(unreadItem);

    await waitFor(() => {
      expect(notificationsApi.markAsRead).toHaveBeenCalledWith('notif_1');
      expect(mockedNavigate).toHaveBeenCalledWith('/worker');
    });
  });

  it('7. Real-time notification received action increments badge and prepends item', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </Provider>
    );

    // Initial badge is 1
    expect(screen.getByTestId('unread-badge').textContent).toBe('1');

    // Simulate real-time socket event arriving
    store.dispatch(
      notificationReceived({
        _id: 'notif_realtime_99',
        recipientId: 'user_1',
        type: 'selection_summary',
        title: 'Real-time update',
        message: 'A real-time message has arrived',
        isRead: false,
        createdAt: new Date().toISOString(),
      })
    );

    // Badge updates to 2 instantly
    await waitFor(() => {
      expect(screen.getByTestId('unread-badge').textContent).toBe('2');
    });
  });
});
