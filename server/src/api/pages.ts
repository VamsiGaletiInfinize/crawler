import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getJobById } from '../db/repositories/jobRepository.js';
import { getPagesByJobId, PageStatus } from '../db/repositories/pageRepository.js';
import { logger } from '../utils/logger.js';

const router = Router();

// GET /api/jobs/:jobId/pages - Get paginated crawl results
router.get('/:jobId/pages', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    // Validate UUID format
    const uuidSchema = z.string().uuid();
    const validation = uuidSchema.safeParse(jobId);

    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    // Check if job exists
    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Parse pagination parameters
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 100));
    const status = req.query.status as PageStatus | undefined;

    const offset = (page - 1) * limit;

    // Fetch pages
    const { pages, total } = await getPagesByJobId(jobId, { status, limit, offset });

    res.json({
      jobId,
      pages: pages.map((p) => ({
        id: p.id,
        url: p.url,
        depth: p.depth,
        status: p.status,
        httpStatus: p.httpStatus,
        contentType: p.contentType,
        title: p.title,
        description: p.description,
        linksFound: p.linksFound,
        crawledAt: p.crawledAt,
        durationMs: p.durationMs,
        errorMessage: p.errorMessage,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    logger.error('Failed to get pages', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to get pages' });
  }
});

// GET /api/jobs/:jobId/pages/:pageId - Get single page details
router.get('/:jobId/pages/:pageId', async (req: Request, res: Response) => {
  try {
    const { jobId, pageId } = req.params;

    // Validate UUIDs
    const uuidSchema = z.string().uuid();

    if (!uuidSchema.safeParse(jobId).success || !uuidSchema.safeParse(pageId).success) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Check job exists
    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Fetch the specific page
    const { pages } = await getPagesByJobId(jobId, { limit: 1, offset: 0 });
    const page = pages.find((p) => p.id === pageId);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({
      id: page.id,
      jobId: page.jobId,
      url: page.url,
      normalizedUrl: page.normalizedUrl,
      depth: page.depth,
      status: page.status,
      httpStatus: page.httpStatus,
      contentType: page.contentType,
      contentLength: page.contentLength,
      title: page.title,
      description: page.description,
      content: page.content,
      linksFound: page.linksFound,
      crawledAt: page.crawledAt,
      durationMs: page.durationMs,
      errorMessage: page.errorMessage,
      retryCount: page.retryCount,
      metadata: page.metadata,
    });
  } catch (error) {
    logger.error('Failed to get page details', { error });
    res.status(500).json({ error: 'Failed to get page details' });
  }
});

// GET /api/jobs/:jobId/export - Export all pages (streaming)
router.get('/:jobId/export', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const format = (req.query.format as string) || 'json';

    // Validate UUID
    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(jobId).success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Set appropriate headers for streaming
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="crawl-${jobId}.csv"`);
      res.write('url,title,status,http_status,depth,crawled_at\n');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="crawl-${jobId}.json"`);
      res.write('[\n');
    }

    // Stream pages in batches
    const batchSize = 500;
    let offset = 0;
    let first = true;

    while (true) {
      const { pages } = await getPagesByJobId(jobId, {
        limit: batchSize,
        offset,
        status: 'completed',
      });

      if (pages.length === 0) break;

      for (const page of pages) {
        if (format === 'csv') {
          const csvLine = [
            `"${page.url.replace(/"/g, '""')}"`,
            `"${(page.title || '').replace(/"/g, '""')}"`,
            page.status,
            page.httpStatus || '',
            page.depth,
            page.crawledAt?.toISOString() || '',
          ].join(',');
          res.write(csvLine + '\n');
        } else {
          if (!first) res.write(',\n');
          res.write(JSON.stringify({
            url: page.url,
            title: page.title,
            description: page.description,
            status: page.status,
            httpStatus: page.httpStatus,
            depth: page.depth,
            crawledAt: page.crawledAt,
          }));
          first = false;
        }
      }

      offset += batchSize;

      if (pages.length < batchSize) break;
    }

    if (format !== 'csv') {
      res.write('\n]');
    }

    res.end();
  } catch (error) {
    logger.error('Failed to export pages', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to export pages' });
  }
});

export default router;
