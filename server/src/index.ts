import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { getPool, closePool, healthCheck as dbHealthCheck } from './db/index.js';
import { getRedisClient, closeRedis, healthCheck as redisHealthCheck } from './queue/queues.js';
import { initializeWorkers, shutdownWorkers } from './queue/workers.js';

// Import API routes
import crawlRoutes from './api/crawl.js';
import jobsRoutes from './api/jobs.js';
import pagesRoutes from './api/pages.js';
import cancelRoutes from './api/cancel.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.method === 'POST' ? req.body : undefined,
  });
  next();
});

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbOk = await dbHealthCheck();
  const redisOk = await redisHealthCheck();

  const status = dbOk && redisOk ? 'healthy' : 'unhealthy';
  const statusCode = status === 'healthy' ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: dbOk ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
    },
  });
});

// API Routes
app.use('/api/crawl', crawlRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/jobs', pagesRoutes);
app.use('/api/jobs', cancelRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: config.server.isDev ? err.message : undefined,
  });
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    await shutdownWorkers();
    await closeRedis();
    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Initialize database connection
    await getPool();
    logger.info('Database connection established');

    // Initialize Redis connection
    await getRedisClient();
    logger.info('Redis connection established');

    // Initialize workers
    await initializeWorkers();
    logger.info('Workers initialized');

    app.listen(config.server.port, () => {
      logger.info(`Server running on port ${config.server.port}`, {
        env: config.server.nodeEnv,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

start();
