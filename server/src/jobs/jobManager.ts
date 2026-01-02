import { getJobById, updateJobStatus, CrawlJob, JobStatus } from '../db/repositories/jobRepository.js';
import { getPageStats } from '../db/repositories/pageRepository.js';
import { getQueueStats, clearQueue, getPendingCount } from '../db/repositories/queueRepository.js';
import { removeJobsForCrawl, getCrawlJobsQueue, getPageJobsQueue } from '../queue/queues.js';
import { cancelJob as markJobCancelled, isJobCancelled } from '../queue/workers.js';
import { logger, createJobLogger } from '../utils/logger.js';

// Job state tracking
const activeJobs = new Map<string, {
  startedAt: Date;
  lastActivityAt: Date;
  checkInterval: NodeJS.Timeout;
}>();

// Start monitoring a job
export function startJobMonitoring(jobId: string): void {
  const jobLogger = createJobLogger(jobId);

  if (activeJobs.has(jobId)) {
    jobLogger.warn('Job already being monitored');
    return;
  }

  const checkInterval = setInterval(async () => {
    try {
      await checkJobCompletion(jobId);
    } catch (error) {
      jobLogger.error('Error checking job completion', { error });
    }
  }, 10000); // Check every 10 seconds

  activeJobs.set(jobId, {
    startedAt: new Date(),
    lastActivityAt: new Date(),
    checkInterval,
  });

  jobLogger.info('Job monitoring started');
}

// Stop monitoring a job
export function stopJobMonitoring(jobId: string): void {
  const jobState = activeJobs.get(jobId);
  if (jobState) {
    clearInterval(jobState.checkInterval);
    activeJobs.delete(jobId);
    logger.debug('Job monitoring stopped', { jobId });
  }
}

// Check if a job is complete
export async function checkJobCompletion(jobId: string): Promise<boolean> {
  const jobLogger = createJobLogger(jobId);

  const job = await getJobById(jobId);
  if (!job) {
    jobLogger.warn('Job not found');
    stopJobMonitoring(jobId);
    return true;
  }

  // Skip if job is already in terminal state
  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    stopJobMonitoring(jobId);
    return true;
  }

  // Check if job is cancelled
  if (isJobCancelled(jobId)) {
    await updateJobStatus(jobId, 'cancelled', { completedAt: new Date() });
    stopJobMonitoring(jobId);
    return true;
  }

  // Get queue stats
  const queueStats = await getQueueStats(jobId);
  const pendingCount = await getPendingCount(jobId);

  // Job is complete when:
  // 1. No pending URLs in queue
  // 2. All pages have been processed (crawled, failed, or skipped)
  const isComplete =
    pendingCount === 0 &&
    queueStats.pending === 0 &&
    queueStats.crawling === 0;

  if (isComplete) {
    // Check if we reached max pages
    const reachedLimit = job.pagesCrawled >= job.maxPages;

    const finalStatus: JobStatus = job.pagesFailed > 0 && job.pagesCrawled === 0
      ? 'failed'
      : 'completed';

    await updateJobStatus(jobId, finalStatus, {
      completedAt: new Date(),
      lastError: reachedLimit ? 'Max pages limit reached' : null,
    });

    stopJobMonitoring(jobId);

    jobLogger.info('Job completed', {
      status: finalStatus,
      discovered: job.pagesDiscovered,
      crawled: job.pagesCrawled,
      failed: job.pagesFailed,
      skipped: job.pagesSkipped,
    });

    return true;
  }

  // Update last activity
  const jobState = activeJobs.get(jobId);
  if (jobState) {
    jobState.lastActivityAt = new Date();
  }

  return false;
}

// Cancel a crawl job
export async function cancelCrawlJob(jobId: string): Promise<void> {
  const jobLogger = createJobLogger(jobId);

  jobLogger.info('Cancelling job');

  // Mark job as cancelled in worker
  markJobCancelled(jobId);

  // Remove pending page jobs from BullMQ queue
  await removeJobsForCrawl(jobId);

  // Clear URL queue in database
  await clearQueue(jobId);

  // Stop monitoring
  stopJobMonitoring(jobId);

  jobLogger.info('Job cancellation complete');
}

// Pause a crawl job
export async function pauseCrawlJob(jobId: string): Promise<void> {
  const jobLogger = createJobLogger(jobId);

  const job = await getJobById(jobId);
  if (!job || job.status !== 'running') {
    throw new Error('Job is not running');
  }

  await updateJobStatus(jobId, 'paused');

  // Note: BullMQ workers will check job status before processing pages
  jobLogger.info('Job paused');
}

// Resume a paused job
export async function resumeCrawlJob(jobId: string): Promise<void> {
  const jobLogger = createJobLogger(jobId);

  const job = await getJobById(jobId);
  if (!job || job.status !== 'paused') {
    throw new Error('Job is not paused');
  }

  await updateJobStatus(jobId, 'running');

  // Restart monitoring
  startJobMonitoring(jobId);

  jobLogger.info('Job resumed');
}

// Get job progress summary
export async function getJobProgress(jobId: string): Promise<{
  status: JobStatus;
  progress: {
    discovered: number;
    crawled: number;
    failed: number;
    skipped: number;
    percent: number;
  };
  queue: {
    pending: number;
    crawling: number;
  };
  timing: {
    startedAt: Date | null;
    elapsedMs: number | null;
    estimatedRemainingMs: number | null;
    crawlRate: number | null; // pages per hour
  };
} | null> {
  const job = await getJobById(jobId);
  if (!job) return null;

  const queueStats = await getQueueStats(jobId);

  // Calculate timing
  let elapsedMs: number | null = null;
  let estimatedRemainingMs: number | null = null;
  let crawlRate: number | null = null;

  if (job.startedAt) {
    elapsedMs = Date.now() - job.startedAt.getTime();

    if (job.pagesCrawled > 0) {
      crawlRate = Math.round((job.pagesCrawled / elapsedMs) * 3600000);

      const remainingPages = job.pagesDiscovered - job.pagesCrawled - job.pagesFailed - job.pagesSkipped;
      if (remainingPages > 0) {
        const msPerPage = elapsedMs / job.pagesCrawled;
        estimatedRemainingMs = Math.round(remainingPages * msPerPage);
      }
    }
  }

  return {
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
    queue: {
      pending: queueStats.pending,
      crawling: queueStats.crawling,
    },
    timing: {
      startedAt: job.startedAt,
      elapsedMs,
      estimatedRemainingMs,
      crawlRate,
    },
  };
}

// Recover jobs after server restart
export async function recoverJobs(): Promise<void> {
  logger.info('Recovering interrupted jobs...');

  // This would query for jobs that were running when server stopped
  // and restart their monitoring

  // For now, we'll mark interrupted jobs as failed
  // In production, you'd implement proper recovery logic
}

// Get all active job IDs
export function getActiveJobIds(): string[] {
  return Array.from(activeJobs.keys());
}

// Shutdown all job monitoring
export function shutdownAllMonitoring(): void {
  for (const [jobId, state] of activeJobs) {
    clearInterval(state.checkInterval);
    logger.debug('Stopped monitoring', { jobId });
  }
  activeJobs.clear();
  logger.info('All job monitoring stopped');
}
