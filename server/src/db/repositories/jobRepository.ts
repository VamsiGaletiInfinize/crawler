import { query, transaction, PoolClient } from '../index.js';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface CreateJobParams {
  seedUrl: string;
  domain: string;
  maxDepth?: number;
  maxPages?: number;
  maxConcurrentWorkers?: number;
  crawlDelayMs?: number;
  respectRobotsTxt?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  metadata?: Record<string, unknown>;
}

export interface CrawlJob {
  id: string;
  seedUrl: string;
  domain: string;
  maxDepth: number;
  maxPages: number;
  maxConcurrentWorkers: number;
  crawlDelayMs: number;
  respectRobotsTxt: boolean;
  includePatterns: string[];
  excludePatterns: string[];
  status: JobStatus;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesFailed: number;
  pagesSkipped: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
  lastError: string | null;
  errorCount: number;
  metadata: Record<string, unknown>;
}

interface JobRow {
  id: string;
  seed_url: string;
  domain: string;
  max_depth: number;
  max_pages: number;
  max_concurrent_workers: number;
  crawl_delay_ms: number;
  respect_robots_txt: boolean;
  include_patterns: string[];
  exclude_patterns: string[];
  status: JobStatus;
  pages_discovered: number;
  pages_crawled: number;
  pages_failed: number;
  pages_skipped: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  last_error: string | null;
  error_count: number;
  metadata: Record<string, unknown>;
}

function mapRowToJob(row: JobRow): CrawlJob {
  return {
    id: row.id,
    seedUrl: row.seed_url,
    domain: row.domain,
    maxDepth: row.max_depth,
    maxPages: row.max_pages,
    maxConcurrentWorkers: row.max_concurrent_workers,
    crawlDelayMs: row.crawl_delay_ms,
    respectRobotsTxt: row.respect_robots_txt,
    includePatterns: row.include_patterns || [],
    excludePatterns: row.exclude_patterns || [],
    status: row.status,
    pagesDiscovered: row.pages_discovered,
    pagesCrawled: row.pages_crawled,
    pagesFailed: row.pages_failed,
    pagesSkipped: row.pages_skipped,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    errorCount: row.error_count,
    metadata: row.metadata || {},
  };
}

export async function createJob(params: CreateJobParams): Promise<CrawlJob> {
  const id = uuidv4();
  const result = await query<JobRow>(
    `INSERT INTO crawl_jobs (
      id, seed_url, domain, max_depth, max_pages,
      max_concurrent_workers, crawl_delay_ms, respect_robots_txt,
      include_patterns, exclude_patterns, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      id,
      params.seedUrl,
      params.domain,
      params.maxDepth ?? 10,
      params.maxPages ?? 100000,
      params.maxConcurrentWorkers ?? 10,
      params.crawlDelayMs ?? 1000,
      params.respectRobotsTxt ?? true,
      params.includePatterns ?? [],
      params.excludePatterns ?? [],
      params.metadata ?? {},
    ]
  );

  return mapRowToJob(result.rows[0]);
}

export async function getJobById(id: string): Promise<CrawlJob | null> {
  const result = await query<JobRow>(
    'SELECT * FROM crawl_jobs WHERE id = $1',
    [id]
  );

  return result.rows[0] ? mapRowToJob(result.rows[0]) : null;
}

export async function getJobs(options: {
  status?: JobStatus;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: CrawlJob[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let whereClause = '';
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    whereClause = 'WHERE status = $1';
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM crawl_jobs ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit, offset);
  const result = await query<JobRow>(
    `SELECT * FROM crawl_jobs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    jobs: result.rows.map(mapRowToJob),
    total,
  };
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  additionalUpdates?: Partial<{
    startedAt: Date;
    completedAt: Date;
    lastError: string;
    errorCount: number;
  }>
): Promise<CrawlJob | null> {
  const updates: string[] = ['status = $2'];
  const params: unknown[] = [id, status];
  let paramIndex = 3;

  if (additionalUpdates?.startedAt) {
    updates.push(`started_at = $${paramIndex}`);
    params.push(additionalUpdates.startedAt);
    paramIndex++;
  }

  if (additionalUpdates?.completedAt) {
    updates.push(`completed_at = $${paramIndex}`);
    params.push(additionalUpdates.completedAt);
    paramIndex++;
  }

  if (additionalUpdates?.lastError !== undefined) {
    updates.push(`last_error = $${paramIndex}`);
    params.push(additionalUpdates.lastError);
    paramIndex++;
  }

  if (additionalUpdates?.errorCount !== undefined) {
    updates.push(`error_count = $${paramIndex}`);
    params.push(additionalUpdates.errorCount);
  }

  const result = await query<JobRow>(
    `UPDATE crawl_jobs SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapRowToJob(result.rows[0]) : null;
}

export async function incrementJobProgress(
  id: string,
  field: 'pages_discovered' | 'pages_crawled' | 'pages_failed' | 'pages_skipped',
  amount = 1
): Promise<void> {
  await query(
    `UPDATE crawl_jobs SET ${field} = ${field} + $2 WHERE id = $1`,
    [id, amount]
  );
}

export async function updateJobProgress(
  id: string,
  progress: {
    pagesDiscovered?: number;
    pagesCrawled?: number;
    pagesFailed?: number;
    pagesSkipped?: number;
  }
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [id];
  let paramIndex = 2;

  if (progress.pagesDiscovered !== undefined) {
    updates.push(`pages_discovered = $${paramIndex}`);
    params.push(progress.pagesDiscovered);
    paramIndex++;
  }

  if (progress.pagesCrawled !== undefined) {
    updates.push(`pages_crawled = $${paramIndex}`);
    params.push(progress.pagesCrawled);
    paramIndex++;
  }

  if (progress.pagesFailed !== undefined) {
    updates.push(`pages_failed = $${paramIndex}`);
    params.push(progress.pagesFailed);
    paramIndex++;
  }

  if (progress.pagesSkipped !== undefined) {
    updates.push(`pages_skipped = $${paramIndex}`);
    params.push(progress.pagesSkipped);
  }

  if (updates.length > 0) {
    await query(
      `UPDATE crawl_jobs SET ${updates.join(', ')} WHERE id = $1`,
      params
    );
  }
}

export async function deleteJob(id: string): Promise<boolean> {
  const result = await query('DELETE FROM crawl_jobs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
