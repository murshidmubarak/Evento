import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

let io: SocketIOServer | null = null;

export interface AuthenticatedSocketUser {
  id: string;
  role: string;
  email?: string;
  name?: string;
}

export interface AuthenticatedSocket extends Socket {
  data: {
    user: AuthenticatedSocketUser;
  };
}

/**
 * Initializes and attaches the Socket.IO server to the existing Node.js HTTP server.
 */
export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  if (io) {
    return io;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, tests, curl)
        if (!origin) return callback(null, true);
        
        // Match configured frontendUrl or localhost development ports
        if (
          origin === env.frontendUrl ||
          /^http:\/\/(localhost|127\.0\.0\.1):(5173|5174|3000|5000)$/.test(origin)
        ) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in dev/test, constrained by JWT auth
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // ── Authentication Middleware ──────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : null);

      if (!rawToken) {
        return next(new Error('Authentication error: Token required'));
      }

      const decoded = jwt.verify(rawToken, env.jwtSecret) as any;
      const userId = decoded.id || decoded.userId;
      if (!decoded || !userId) {
        return next(new Error('Authentication error: Invalid token'));
      }

      socket.data.user = {
        id: userId.toString(),
        role: decoded.role || '',
        email: decoded.email,
        name: decoded.name,
      };

      next();
    } catch (err: any) {
      return next(new Error(`Authentication error: ${err.message || 'Token verification failed'}`));
    }
  });

  // ── Connection Lifecycle ───────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthenticatedSocketUser;
    const userRoom = `user:${user.id}`;

    // Strictly join ONLY the authenticated user's private room
    socket.join(userRoom);

    // Block client attempts to join arbitrary rooms
    socket.on('join_room', () => {
      // Intentionally ignored / denied
    });

    socket.on('disconnect', (_reason) => {
      // Clean up connection
    });
  });

  return io;
};

/**
 * Returns the active Socket.IO server instance or null if not yet initialized.
 */
export const getSocketServer = (): SocketIOServer | null => {
  return io;
};

/**
 * Closes the active Socket.IO server.
 */
export const closeSocketServer = async (): Promise<void> => {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        io = null;
        resolve();
      });
    });
  }
};
