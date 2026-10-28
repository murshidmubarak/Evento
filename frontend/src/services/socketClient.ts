import { io, Socket } from 'socket.io-client';
import { store } from '../store';
import {
  notificationReceived,
  setSocketConnected,
  fetchNotifications,
} from '../features/notifications/notificationSlice';

let socket: Socket | null = null;
let currentToken: string | null = null;

export const getSocketUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (!apiUrl) {
    throw new Error('VITE_API_URL environment variable is missing.');
  }
  return apiUrl.replace(/\/api\/?$/, '');
};

export const initializeSocket = (token: string): Socket => {
  if (socket && currentToken === token) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // If token changed or existing socket, disconnect previous
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  const socketUrl = getSocketUrl();

  socket = io(socketUrl, {
    auth: {
      token,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    store.dispatch(setSocketConnected(true));
    // Re-synchronize notifications and unread count after (re)connecting
    store.dispatch(fetchNotifications({ page: 1 }));
  });

  socket.on('disconnect', (_reason) => {
    store.dispatch(setSocketConnected(false));
  });

  socket.on('connect_error', (err) => {
    store.dispatch(setSocketConnected(false));
    console.warn('⚠️ [SocketClient] Connection error:', err.message);
  });

  socket.on('notification', (payload) => {
    store.dispatch(notificationReceived(payload));
  });

  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentToken = null;
  store.dispatch(setSocketConnected(false));
};

export const getSocket = (): Socket | null => {
  return socket;
};
