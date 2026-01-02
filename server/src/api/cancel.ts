import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getJobById, updateJobStatus } from '../db/repositories/jobRepository.js';
import { cancelCrawlJob } from '../jobs/jobManager.js';
import { logger } from '../utils/logger.js';

const router = Router();

// DELETE /api/jobs/:jobId - Cancel a crawl job
router.delete('/:jobId', async (req: Request, res: Response) => {
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

    // Check if job can be cancelled
    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({
        error: 'Cannot cancel job',
        message: `Job is already ${job.status}`,
      });
    }

    logger.info('Cancelling job', { jobId });

    // Cancel the job
    await cancelCrawlJob(jobId);

    // Update job status in database
    await updateJobStatus(jobId, 'cancelled', {
      completedAt: new Date(),
    });

    res.json({
      jobId,
      status: 'cancelled',
      message: 'Job cancellation initiated',
    });
  } catch (error) {
    logger.error('Failed to cancel job', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// POST /api/jobs/:jobId/pause - Pause a running crawl job
router.post('/:jobId/pause', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(jobId).success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'running') {
      return res.status(400).json({
        error: 'Cannot pause job',
        message: `Job is not running (current status: ${job.status})`,
      });
    }

    await updateJobStatus(jobId, 'paused');

    res.json({
      jobId,
      status: 'paused',
      message: 'Job paused successfully',
    });
  } catch (error) {
    logger.error('Failed to pause job', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

// POST /api/jobs/:jobId/resume - Resume a paused crawl job
router.post('/:jobId/resume', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(jobId).success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const job = await getJobById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'paused') {
      return res.status(400).json({
        error: 'Cannot resume job',
        message: `Job is not paused (current status: ${job.status})`,
      });
    }

    await updateJobStatus(jobId, 'running');

    res.json({
      jobId,
      status: 'running',
      message: 'Job resumed successfully',
    });
  } catch (error) {
    logger.error('Failed to resume job', { error, jobId: req.params.jobId });
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

export default router;
