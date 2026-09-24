import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import authRouter from './modules/auth/routes/auth.routes.js';
import userRouter from './modules/users/routes/user.routes.js';

const app = express();

// ─── Global Middlewares ───────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'API is running',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, _res: Response, next): void => {
  next(ApiError.notFound(`Route not found: ${_req.method} ${_req.originalUrl}`));
});

// ─── Centralized Error Middleware ─────────────────────────────────────────────

app.use(errorMiddleware);

export default app;
