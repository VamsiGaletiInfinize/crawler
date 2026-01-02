import { query } from '../index.js';
import { v4 as uuidv4 } from 'uuid';

export type PageStatus = 'pending' | 'crawling' | 'completed' | 'failed' | 'skipped';

export interface CreatePageParams {
  jobId: string;
  url: string;
  normalizedUrl: string;
  depth: number;
}

export interface CrawledPage {
  id: string;
  jobId: string;
  url: string;
  normalizedUrl: string;
  depth: number;
  status: PageStatus;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  title: string | null;
  description: string | null;
  content: string | null;
  linksFound: number;
  crawledAt: Date | null;
  durationMs: number | null;
  errorMessage: string | null;
  retryCount: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface PageRow {
  id: string;
  job_id: string;
  url: string;
  normalized_url: string;
  depth: number;
  status: PageStatus;
  http_status: number | null;
  content_type: string | null;
  content_length: number | null;
  title: string | null;
  description: string | null;
  content: string | null;
  links_found: number;
  crawled_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
  retry_count: number;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapRowToPage(row: PageRow): CrawledPage {
  return {
    id: row.id,
    jobId: row.job_id,
    url: row.url,
    normalizedUrl: row.normalized_url,
    depth: row.depth,
    status: row.status,
    httpStatus: row.http_status,
    contentType: row.content_type,
    contentLength: row.content_length,
    title: row.title,
    description: row.description,
    content: row.content,
    linksFound: row.links_found || 0,
    crawledAt: row.crawled_at,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPage(params: CreatePageParams): Promise<CrawledPage> {
  const id = uuidv4();
  const result = await query<PageRow>(
    `INSERT INTO crawled_pages (id, job_id, url, normalized_url, depth)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (job_id, normalized_url) DO NOTHING
     RETURNING *`,
    [id, params.jobId, params.url, params.normalizedUrl, params.depth]
  );

  // If page already exists, return null to indicate duplicate
  if (!result.rows[0]) {
    const existing = await query<PageRow>(
      'SELECT * FROM crawled_pages WHERE job_id = $1 AND normalized_url = $2',
      [params.jobId, params.normalizedUrl]
    );
    return mapRowToPage(existing.rows[0]);
  }

  return mapRowToPage(result.rows[0]);
}

export async function createPages(pages: CreatePageParams[]): Promise<number> {
  if (pages.length === 0) return 0;

  const values = pages.map((p, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const params = pages.flatMap((p) => [
    uuidv4(),
    p.jobId,
    p.url,
    p.normalizedUrl,
    p.depth,
  ]);

  const result = await query(
    `INSERT INTO crawled_pages (id, job_id, url, normalized_url, depth)
     VALUES ${values.join(', ')}
     ON CONFLICT (job_id, normalized_url) DO NOTHING`,
    params
  );

  return result.rowCount ?? 0;
}

export async function getPageById(id: string): Promise<CrawledPage | null> {
  const result = await query<PageRow>(
    'SELECT * FROM crawled_pages WHERE id = $1',
    [id]
  );

  return result.rows[0] ? mapRowToPage(result.rows[0]) : null;
}

export async function getPagesByJobId(
  jobId: string,
  options: {
    status?: PageStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ pages: CrawledPage[]; total: number }> {
  const { status, limit = 100, offset = 0 } = options;

  let whereClause = 'WHERE job_id = $1';
  const params: unknown[] = [jobId];

  if (status) {
    params.push(status);
    whereClause += ` AND status = $${params.length}`;
  }

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) FROM crawled_pages ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit, offset);
  const result = await query<PageRow>(
    `SELECT * FROM crawled_pages ${whereClause}
     ORDER BY crawled_at DESC NULLS LAST, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    pages: result.rows.map(mapRowToPage),
    total,
  };
}

export async function updatePageStatus(
  id: string,
  status: PageStatus,
  updates?: Partial<{
    httpStatus: number;
    contentType: string;
    contentLength: number;
    title: string;
    description: string;
    content: string;
    linksFound: number;
    crawledAt: Date;
    durationMs: number;
    errorMessage: string;
    retryCount: number;
    metadata: Record<string, unknown>;
  }>
): Promise<CrawledPage | null> {
  const setClause: string[] = ['status = $2'];
  const params: unknown[] = [id, status];
  let paramIndex = 3;

  if (updates) {
    const fieldMap: Record<string, string> = {
      httpStatus: 'http_status',
      contentType: 'content_type',
      contentLength: 'content_length',
      title: 'title',
      description: 'description',
      content: 'content',
      linksFound: 'links_found',
      crawledAt: 'crawled_at',
      durationMs: 'duration_ms',
      errorMessage: 'error_message',
      retryCount: 'retry_count',
      metadata: 'metadata',
    };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && fieldMap[key]) {
        setClause.push(`${fieldMap[key]} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }
  }

  const result = await query<PageRow>(
    `UPDATE crawled_pages SET ${setClause.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );

  return result.rows[0] ? mapRowToPage(result.rows[0]) : null;
}

export async function getPageStats(jobId: string): Promise<{
  total: number;
  pending: number;
  crawling: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const result = await query<{ status: PageStatus; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM crawled_pages
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

export async function urlExists(jobId: string, normalizedUrl: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM crawled_pages WHERE job_id = $1 AND normalized_url = $2
    ) as exists`,
    [jobId, normalizedUrl]
  );

  return result.rows[0]?.exists ?? false;
}

export async function deletePagesByJobId(jobId: string): Promise<number> {
  const result = await query(
    'DELETE FROM crawled_pages WHERE job_id = $1',
    [jobId]
  );
  return result.rowCount ?? 0;
}
