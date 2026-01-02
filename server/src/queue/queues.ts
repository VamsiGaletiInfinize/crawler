import { Queue, QueueEvents, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Redis connection configuration
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.debug('Redis connected');
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

// Job data interfaces
export interface CrawlJobData {
  jobId: string;
  seedUrl: string;
  domain: string;
  maxDepth: number;
  maxPages: number;
  maxConcurrentWorkers: number;
  crawlDelayMs: number;
  respectRobotsTxt: boolean;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface PageJobData {
  jobId: string;
  url: string;
  normalizedUrl: string;
  depth: number;
  domain: string;
  crawlDelayMs: number;
  respectRobotsTxt: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  maxDepth: number;
}

// Queue names
export const QUEUE_NAMES = {
  CRAWL_JOBS: 'crawl-jobs',
  PAGE_JOBS: 'page-jobs',
} as const;

// Create queues
let crawlJobsQueue: Queue<CrawlJobData> | null = null;
let pageJobsQueue: Queue<PageJobData> | null = null;
let crawlJobsEvents: QueueEvents | null = null;
let pageJobsEvents: QueueEvents | null = null;

export function getCrawlJobsQueue(): Queue<CrawlJobData> {
  if (!crawlJobsQueue) {
    crawlJobsQueue = new Queue<CrawlJobData>(QUEUE_NAMES.CRAWL_JOBS, {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
  }
  return crawlJobsQueue;
}

export function getPageJobsQueue(): Queue<PageJobData> {
  if (!pageJobsQueue) {
    pageJobsQueue = new Queue<PageJobData>(QUEUE_NAMES.PAGE_JOBS, {
      connection: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }
  return pageJobsQueue;
}

export function getCrawlJobsEvents(): QueueEvents {
  if (!crawlJobsEvents) {
    crawlJobsEvents = new QueueEvents(QUEUE_NAMES.CRAWL_JOBS, {
      connection: redisConfig,
    });
  }
  return crawlJobsEvents;
}

export function getPageJobsEvents(): QueueEvents {
  if (!pageJobsEvents) {
    pageJobsEvents = new QueueEvents(QUEUE_NAMES.PAGE_JOBS, {
      connection: redisConfig,
    });
  }
  return pageJobsEvents;
}

// Add a crawl job to the queue
export async function addCrawlJob(
  jobId: string,
  data: CrawlJobData
): Promise<Job<CrawlJobData>> {
  const queue = getCrawlJobsQueue();
  const job = await queue.add(`crawl-${jobId}`, data, {
    jobId,
    priority: 1,
  });

  logger.info('Crawl job added to queue', { jobId, seedUrl: data.seedUrl });
  return job;
}

// Add page jobs to the queue in batch
export async function addPageJobs(
  jobId: string,
  pages: Array<{
    url: string;
    normalizedUrl: string;
    depth: number;
    domain: string;
    crawlDelayMs: number;
    respectRobotsTxt: boolean;
    includePatterns: string[];
    excludePatterns: string[];
    maxDepth: number;
  }>
): Promise<void> {
  if (pages.length === 0) return;

  const queue = getPageJobsQueue();

  const jobs = pages.map((page) => ({
    name: `page-${jobId}-${page.normalizedUrl.substring(0, 50)}`,
    data: {
      jobId,
      ...page,
    } as PageJobData,
    opts: {
      jobId: `${jobId}-${Buffer.from(page.normalizedUrl).toString('base64').substring(0, 50)}`,
      priority: 10 - Math.min(page.depth, 9), // Higher depth = lower priority
    },
  }));

  await queue.addBulk(jobs);
  logger.debug('Page jobs added to queue', { jobId, count: pages.length });
}

// Get queue statistics
export async function getQueueStats(): Promise<{
  crawlJobs: { waiting: number; active: number; completed: number; failed: number };
  pageJobs: { waiting: number; active: number; completed: number; failed: number };
}> {
  const crawlQueue = getCrawlJobsQueue();
  const pageQueue = getPageJobsQueue();

  const [crawlCounts, pageCounts] = await Promise.all([
    crawlQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    pageQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ]);

  return {
    crawlJobs: {
      waiting: crawlCounts.waiting,
      active: crawlCounts.active,
      completed: crawlCounts.completed,
      failed: crawlCounts.failed,
    },
    pageJobs: {
      waiting: pageCounts.waiting,
      active: pageCounts.active,
      completed: pageCounts.completed,
      failed: pageCounts.failed,
    },
  };
}

// Remove all jobs for a specific crawl job
export async function removeJobsForCrawl(jobId: string): Promise<void> {
  const pageQueue = getPageJobsQueue();

  // Get all jobs and filter by jobId
  const jobs = await pageQueue.getJobs(['waiting', 'delayed', 'active']);

  const jobsToRemove = jobs.filter((job) => job.data.jobId === jobId);

  await Promise.all(
    jobsToRemove.map((job) =>
      job.remove().catch((err) => {
        logger.warn('Failed to remove job', { jobId: job.id, error: err.message });
      })
    )
  );

  logger.info('Removed page jobs for crawl', { jobId, count: jobsToRemove.length });
}

// Close all queues
export async function closeQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (crawlJobsQueue) {
    closePromises.push(crawlJobsQueue.close());
  }
  if (pageJobsQueue) {
    closePromises.push(pageJobsQueue.close());
  }
  if (crawlJobsEvents) {
    closePromises.push(crawlJobsEvents.close());
  }
  if (pageJobsEvents) {
    closePromises.push(pageJobsEvents.close());
  }

  await Promise.all(closePromises);

  crawlJobsQueue = null;
  pageJobsQueue = null;
  crawlJobsEvents = null;
  pageJobsEvents = null;

  logger.info('Queues closed');
}
