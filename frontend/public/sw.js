/**
 * frontend/public/sw.js
 *
 * EventOps ERP — Browser Service Worker
 *
 * Handles background push notifications, system notification display,
 * foreground coordination, and notification-click navigation.
 */

self.addEventListener('install', () => {
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all open clients immediately
  event.waitUntil(self.clients.claim());
});

/**
 * Validates internal destination route to prevent open redirect vulnerabilities.
 */
function sanitizeDestinationRoute(route) {
  if (!route || typeof route !== 'string') return '/';
  const trimmed = route.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return '/';
}

/**
 * Handle incoming Web Push notification event.
 */
self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'EventOps ERP',
        body: event.data.text() || 'You have a new update.',
      };
    }
  }

  const title = payload.title || 'EventOps ERP';
  const body = payload.body || 'You have a new notification. Open EventOps to view the details.';
  const destinationRoute = sanitizeDestinationRoute(payload.destinationRoute);
  const tag = payload.tag || `eventops-${payload.notificationId || Date.now()}`;

  const notificationOptions = {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag,
    renotify: true,
    data: {
      destinationRoute,
      notificationId: payload.notificationId,
      receivedAt: Date.now(),
    },
  };

  // Broadcast to active windows so foreground components can update state without double alerts
  const broadcastPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          type: 'PUSH_NOTIFICATION_RECEIVED',
          payload: {
            ...payload,
            destinationRoute,
          },
        });
      }
    });

  // Display system notification (required by browsers to comply with userVisibleOnly)
  const showPromise = self.registration.showNotification(title, notificationOptions);

  event.waitUntil(Promise.all([showPromise, broadcastPromise]));
});

/**
 * Handle user click on the browser/system notification.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const destinationRoute = sanitizeDestinationRoute(data.destinationRoute);
  const targetUrl = new URL(destinationRoute, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        // 1. If an EventOps tab is already open, focus it and navigate
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            await client.focus();
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            } else {
              client.postMessage({
                type: 'NAVIGATE_TO_ROUTE',
                route: destinationRoute,
              });
            }
            return;
          }
        }

        // 2. Otherwise open a fresh window to the target route
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

