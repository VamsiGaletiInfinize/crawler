-- CrawlScrap Database Schema
-- Production-grade async web crawler for US Higher Education websites

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for job status
CREATE TYPE job_status AS ENUM (
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled'
);

-- Enum for page status
CREATE TYPE page_status AS ENUM (
  'pending',
  'crawling',
  'completed',
  'failed',
  'skipped'
);

-- Crawl Jobs Table
-- Stores the main crawl job configuration and status
CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Job configuration
  seed_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  max_depth INTEGER NOT NULL DEFAULT 10,
  max_pages INTEGER NOT NULL DEFAULT 100000,
  max_concurrent_workers INTEGER NOT NULL DEFAULT 10,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 1000,
  respect_robots_txt BOOLEAN NOT NULL DEFAULT true,
  include_patterns TEXT[] DEFAULT '{}',
  exclude_patterns TEXT[] DEFAULT '{}',

  -- Job status
  status job_status NOT NULL DEFAULT 'pending',

  -- Progress tracking
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  pages_skipped INTEGER NOT NULL DEFAULT 0,

  -- Timing
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Error tracking
  last_error TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Crawled Pages Table
-- Stores individual page results
CREATE TABLE crawled_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,

  -- URL information
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,

  -- Status
  status page_status NOT NULL DEFAULT 'pending',

  -- HTTP response
  http_status INTEGER,
  content_type TEXT,
  content_length INTEGER,

  -- Extracted content
  title TEXT,
  description TEXT,
  content TEXT,

  -- Discovered links
  links_found INTEGER DEFAULT 0,

  -- Timing
  crawled_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- URL Queue Table
-- Tracks URLs to be crawled (for resume capability)
CREATE TABLE url_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,

  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,

  -- Status
  status page_status NOT NULL DEFAULT 'pending',

  -- Retry tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Prevent duplicate URLs per job
  UNIQUE(job_id, normalized_url)
);

-- Robots.txt Cache Table
CREATE TABLE robots_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL UNIQUE,
  robots_txt TEXT,
  crawl_delay INTEGER,
  disallowed_paths TEXT[] DEFAULT '{}',
  allowed_paths TEXT[] DEFAULT '{}',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes for performance
CREATE INDEX idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX idx_crawl_jobs_domain ON crawl_jobs(domain);
CREATE INDEX idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

CREATE INDEX idx_crawled_pages_job_id ON crawled_pages(job_id);
CREATE INDEX idx_crawled_pages_status ON crawled_pages(status);
CREATE INDEX idx_crawled_pages_job_status ON crawled_pages(job_id, status);
CREATE INDEX idx_crawled_pages_crawled_at ON crawled_pages(crawled_at DESC);

CREATE INDEX idx_url_queue_job_id ON url_queue(job_id);
CREATE INDEX idx_url_queue_status ON url_queue(status);
CREATE INDEX idx_url_queue_job_pending ON url_queue(job_id, status) WHERE status = 'pending';
CREATE INDEX idx_url_queue_priority ON url_queue(priority DESC, created_at ASC);

CREATE INDEX idx_robots_cache_domain ON robots_cache(domain);
CREATE INDEX idx_robots_cache_expires ON robots_cache(expires_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_crawl_jobs_updated_at
  BEFORE UPDATE ON crawl_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crawled_pages_updated_at
  BEFORE UPDATE ON crawled_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- View for job statistics
CREATE VIEW job_statistics AS
SELECT
  j.id,
  j.seed_url,
  j.domain,
  j.status,
  j.pages_discovered,
  j.pages_crawled,
  j.pages_failed,
  j.pages_skipped,
  j.created_at,
  j.started_at,
  j.completed_at,
  CASE
    WHEN j.pages_discovered > 0
    THEN ROUND((j.pages_crawled::NUMERIC / j.pages_discovered) * 100, 2)
    ELSE 0
  END as progress_percent,
  CASE
    WHEN j.started_at IS NOT NULL AND j.pages_crawled > 0
    THEN ROUND(
      (EXTRACT(EPOCH FROM (COALESCE(j.completed_at, NOW()) - j.started_at)) / j.pages_crawled) *
      (j.pages_discovered - j.pages_crawled),
      0
    )
    ELSE NULL
  END as estimated_seconds_remaining
FROM crawl_jobs j;

-- Comments for documentation
COMMENT ON TABLE crawl_jobs IS 'Main crawl job configuration and status tracking';
COMMENT ON TABLE crawled_pages IS 'Individual page crawl results with extracted content';
COMMENT ON TABLE url_queue IS 'Queue of URLs pending crawl, supports resume capability';
COMMENT ON TABLE robots_cache IS 'Cached robots.txt data per domain';
