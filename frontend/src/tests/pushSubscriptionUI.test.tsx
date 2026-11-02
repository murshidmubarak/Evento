import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';

import authReducer from '../features/auth/authSlice';
import notificationReducer from '../features/notifications/notificationSlice';
import { NotificationSettingsModal } from '../components/common/NotificationSettingsModal';
import {
  pushSubscriptionService,
  urlBase64ToUint8Array,
  detectDeviceMetadata,
} from '../services/pushSubscriptionService';

describe('Notification Milestone 3 — Part 3C: Frontend Push Subscription & Service Worker Integration', () => {
  let store: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    store = configureStore({
      reducer: {
        auth: authReducer,
        notifications: notificationReducer,
      },
      preloadedState: {
        auth: {
          user: {
            id: 'u_test_1',
            name: 'Test Client',
            email: 'client@example.com',
            role: 'client' as const,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          token: 'mock-jwt-token',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Capability & Helper Unit Tests ──────────────────────────────────────────

  describe('Capability Detection & Cryptographic Helpers', () => {
    it('1. urlBase64ToUint8Array correctly converts VAPID public key into Uint8Array', () => {
      const vapidPublic =
        'BIaICaseh43MKa_Pkb_OINZJyM730gvSbwszYaDU8boCtpRg7t4FEnGsyflgeYP7IM7Qtaxo29paan_gPwoUZAQ';
      const arr = urlBase64ToUint8Array(vapidPublic);
      expect(arr).toBeInstanceOf(Uint8Array);
      expect(arr.length).toBe(65); // standard P-256 public key length
    });

    it('2. detectDeviceMetadata detects browser and OS hints safely', () => {
      const meta = detectDeviceMetadata();
      expect(meta).toBeDefined();
      expect(meta.deviceType).toMatch(/desktop|mobile|tablet|unknown/);
      expect(typeof meta.label).toBe('string');
    });

    it('3. isPushSupported returns false when PushManager or ServiceWorker are missing', () => {
      const originalPush = window.PushManager;
      // @ts-ignore
      delete window.PushManager;

      expect(pushSubscriptionService.isPushSupported()).toBe(false);

      // Restore
      window.PushManager = originalPush;
    });
  });

  // ─── 2. Notification Settings Modal UI Component Tests ─────────────────────────

  describe('NotificationSettingsModal Component', () => {
    it('1. Renders modal when open with diagnostic permission & device statuses', async () => {
      vi.spyOn(pushSubscriptionService, 'isPushSupported').mockReturnValue(true);
      vi.spyOn(pushSubscriptionService, 'getPermissionState').mockReturnValue('default');
      vi.spyOn(pushSubscriptionService, 'getExistingBrowserSubscription').mockResolvedValue(null);
      vi.spyOn(pushSubscriptionService, 'getUserDevices').mockResolvedValue([
        {
          id: 'dev_1',
          device: { label: 'Chrome on Windows', deviceType: 'desktop' },
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ]);

      render(
        <Provider store={store}>
          <BrowserRouter>
            <NotificationSettingsModal isOpen={true} onClose={() => {}} />
          </BrowserRouter>
        </Provider>
      );

      expect(screen.getByTestId('notification-settings-modal')).toBeInTheDocument();
      expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
      expect(screen.getByTestId('permission-status')).toHaveTextContent('default');
      expect(screen.getByTestId('current-device-status-disabled')).toBeInTheDocument();
      expect(screen.getByTestId('enable-push-button')).toBeInTheDocument();

      // Verify registered device row
      await waitFor(() => {
        expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
      });
    });

    it('2. Successfully enables push on user click gesture and displays active status', async () => {
      vi.spyOn(pushSubscriptionService, 'isPushSupported').mockReturnValue(true);
      vi.spyOn(pushSubscriptionService, 'getPermissionState').mockReturnValue('default');
      vi.spyOn(pushSubscriptionService, 'getExistingBrowserSubscription').mockResolvedValue(null);
      vi.spyOn(pushSubscriptionService, 'getUserDevices').mockResolvedValue([]);

      const subscribeSpy = vi
        .spyOn(pushSubscriptionService, 'subscribeCurrentDevice')
        .mockResolvedValue({
          success: true,
          subscription: {
            id: 'new_sub_123',
            device: { label: 'Current Device' },
            status: 'active',
            createdAt: new Date().toISOString(),
          },
        });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <NotificationSettingsModal isOpen={true} onClose={() => {}} />
          </BrowserRouter>
        </Provider>
      );

      const enableBtn = screen.getByTestId('enable-push-button');
      fireEvent.click(enableBtn);

      await waitFor(() => {
        expect(subscribeSpy).toHaveBeenCalledTimes(1);
        expect(
          screen.getByText('Push notifications successfully enabled on this device!')
        ).toBeInTheDocument();
      });
    });

    it('3. Displays error message when user denies browser permission', async () => {
      vi.spyOn(pushSubscriptionService, 'isPushSupported').mockReturnValue(true);
      vi.spyOn(pushSubscriptionService, 'getPermissionState').mockReturnValue('denied');
      vi.spyOn(pushSubscriptionService, 'getExistingBrowserSubscription').mockResolvedValue(null);
      vi.spyOn(pushSubscriptionService, 'getUserDevices').mockResolvedValue([]);

      vi.spyOn(pushSubscriptionService, 'subscribeCurrentDevice').mockResolvedValue({
        success: false,
        error:
          'Notification permission was denied. Please allow notifications in your browser settings to enable this device.',
      });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <NotificationSettingsModal isOpen={true} onClose={() => {}} />
          </BrowserRouter>
        </Provider>
      );

      const enableBtn = screen.getByTestId('enable-push-button');
      fireEvent.click(enableBtn);

      await waitFor(() => {
        expect(screen.getByTestId('push-error-alert')).toBeInTheDocument();
        expect(screen.getByTestId('push-error-alert')).toHaveTextContent(
          'Notification permission was denied'
        );
      });
    });

    it('4. Allows user to disable notifications on current device', async () => {
      vi.spyOn(pushSubscriptionService, 'isPushSupported').mockReturnValue(true);
      vi.spyOn(pushSubscriptionService, 'getPermissionState').mockReturnValue('granted');
      // Current device IS subscribed
      vi.spyOn(pushSubscriptionService, 'getExistingBrowserSubscription').mockResolvedValue({
        endpoint: 'https://test-endpoint',
      } as any);
      vi.spyOn(pushSubscriptionService, 'getUserDevices').mockResolvedValue([]);

      const unsubscribeSpy = vi
        .spyOn(pushSubscriptionService, 'unsubscribeCurrentDevice')
        .mockResolvedValue({ success: true });

      render(
        <Provider store={store}>
          <BrowserRouter>
            <NotificationSettingsModal isOpen={true} onClose={() => {}} />
          </BrowserRouter>
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-device-status-enabled')).toBeInTheDocument();
        expect(screen.getByTestId('disable-push-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('disable-push-button'));

      await waitFor(() => {
        expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Notifications disabled on this device.')).toBeInTheDocument();
      });
    });

    it('5. Allows user to remove an old registered device from the list', async () => {
      vi.spyOn(pushSubscriptionService, 'isPushSupported').mockReturnValue(true);
      vi.spyOn(pushSubscriptionService, 'getExistingBrowserSubscription').mockResolvedValue(null);
      vi.spyOn(pushSubscriptionService, 'getUserDevices').mockResolvedValue([
        {
          id: 'dev_old_phone',
          device: { label: 'Old Android Phone', deviceType: 'mobile' },
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ]);

      const removeSpy = vi
        .spyOn(pushSubscriptionService, 'removeDevice')
        .mockResolvedValue(undefined);

      render(
        <Provider store={store}>
          <BrowserRouter>
            <NotificationSettingsModal isOpen={true} onClose={() => {}} />
          </BrowserRouter>
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Old Android Phone')).toBeInTheDocument();
      });

      const removeBtn = screen.getByRole('button', { name: /Remove device/i });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(removeSpy).toHaveBeenCalledWith('dev_old_phone');
      });
    });
  });

  // ─── 3. Auth Logout Cleanup & Shared Device Security ──────────────────────────

  describe('Logout Push Cleanup & Security Guard', () => {
    it('1. handleLogoutCleanup calls unsubscribe on active browser subscription', async () => {
      const unsubSpy = vi
        .spyOn(pushSubscriptionService, 'unsubscribeCurrentDevice')
        .mockResolvedValue({ success: true });

      await pushSubscriptionService.handleLogoutCleanup();

      expect(unsubSpy).toHaveBeenCalledTimes(1);
    });

    it('2. Logout cleanup failure does not throw or prevent logout completion', async () => {
      vi.spyOn(pushSubscriptionService, 'unsubscribeCurrentDevice').mockRejectedValue(
        new Error('Network offline')
      );

      // Must complete without unhandled rejection
      await expect(pushSubscriptionService.handleLogoutCleanup()).resolves.not.toThrow();
    });
  });
});

