import { query } from '../index.js';
import { v4 as uuidv4 } from 'uuid';

export type QueueStatus = 'pending' | 'crawling' | 'completed' | 'failed' | 'skipped';

export interface QueueItem {
  id: string;
  jobId: string;
  url: string;
  normalizedUrl: string;
  depth: number;
  priority: number;
  status: QueueStatus;
  retryCount: number;
  lastRetryAt: Date | null;
  createdAt: Date;
}

interface QueueRow {
  id: string;
  job_id: string;
  url: string;
  normalized_url: string;
  depth: number;
  priority: number;
  status: QueueStatus;
  retry_count: number;
  last_retry_at: Date | null;
  created_at: Date;
}

function mapRowToItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    jobId: row.job_id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    depth: row.depth,
    priority: row.priority,
    status: row.status,
    retryCount: row.retry_count,
    lastRetryAt: row.last_retry_at,
    createdAt: row.created_at,
  };
}

export async function addToQueue(
  jobId: string,
  urls: Array<{ url: string; normalizedUrl: string; depth: number; priority?: number }>
): Promise<number> {
  if (urls.length === 0) return 0;

  // Batch insert with conflict handling
  const values = urls.map((_, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const params = urls.flatMap((u) => [
    uuidv4(),
    jobId,
    u.url,
    u.normalizedUrl,
    u.depth,
  ]);

  const result = await query(
    `INSERT INTO url_queue (id, job_id, url, normalized_url, depth)
     VALUES ${values.join(', ')}
     ON CONFLICT (job_id, normalized_url) DO NOTHING`,
    params
  );

  return result.rowCount ?? 0;
}

export async function getNextFromQueue(
  jobId: string,
  limit = 10
): Promise<QueueItem[]> {
  // Fetch and lock URLs for processing
  const result = await query<QueueRow>(
    `UPDATE url_queue
     SET status = 'crawling'
     WHERE id IN (
       SELECT id FROM url_queue
       WHERE job_id = $1 AND status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [jobId, limit]
  );

  return result.rows.map(mapRowToItem);
}

export async function updateQueueItemStatus(
  id: string,
  status: QueueStatus,
  retryCount?: number
): Promise<void> {
  if (retryCount !== undefined) {
    await query(
      `UPDATE url_queue SET status = $2, retry_count = $3, last_retry_at = NOW()
       WHERE id = $1`,
      [id, status, retryCount]
    );
  } else {
    await query('UPDATE url_queue SET status = $2 WHERE id = $1', [id, status]);
  }
}

export async function requeueFailedItems(
  jobId: string,
  maxRetries = 3
): Promise<number> {
  const result = await query(
    `UPDATE url_queue
     SET status = 'pending', retry_count = retry_count + 1
     WHERE job_id = $1 AND status = 'failed' AND retry_count < $2`,
    [jobId, maxRetries]
  );

  return result.rowCount ?? 0;
}

export async function getQueueStats(jobId: string): Promise<{
  total: number;
  pending: number;
  crawling: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const result = await query<{ status: QueueStatus; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM url_queue
     WHERE job_id = $1
     GROUP BY status`,
    [jobId]
  );

  const stats = {
    total: 0,
    pending: 0,
    crawling: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };

  for (const row of result.rows) {
    const count = parseInt(row.count, 10);
    stats[row.status] = count;
    stats.total += count;
  }

  return stats;
}

export async function urlExistsInQueue(
  jobId: string,
  normalizedUrl: string
): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM url_queue WHERE job_id = $1 AND normalized_url = $2
    ) as exists`,
    [jobId, normalizedUrl]
  );

  return result.rows[0]?.exists ?? false;
}

export async function clearQueue(jobId: string): Promise<number> {
  const result = await query(
    'DELETE FROM url_queue WHERE job_id = $1',
    [jobId]
  );
  return result.rowCount ?? 0;
}

export async function getPendingCount(jobId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM url_queue
     WHERE job_id = $1 AND status = 'pending'`,
    [jobId]
  );
  return parseInt(result.rows[0].count, 10);
}
