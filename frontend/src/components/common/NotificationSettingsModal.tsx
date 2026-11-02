import React, { useState, useEffect } from 'react';
import {
  pushSubscriptionService,
  type RegisteredDevice,
} from '../../services/pushSubscriptionService';
import {
  Bell,
  BellOff,
  BellRing,
  Smartphone,
  Laptop,
  Tablet,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Trash2,
  Info,
  ShieldCheck,
} from 'lucide-react';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isCurrentSubscribed, setIsCurrentSubscribed] = useState<boolean>(false);
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const isStandalone =
    typeof window !== 'undefined' &&
    ((typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.navigator as any)?.standalone === true);

  const refreshStatus = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const supported = pushSubscriptionService.isPushSupported();
      setIsSupported(supported);

      const perm = pushSubscriptionService.getPermissionState();
      setPermission(perm);

      if (supported) {
        const browserSub = await pushSubscriptionService.getExistingBrowserSubscription();
        setIsCurrentSubscribed(!!browserSub);
      }

      // Load all registered devices for user
      const userDevices = await pushSubscriptionService.getUserDevices();
      setDevices(userDevices);
    } catch (err: any) {
      console.warn('⚠️ [NotificationSettings] Error loading device state:', err);
      // Non-fatal if offline
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
    }
  }, [isOpen]);

  const handleEnablePush = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await pushSubscriptionService.subscribeCurrentDevice();
      if (!result.success) {
        setError(result.error || 'Failed to enable notifications on this device.');
      } else {
        setSuccessMessage('Push notifications successfully enabled on this device!');
        await refreshStatus();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error subscribing to notifications');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await pushSubscriptionService.unsubscribeCurrentDevice();
      if (!result.success) {
        setError(result.error || 'Failed to disable notifications on this device.');
      } else {
        setSuccessMessage('Notifications disabled on this device.');
        await refreshStatus();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error disabling notifications');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDevice = async (id: string) => {
    setActionLoading(true);
    setError(null);
    try {
      await pushSubscriptionService.removeDevice(id);
      setDevices((prev) => prev.filter((d) => d.id !== id));
      await refreshStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to remove device');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const getDeviceIcon = (type?: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone size={16} className="text-indigo-600" />;
      case 'tablet':
        return <Tablet size={16} className="text-purple-600" />;
      default:
        return <Laptop size={16} className="text-blue-600" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in-50 duration-150"
      data-testid="notification-settings-modal"
    >
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BellRing size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Notification Preferences
              </h2>
              <p className="text-xs text-gray-500">
                Manage web push notifications and registered devices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Feedback Alerts */}
          {error && (
            <div
              className="p-3 bg-red-50 border border-red-200/80 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-in fade-in"
              data-testid="push-error-alert"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-700 flex items-start gap-2 animate-in fade-in"
              data-testid="push-success-alert"
            >
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* iOS Safari Home Screen Notice */}
          {isIOS && !isStandalone && (
            <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <Info size={15} />
                <span>iOS Home Screen Requirement</span>
              </div>
              <p className="leading-relaxed text-amber-800">
                To receive Web Push notifications on iPhone or iPad (iOS 16.4+), tap the{' '}
                <span className="font-semibold">Share</span> icon in Safari, select{' '}
                <span className="font-semibold">'Add to Home Screen'</span>, and open EventOps from
                your Home Screen.
              </p>
            </div>
          )}

          {/* Current Device Status Card */}
          <div className="p-4 bg-gray-50/80 rounded-xl border border-gray-200/70 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                  This Browser / Device
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {isCurrentSubscribed ? 'Notifications Enabled' : 'Notifications Disabled'}
                </span>
              </div>

              {/* Status Badge */}
              {isCurrentSubscribed ? (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100/80 rounded-full"
                  data-testid="current-device-status-enabled"
                >
                  <CheckCircle2 size={13} />
                  Active
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-gray-600 bg-gray-200/80 rounded-full"
                  data-testid="current-device-status-disabled"
                >
                  <BellOff size={13} />
                  Not Enabled
                </span>
              )}
            </div>

            {/* Diagnostic Badges */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200/60 text-xs">
              <div>
                <span className="text-gray-500 block text-[11px]">Browser Support</span>
                <span className="font-semibold text-gray-800">
                  {isSupported ? 'Supported' : 'Unsupported'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block text-[11px]">Permission</span>
                <span
                  className={`font-semibold capitalize ${
                    permission === 'granted'
                      ? 'text-emerald-600'
                      : permission === 'denied'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                  data-testid="permission-status"
                >
                  {permission}
                </span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              {isCurrentSubscribed ? (
                <button
                  type="button"
                  onClick={handleDisablePush}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/80 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  data-testid="disable-push-button"
                >
                  {actionLoading ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={14} />}
                  Disable Notifications on this Device
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={actionLoading || !isSupported}
                  className="w-full py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  data-testid="enable-push-button"
                >
                  {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                  Enable Notifications on this Device
                </button>
              )}
            </div>
          </div>

          {/* Registered Devices List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Registered Devices ({devices.length})
              </h3>
              <button
                type="button"
                onClick={refreshStatus}
                disabled={isLoading}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Refresh
              </button>
            </div>

            {isLoading && devices.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Loading devices...</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
                No devices are currently registered for Web Push notifications.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200/80 rounded-xl overflow-hidden bg-white">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="p-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors text-xs"
                    data-testid={`device-item-${device.id}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        {getDeviceIcon(device.device?.deviceType)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 leading-tight">
                          {device.device?.label || 'Browser Device'}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Added {new Date(device.createdAt).toLocaleDateString()}
                          {device.lastSuccessAt &&
                            ` · Last active ${new Date(device.lastSuccessAt).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDevice(device.id)}
                      disabled={actionLoading}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove device"
                      aria-label="Remove device"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security & Privacy Reassurance */}
          <div className="p-3 bg-gray-50 rounded-xl flex items-start gap-2.5 text-[11px] text-gray-500 leading-relaxed border border-gray-100">
            <ShieldCheck size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-gray-700">Device Privacy: </span>
              Each browser subscription is cryptographically encrypted via VAPID standards.
              Signing out automatically unregisters the device to prevent notification leakage.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 text-xs font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-200/70 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

