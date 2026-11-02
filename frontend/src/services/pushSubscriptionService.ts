import { apiClient } from './apiClient';

export interface DeviceMetadata {
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser?: string;
  os?: string;
  label?: string;
}

export interface PushConfigResponse {
  enabled: boolean;
  publicKey: string | null;
}

export interface RegisteredDevice {
  id: string;
  device: DeviceMetadata;
  status: string;
  createdAt: string;
  lastUsedAt?: string;
  lastSuccessAt?: string;
}

export interface SubscribeResult {
  success: boolean;
  subscription?: RegisteredDevice;
  error?: string;
}

/**
 * Converts a base64url string into a Uint8Array required for applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Detects safe, non-invasive device metadata from browser context.
 */
export function detectDeviceMetadata(): DeviceMetadata {
  if (typeof window === 'undefined' || !navigator.userAgent) {
    return { deviceType: 'unknown', browser: 'Unknown', os: 'Unknown', label: 'Web Device' };
  }

  const ua = navigator.userAgent;
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'desktop';
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  // Device type detection
  if (/iPad|tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobile|Android|iP(hone|od)/i.test(ua)) {
    deviceType = 'mobile';
  }

  // OS detection
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Browser detection
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const label = `${browser} on ${os}`;

  return {
    userAgent: ua.slice(0, 500),
    deviceType,
    browser,
    os,
    label,
  };
}

export const pushSubscriptionService = {
  /**
   * Checks if the current environment supports Web Push API.
   */
  isPushSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  /**
   * Checks if running in a secure context (HTTPS or localhost).
   */
  isSecureContext(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  },

  /**
   * Returns current browser Notification permission state.
   */
  getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  },

  /**
   * Registers or ensures the service worker is active.
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isPushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return reg;
    } catch (err) {
      console.error('❌ [PushService] Service worker registration failed:', err);
      return null;
    }
  },

  /**
   * Fetches safe public VAPID configuration from backend.
   */
  async getPushConfig(): Promise<PushConfigResponse> {
    const res = await apiClient.get<{ success: boolean; data: PushConfigResponse }>(
      '/notifications/push/config'
    );
    return res.data.data;
  },

  /**
   * Retrieves active browser PushSubscription if one already exists.
   */
  async getExistingBrowserSubscription(): Promise<PushSubscription | null> {
    if (!this.isPushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  },

  /**
   * Enables Web Push notifications on this browser device.
   * Must only be triggered by an explicit user gesture (button click).
   */
  async subscribeCurrentDevice(): Promise<SubscribeResult> {
    if (!this.isSecureContext()) {
      return {
        success: false,
        error: 'Push notifications require a secure context (HTTPS).',
      };
    }

    if (!this.isPushSupported()) {
      return {
        success: false,
        error: 'Your browser or device does not support Web Push notifications.',
      };
    }

    // 1. Check & request browser permission following user action
    let permission = this.getPermissionState();
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return {
        success: false,
        error:
          'Notification permission was denied. Please allow notifications in your browser settings to enable this device.',
      };
    }

    // 2. Fetch server VAPID configuration
    const config = await this.getPushConfig();
    if (!config.enabled || !config.publicKey) {
      return {
        success: false,
        error: 'Push notification service is currently not configured on the server.',
      };
    }

    // 3. Register or get Service Worker
    const reg = await this.registerServiceWorker();
    if (!reg) {
      return {
        success: false,
        error: 'Failed to initialize service worker registration.',
      };
    }

    // 4. Create or reuse browser subscription
    let browserSub = await reg.pushManager.getSubscription();
    if (!browserSub) {
      const appServerKey = urlBase64ToUint8Array(config.publicKey);
      browserSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = browserSub.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return {
        success: false,
        error: 'Failed to generate browser encryption keys for push subscription.',
      };
    }

    // 5. Send subscription to backend (atomic upsert & account association)
    const device = detectDeviceMetadata();
    const res = await apiClient.post<{ success: boolean; data: RegisteredDevice }>(
      '/notifications/push/subscriptions',
      {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
        device,
      }
    );

    return {
      success: true,
      subscription: res.data.data,
    };
  },

  /**
   * Disables Web Push notifications on the current browser device.
   */
  async unsubscribeCurrentDevice(): Promise<{ success: boolean; error?: string }> {
    if (!this.isPushSupported()) {
      return { success: true };
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const browserSub = await reg.pushManager.getSubscription();

      if (browserSub) {
        // 1. Remove from server
        try {
          await apiClient.delete('/notifications/push/subscriptions/current', {
            data: { endpoint: browserSub.endpoint },
          });
        } catch (serverErr) {
          console.warn('⚠️ [PushService] Server unsubscribe warning:', serverErr);
        }

        // 2. Unsubscribe browser PushManager
        await browserSub.unsubscribe();
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to disable notifications on this device.',
      };
    }
  },

  /**
   * Retrieves all registered devices belonging to the authenticated user.
   */
  async getUserDevices(): Promise<RegisteredDevice[]> {
    const res = await apiClient.get<{ success: boolean; data: { subscriptions: RegisteredDevice[] } }>(
      '/notifications/push/subscriptions'
    );
    return res.data.data.subscriptions;
  },

  /**
   * Deactivates a specific registered device by ID.
   */
  async removeDevice(id: string): Promise<void> {
    await apiClient.delete(`/notifications/push/subscriptions/${id}`);
  },

  /**
   * Called during auth logout to clean up device subscription and prevent account notification leakage.
   */
  async handleLogoutCleanup(): Promise<void> {
    try {
      await this.unsubscribeCurrentDevice();
    } catch (err) {
      console.warn('⚠️ [PushService] Logout push cleanup warning:', err);
    }
  },
};

