/**
 * server.ts — application entry point.
 *
 * Responsibilities (in order):
 *  1. Load environment configuration (must happen before any other imports
 *     that read process.env)
 *  2. Connect to MongoDB
 *  3. Start the HTTP server
 *  4. Handle startup errors gracefully
 */
import './config/env.js'; // Side-effect: validates env vars & loads dotenv
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import app from './app.js';

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

  // 2. Start listening
  const server = app.listen(env.port, () => {
    console.log(`🚀 EventOps API running on http://localhost:${env.port}`);
    console.log(`   Environment : ${env.nodeEnv}`);
    console.log(`   Health check: http://localhost:${env.port}/api/health`);
  });

  // 3. Handle unexpected startup / runtime errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${env.port} is already in use`);
    } else {
      console.error('❌ Server error:', error);
    }
    process.exit(1);
  });
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();
