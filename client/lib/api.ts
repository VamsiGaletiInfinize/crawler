const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface CrawlJobConfig {
  url: string;
  maxDepth?: number;
  maxPages?: number;
  maxConcurrentWorkers?: number;
  crawlDelayMs?: number;
  respectRobotsTxt?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface CrawlJob {
  id: string;
  seedUrl: string;
  domain: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  config: {
    maxDepth: number;
    maxPages: number;
    maxConcurrentWorkers: number;
    crawlDelayMs: number;
    respectRobotsTxt: boolean;
    includePatterns: string[];
    excludePatterns: string[];
  };
  progress: {
    discovered: number;
    crawled: number;
    failed: number;
    skipped: number;
    percent: number;
    eta: string | null;
    crawlRate: number | null;
  };
  queue: {
    pending: number;
    crawling: number;
    completed: number;
    failed: number;
  };
  timing: {
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
  };
  errors: {
    lastError: string | null;
    errorCount: number;
  };
}

export interface CrawledPage {
  id: string;
  url: string;
  depth: number;
  status: 'pending' | 'crawling' | 'completed' | 'failed' | 'skipped';
  httpStatus: number | null;
  contentType: string | null;
  title: string | null;
  description: string | null;
  linksFound: number;
  crawledAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface PaginatedResponse<T> {
  pages: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface JobListItem {
  id: string;
  seedUrl: string;
  domain: string;
  status: string;
  progress: {
    discovered: number;
    crawled: number;
    failed: number;
    skipped: number;
    percent: number;
  };
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobListResponse {
  jobs: JobListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Request failed',
      response.status,
      data.details
    );
  }

  return data;
}

// Crawl API
export async function startCrawl(config: CrawlJobConfig): Promise<{ jobId: string }> {
  return request<{ jobId: string }>('/crawl', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

// Jobs API
export async function getJobs(
  page = 1,
  limit = 20,
  status?: string
): Promise<JobListResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (status) {
    params.set('status', status);
  }

  return request<JobListResponse>(`/jobs?${params}`);
}

export async function getJob(jobId: string): Promise<CrawlJob> {
  return request<CrawlJob>(`/jobs/${jobId}`);
}

export async function cancelJob(jobId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/jobs/${jobId}`, {
    method: 'DELETE',
  });
}

export async function pauseJob(jobId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/jobs/${jobId}/pause`, {
    method: 'POST',
  });
}

export async function resumeJob(jobId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/jobs/${jobId}/resume`, {
    method: 'POST',
  });
}

// Pages API
export async function getPages(
  jobId: string,
  page = 1,
  limit = 100,
  status?: string
): Promise<PaginatedResponse<CrawledPage>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (status) {
    params.set('status', status);
  }

  return request<PaginatedResponse<CrawledPage>>(
    `/jobs/${jobId}/pages?${params}`
  );
}

// Export URL
export function getExportUrl(jobId: string, format: 'json' | 'csv' = 'json'): string {
  return `${API_BASE}/jobs/${jobId}/export?format=${format}`;
}

// SWR fetcher
export const fetcher = <T>(url: string): Promise<T> =>
  request<T>(url.replace(API_BASE, ''));

export { ApiError };
