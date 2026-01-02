import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables
dotenvConfig({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // PostgreSQL
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().default('5432').transform(Number),
  POSTGRES_DB: z.string().default('crawlscrap'),
  POSTGRES_USER: z.string().default('crawler'),
  POSTGRES_PASSWORD: z.string().default('crawler123'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),

  // Crawler
  MAX_CONCURRENT_WORKERS: z.string().default('10').transform(Number),
  DEFAULT_CRAWL_DELAY_MS: z.string().default('1000').transform(Number),
  MAX_PAGES_PER_JOB: z.string().default('150000').transform(Number),
  REQUEST_TIMEOUT_MS: z.string().default('30000').transform(Number),

  // Rate Limiting
  RATE_LIMIT_REQUESTS_PER_SECOND: z.string().default('5').transform(Number),
  THROTTLE_ON_429_MS: z.string().default('60000').transform(Number),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  server: {
    port: parsed.data.PORT,
    nodeEnv: parsed.data.NODE_ENV,
    isDev: parsed.data.NODE_ENV === 'development',
    isProd: parsed.data.NODE_ENV === 'production',
  },

  database: {
    url: parsed.data.DATABASE_URL ||
      `postgresql://${parsed.data.POSTGRES_USER}:${parsed.data.POSTGRES_PASSWORD}@${parsed.data.POSTGRES_HOST}:${parsed.data.POSTGRES_PORT}/${parsed.data.POSTGRES_DB}`,
    host: parsed.data.POSTGRES_HOST,
    port: parsed.data.POSTGRES_PORT,
    database: parsed.data.POSTGRES_DB,
    user: parsed.data.POSTGRES_USER,
    password: parsed.data.POSTGRES_PASSWORD,
  },

  redis: {
    host: parsed.data.REDIS_HOST,
    port: parsed.data.REDIS_PORT,
    password: parsed.data.REDIS_PASSWORD,
  },

  crawler: {
    maxConcurrentWorkers: parsed.data.MAX_CONCURRENT_WORKERS,
    defaultCrawlDelayMs: parsed.data.DEFAULT_CRAWL_DELAY_MS,
    maxPagesPerJob: parsed.data.MAX_PAGES_PER_JOB,
    requestTimeoutMs: parsed.data.REQUEST_TIMEOUT_MS,
  },

  rateLimit: {
    requestsPerSecond: parsed.data.RATE_LIMIT_REQUESTS_PER_SECOND,
    throttleOn429Ms: parsed.data.THROTTLE_ON_429_MS,
  },

  logging: {
    level: parsed.data.LOG_LEVEL,
  },
} as const;

export default config;
