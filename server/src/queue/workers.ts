import { Worker, Job } from 'bullmq';
import { config } from '../utils/config.js';
import { logger, createJobLogger } from '../utils/logger.js';
import {
  CrawlJobData,
  PageJobData,
  QUEUE_NAMES,
  addPageJobs,
} from './queues.js';
import {
  updateJobStatus,
  incrementJobProgress,
  getJobById,
} from '../db/repositories/jobRepository.js';
import {
  createPage,
  updatePageStatus,
  urlExists,
} from '../db/repositories/pageRepository.js';
import { addToQueue, updateQueueItemStatus } from '../db/repositories/queueRepository.js';
import { crawlPage, normalizeUrl, extractLinks } from '../crawler/crawler.js';
import { checkRobotsTxt } from '../crawler/robots.js';
import { RateLimiter } from '../crawler/rateLimiter.js';

// Redis connection configuration
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Rate limiters per domain
const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(domain: string, delayMs: number): RateLimiter {
  if (!rateLimiters.has(domain)) {
    rateLimiters.set(domain, new RateLimiter(delayMs));
  }
  return rateLimiters.get(domain)!;
}

// Active workers
let crawlJobsWorker: Worker<CrawlJobData> | null = null;
let pageJobsWorker: Worker<PageJobData> | null = null;

// Job cancellation tracking
const cancelledJobs = new Set<string>();

export function cancelJob(jobId: string): void {
  cancelledJobs.add(jobId);
}

export function isJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

