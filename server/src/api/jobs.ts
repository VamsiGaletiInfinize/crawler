import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getJobById, getJobs, JobStatus } from '../db/repositories/jobRepository.js';
import { getQueueStats } from '../db/repositories/queueRepository.js';
import { logger } from '../utils/logger.js';

const router = Router();

// GET /api/jobs - List all jobs
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const status = req.query.status as JobStatus | undefined;

    const offset = (page - 1) * limit;

    const { jobs, total } = await getJobs({ status, limit, offset });

    res.json({
      jobs: jobs.map((job) => ({
        id: job.id,
        seedUrl: job.seedUrl,
        domain: job.domain,
        status: job.status,
        progress: {
          discovered: job.pagesDiscovered,
          crawled: job.pagesCrawled,
          failed: job.pagesFailed,
          skipped: job.pagesSkipped,
          percent: job.pagesDiscovered > 0
            ? Math.round((job.pagesCrawled / job.pagesDiscovered) * 100)
            : 0,
        },
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list jobs', { error });
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// GET /api/jobs/:jobId - Get job details and progress
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Validate UUID format
    const uuidSchema = z.string().uuid();
    const validation = uuidSchema.safeParse(jobId);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const job = await getJobById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Get queue statistics
    const queueStats = await getQueueStats(jobId);

    // Calculate ETA
    let eta: string | null = null;
    if (job.status === 'running' && job.startedAt && job.pagesCrawled > 0) {
      const elapsedMs = Date.now() - job.startedAt.getTime();
      const pagesPerMs = job.pagesCrawled / elapsedMs;
      const remainingPages = job.pagesDiscovered - job.pagesCrawled;

      if (pagesPerMs > 0 && remainingPages > 0) {
        const remainingMs = remainingPages / pagesPerMs;
        const etaDate = new Date(Date.now() + remainingMs);
        eta = etaDate.toISOString();
      }
    }

    // Calculate crawl rate
    let crawlRate: number | null = null;
    if (job.startedAt && job.pagesCrawled > 0) {
      const elapsedSeconds = (Date.now() - job.startedAt.getTime()) / 1000;
      crawlRate = Math.round((job.pagesCrawled / elapsedSeconds) * 3600); // pages/hour
    }

    res.json({
      id: job.id,
      seedUrl: job.seedUrl,
      domain: job.domain,
      status: job.status,
      config: {
        maxDepth: job.maxDepth,
        maxPages: job.maxPages,
        maxConcurrentWorkers: job.maxConcurrentWorkers,
        crawlDelayMs: job.crawlDelayMs,
        respectRobotsTxt: job.respectRobotsTxt,
        includePatterns: job.includePatterns,
        excludePatterns: job.excludePatterns,
      },
      progress: {
        discovered: job.pagesDiscovered,
        crawled: job.pagesCrawled,
        failed: job.pagesFailed,
        skipped: job.pagesSkipped,
        percent: job.pagesDiscovered > 0
          ? Math.round((job.pagesCrawled / job.pagesDiscovered) * 100)
          : 0,
        eta,
        crawlRate,
      },
      queue: {
        pending: queueStats.pending,
        crawling: queueStats.crawling,
        completed: queueStats.completed,
        failed: queueStats.failed,
      },
      timing: {
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
      },
      errors: {
        lastError: job.lastError,
        errorCount: job.errorCount,
      },
    });
  } catch (error) {
    logger.error('Failed to get job', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

export default router;
