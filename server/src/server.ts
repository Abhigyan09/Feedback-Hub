import http from 'http';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { ENV } from './config/env.js';
import { initSocketServer } from './services/socket.js';
import { authenticate } from './middleware/authenticate.js';
import { tenantContextMiddleware } from './middleware/tenantContext.js';
import { ticketRouter } from './routes/tickets.routes.js';
import { ingestRouter } from './routes/ingest.routes.js';
import { tenantRouter } from './routes/tenants.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { hashPassword } from './services/auth.service.js';
import { tenantStore, isPostgresConnected } from './config/db.js';
import { corsMiddleware, csrfOriginProtection } from './middleware/security.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initSocketServer(server);

// Security & Parsing Middleware
app.use(helmet({
  contentSecurityPolicy: ENV.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false
}));
app.use(corsMiddleware);
app.use(csrfOriginProtection);
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Healthcheck Route
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Feedback-Hub Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Authentication Routes
app.use('/api/v1/auth', authRouter);

// Public Telemetry Ingest Route (No tenant auth required, uses X-Product-Key)
app.use('/api/v1/ingest', ingestRouter);

// Authenticated & Tenant-Scoped Routes (Protected by JWT Authenticate + Tenant Context)
app.use('/api/v1/tickets', authenticate, tenantContextMiddleware, ticketRouter);
app.use('/api/v1/tenants', authenticate, tenantContextMiddleware, tenantRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.name === 'CorsError' || err.status === 403) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'CORS_ORIGIN_DENIED',
      message: err.message
    });
  }

  console.error('[API Error]', err);
  const isProd = ENV.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Internal Server Error' : (err.name || 'Internal Server Error'),
    message: isProd ? 'An unexpected internal error occurred.' : (err.message || 'An unexpected error occurred.')
  });
});

const isTestEnvironment = process.argv.some(arg => arg.includes('test'));

async function startServer() {
  if (isTestEnvironment) {
    return;
  }

  // Initialize development mock-user password hashes before accepting requests
  if (ENV.NODE_ENV !== 'production' && !isPostgresConnected) {
    try {
      await tenantStore.ensureDevSeedCredentials(hashPassword, 'DevPassword123!');
      console.log('[Dev Auth] In-memory development credentials initialized.');
    } catch (err: any) {
      console.error('[Dev Auth] Failed to initialize development credentials:', err?.message || err);
    }
  }

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Feedback-Hub API] Port ${ENV.PORT} is already in use by active instance.`);
    } else {
      console.error('[Feedback-Hub API] Server error:', err);
    }
  });

  server.listen(ENV.PORT, () => {
    console.log(`=======================================================`);
    console.log(`[Feedback-Hub API] Running on http://localhost:${ENV.PORT}`);
    console.log(`[Multi-Tenancy] Row-Level Isolation Activated`);
    console.log(`[Real-Time] WebSockets active on ws://localhost:${ENV.PORT}`);
    console.log(`=======================================================`);
  });
}

startServer();

export { app, server };