// Process crawl job (initialization)
async function processCrawlJob(job: Job<CrawlJobData>): Promise<void> {
  const { jobId, seedUrl, domain, respectRobotsTxt, crawlDelayMs } = job.data;
  const jobLogger = createJobLogger(jobId);

  jobLogger.info('Processing crawl job', { seedUrl, domain });

  try {
    // Update job status to running
    await updateJobStatus(jobId, 'running', { startedAt: new Date() });

    // Check robots.txt if required
    if (respectRobotsTxt) {
      await checkRobotsTxt(domain);
    }

    // Normalize and add seed URL to queue
    const normalizedSeedUrl = normalizeUrl(seedUrl);

    // Create the seed page entry
    await createPage({
      jobId,
      url: seedUrl,
      normalizedUrl: normalizedSeedUrl,
      depth: 0,
    });

    // Add to URL queue
    await addToQueue(jobId, [
      { url: seedUrl, normalizedUrl: normalizedSeedUrl, depth: 0 },
    ]);

    // Update discovered count
    await incrementJobProgress(jobId, 'pages_discovered', 1);

    // Add seed URL as first page job
    await addPageJobs(jobId, [
      {
        url: seedUrl,
        normalizedUrl: normalizedSeedUrl,
        depth: 0,
        domain,
        crawlDelayMs,
        respectRobotsTxt,
        includePatterns: job.data.includePatterns,
        excludePatterns: job.data.excludePatterns,
        maxDepth: job.data.maxDepth,
      },
    ]);

    jobLogger.info('Crawl job initialized', { jobId });
  } catch (error) {
    jobLogger.error('Failed to process crawl job', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await updateJobStatus(jobId, 'failed', {
      lastError: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });

    throw error;
  }
}

// Process individual page crawl
async function processPageJob(job: Job<PageJobData>): Promise<void> {
  const {
    jobId,
    url,
    normalizedUrl,
    depth,
    domain,
    crawlDelayMs,
    respectRobotsTxt,
    includePatterns,
    excludePatterns,
    maxDepth,
  } = job.data;

  const jobLogger = createJobLogger(jobId);

  // Check if job is cancelled
  if (isJobCancelled(jobId)) {
    jobLogger.debug('Skipping page - job cancelled', { url });
    return;
  }

  // Check if job is still running
  const crawlJob = await getJobById(jobId);
  if (!crawlJob || crawlJob.status !== 'running') {
    jobLogger.debug('Skipping page - job not running', { url, status: crawlJob?.status });
    return;
  }

  // Check max pages limit
  if (crawlJob.pagesCrawled >= crawlJob.maxPages) {
    jobLogger.debug('Skipping page - max pages reached', { url });
    await updatePageStatus(normalizedUrl, 'skipped');
    return;
  }

  // Apply rate limiting
  const rateLimiter = getRateLimiter(domain, crawlDelayMs);
  await rateLimiter.acquire();

  const startTime = Date.now();

  try {
    jobLogger.debug('Crawling page', { url, depth });

    // Crawl the page
    const result = await crawlPage(url, {
      respectRobotsTxt,
      domain,
    });

    const durationMs = Date.now() - startTime;

    // Extract links from the page
    const links = extractLinks(result.content || '', url, domain);

    // Filter links based on patterns
    const filteredLinks = links.filter((link) => {
      // Check exclude patterns
      for (const pattern of excludePatterns) {
        if (new RegExp(pattern).test(link)) {
          return false;
        }
      }

      // Check include patterns (if specified, URL must match at least one)
      if (includePatterns.length > 0) {
        return includePatterns.some((pattern) => new RegExp(pattern).test(link));
      }

      return true;
    });

    // Store page result
    await updatePageStatus(normalizedUrl, 'completed', {
      httpStatus: result.statusCode,
      contentType: result.contentType,
      contentLength: result.contentLength,
      title: result.title,
      description: result.description,
      content: result.content?.substring(0, 50000), // Limit content size
      linksFound: filteredLinks.length,
      crawledAt: new Date(),
      durationMs,
    });

    // Update job progress
    await incrementJobProgress(jobId, 'pages_crawled', 1);

    // Queue new URLs if within depth limit
    if (depth < maxDepth && filteredLinks.length > 0) {
      const newUrls: Array<{
        url: string;
        normalizedUrl: string;
        depth: number;
        domain: string;
        crawlDelayMs: number;
        respectRobotsTxt: boolean;
        includePatterns: string[];
        excludePatterns: string[];
        maxDepth: number;
      }> = [];

      for (const link of filteredLinks) {
        const normalizedLink = normalizeUrl(link);

        // Check if URL already exists
        const exists = await urlExists(jobId, normalizedLink);
        if (exists) continue;

        // Create page entry
        await createPage({
          jobId,
          url: link,
          normalizedUrl: normalizedLink,
          depth: depth + 1,
        });

        // Update discovered count
        await incrementJobProgress(jobId, 'pages_discovered', 1);

        newUrls.push({
          url: link,
          normalizedUrl: normalizedLink,
          depth: depth + 1,
          domain,
          crawlDelayMs,
          respectRobotsTxt,
          includePatterns,
          excludePatterns,
          maxDepth,
        });
      }

      // Add new URLs to queue
      if (newUrls.length > 0) {
        await addPageJobs(jobId, newUrls);
        jobLogger.debug('Discovered new URLs', { count: newUrls.length });
      }
    }

    jobLogger.debug('Page crawled successfully', {
      url,
      status: result.statusCode,
      duration: durationMs,
      linksFound: filteredLinks.length,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    jobLogger.warn('Failed to crawl page', {
      url,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: durationMs,
    });

    await updatePageStatus(normalizedUrl, 'failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      crawledAt: new Date(),
      durationMs,
      retryCount: (job.attemptsMade || 0) + 1,
    });

    await incrementJobProgress(jobId, 'pages_failed', 1);

    // Re-throw to trigger retry
    throw error;
  }
}

// Initialize workers
export async function initializeWorkers(): Promise<void> {
  // Crawl jobs worker (low concurrency - just initialization)
  crawlJobsWorker = new Worker<CrawlJobData>(
    QUEUE_NAMES.CRAWL_JOBS,
    processCrawlJob,
    {
      connection: redisConfig,
      concurrency: 2,
    }
  );

  crawlJobsWorker.on('completed', (job) => {
    logger.info('Crawl job completed', { jobId: job.data.jobId });
  });

  crawlJobsWorker.on('failed', (job, err) => {
    logger.error('Crawl job failed', {
      jobId: job?.data.jobId,
      error: err.message,
    });
  });

  // Page jobs worker (high concurrency)
  pageJobsWorker = new Worker<PageJobData>(
    QUEUE_NAMES.PAGE_JOBS,
    processPageJob,
    {
      connection: redisConfig,
      concurrency: config.crawler.maxConcurrentWorkers,
      limiter: {
        max: config.rateLimit.requestsPerSecond * 10,
        duration: 10000,
      },
    }
  );

  pageJobsWorker.on('completed', (job) => {
    logger.debug('Page job completed', {
      jobId: job.data.jobId,
      url: job.data.url,
    });
  });

  pageJobsWorker.on('failed', (job, err) => {
    logger.warn('Page job failed', {
      jobId: job?.data.jobId,
      url: job?.data.url,
      error: err.message,
    });
  });

  logger.info('Workers initialized', {
    crawlConcurrency: 2,
    pageConcurrency: config.crawler.maxConcurrentWorkers,
  });
}

// Shutdown workers gracefully
export async function shutdownWorkers(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (crawlJobsWorker) {
    closePromises.push(crawlJobsWorker.close());
  }

  if (pageJobsWorker) {
    closePromises.push(pageJobsWorker.close());
  }

  await Promise.all(closePromises);

  crawlJobsWorker = null;
  pageJobsWorker = null;

  // Clear rate limiters
  rateLimiters.clear();

  // Clear cancelled jobs
  cancelledJobs.clear();

  logger.info('Workers shut down');
}
