import http from 'node:http';
import './config/env.js'; // Side-effect: validates env vars & loads dotenv
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';
import { initSocketServer, closeSocketServer } from './sockets/socket.server.js';
import { notificationTransport } from './sockets/notification-transport.js';

let httpServer: http.Server | null = null;

const startServer = async (): Promise<void> => {
  // 1. Connect to MongoDB before accepting HTTP requests
  await connectDB();

  // Ensure default catalog services exist and are active
  if (env.nodeEnv !== 'test') {
    try {
      const { ServiceService } = await import('./modules/services/service/service.service.js');
      const serviceService = new ServiceService();
      await serviceService.ensureDefaultServices();
      console.log('✅ Default services verified & ready');
    } catch (seedErr) {
      console.warn('⚠️ Could not verify default services on startup:', seedErr);
    }
  }

  // 2. Create single Node.js HTTP server and attach Socket.IO
  httpServer = http.createServer(app);
  initSocketServer(httpServer);
  notificationTransport.initSubscriber();

  // 3. Start listening
  httpServer.listen(env.port, () => {
    console.log(`🚀 EventOps API running on http://localhost:${env.port}`);
    console.log(`   Environment : ${env.nodeEnv}`);
    console.log(`   Socket.IO   : Attached & listening on port ${env.port}`);
    console.log(`   Health check: http://localhost:${env.port}/api/health`);
  });

  // 4. Handle unexpected startup / runtime errors
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${env.port} is already in use`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n🛑 Received ${signal}. Shutting down server gracefully...`);
  try {
    await closeSocketServer();
    await notificationTransport.close();

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
    }

    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log('👋 Server shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();

