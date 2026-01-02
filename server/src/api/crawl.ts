import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createJob } from '../db/repositories/jobRepository.js';
import { addCrawlJob } from '../queue/queues.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schema for crawl request
const crawlRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  maxDepth: z.number().int().min(1).max(50).optional().default(10),
  maxPages: z.number().int().min(1).max(150000).optional().default(100000),
  maxConcurrentWorkers: z.number().int().min(1).max(50).optional().default(10),
  crawlDelayMs: z.number().int().min(100).max(10000).optional().default(1000),
  respectRobotsTxt: z.boolean().optional().default(true),
  includePatterns: z.array(z.string()).optional().default([]),
  excludePatterns: z.array(z.string()).optional().default([]),
});

function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname;
}

// POST /api/crawl - Start a new crawl job
router.post('/', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = crawlRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const params = validation.data;
    const domain = extractDomain(params.url);

    logger.info('Starting new crawl job', { url: params.url, domain });

    // Create job in database
    const job = await createJob({
      seedUrl: params.url,
      domain,
      maxDepth: params.maxDepth,
      maxPages: params.maxPages,
      maxConcurrentWorkers: params.maxConcurrentWorkers,
      crawlDelayMs: params.crawlDelayMs,
      respectRobotsTxt: params.respectRobotsTxt,
      includePatterns: params.includePatterns,
      excludePatterns: params.excludePatterns,
    });

    // Add job to processing queue
    await addCrawlJob(job.id, {
      jobId: job.id,
      seedUrl: job.seedUrl,
      domain: job.domain,
      maxDepth: job.maxDepth,
      maxPages: job.maxPages,
      maxConcurrentWorkers: job.maxConcurrentWorkers,
      crawlDelayMs: job.crawlDelayMs,
      respectRobotsTxt: job.respectRobotsTxt,
      includePatterns: job.includePatterns,
      excludePatterns: job.excludePatterns,
    });

    logger.info('Crawl job created', { jobId: job.id });

    // Return immediately with job ID (non-blocking)
    res.status(202).json({
      jobId: job.id,
      status: 'pending',
      message: 'Crawl job created and queued for processing',
    });
  } catch (error) {
    logger.error('Failed to create crawl job', { error });
    res.status(500).json({
      error: 'Failed to create crawl job',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
