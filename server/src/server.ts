import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ENV } from './config/env.js';
import { initSocketServer } from './services/socket.js';
import { tenantContextMiddleware } from './middleware/tenantContext.js';
import { ticketRouter } from './routes/tickets.routes.js';
import { ingestRouter } from './routes/ingest.routes.js';
import { tenantRouter } from './routes/tenants.routes.js';

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initSocketServer(server);

// Security & Parsing Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allows easy local dev testing
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-User-Role', 'X-Product-Key', 'X-User-Email', 'X-User-Id']
}));
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

// Public Telemetry Ingest Route (No tenant auth required, uses X-Product-Key)
app.use('/api/v1/ingest', ingestRouter);

// Authenticated & Tenant-Scoped Routes
app.use('/api/v1/tickets', tenantContextMiddleware, ticketRouter);
app.use('/api/v1/tenants', tenantContextMiddleware, tenantRouter);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});

server.listen(ENV.PORT, () => {
  console.log(`=======================================================`);
  console.log(`[Feedback-Hub API] Running on http://localhost:${ENV.PORT}`);
  console.log(`[Multi-Tenancy] Row-Level Isolation Activated`);
  console.log(`[Real-Time] WebSockets active on ws://localhost:${ENV.PORT}`);
  console.log(`=======================================================`);
});

export { app, server };
