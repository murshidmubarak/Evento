import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { ApiError } from './utils/ApiError.js';
import authRouter from './modules/auth/routes/auth.routes.js';
import userRouter from './modules/users/routes/user.routes.js';
import serviceRouter from './modules/services/routes/service.routes.js';
import eventRouter from './modules/events/routes/event.routes.js';
import quotationRouter from './modules/quotations/routes/quotation.routes.js';
import paymentRouter from './modules/payments/routes/payment.routes.js';
import adminEventRouter from './modules/events/routes/admin-event.routes.js';
import managerEventRouter from './modules/events/routes/manager-event.routes.js';
import webhookRouter from './modules/payments/routes/webhook.routes.js';

const app = express();

// ─── Global Middlewares ───────────────────────────────────────────────────────

app.use(cors());
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: Buffer) => {
      req.rawBody = buf;
    },
  })
);
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
app.use('/api/services', serviceRouter);
app.use('/api/events', eventRouter);
app.use('/api/admin/events', adminEventRouter);
app.use('/api/manager', managerEventRouter);
app.use('/api/quotations', quotationRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/webhooks', webhookRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────


app.use((_req: Request, _res: Response, next): void => {
  next(ApiError.notFound(`Route not found: ${_req.method} ${_req.originalUrl}`));
});

// ─── Centralized Error Middleware ─────────────────────────────────────────────

app.use(errorMiddleware);

export default app;
