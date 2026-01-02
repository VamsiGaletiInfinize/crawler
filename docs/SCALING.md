# CrawlScrap Scaling Guide

## Overview

This document provides guidance on scaling CrawlScrap for different workload sizes, from development to enterprise deployments.

## Performance Baseline

### Single Server Performance

| Workers | Pages/Hour | Time for 100k Pages | Memory Usage |
|---------|-----------|---------------------|--------------|
| 5       | ~10,000   | ~10 hours           | ~1 GB        |
| 10      | ~20,000   | ~5 hours            | ~2 GB        |
| 15      | ~36,000   | ~3 hours            | ~3 GB        |
| 25      | ~60,000   | ~1.5 hours          | ~5 GB        |

*Note: Actual performance depends on target site response times and network conditions.*

## Configuration Tuning

### Worker Configuration

```typescript
// server/src/utils/config.ts
crawler: {
  maxConcurrentWorkers: 10,  // Increase for faster crawling
  defaultCrawlDelayMs: 1000, // Decrease for faster, increase for politeness
  maxPagesPerJob: 150000,
  requestTimeoutMs: 30000,
}
```

### BullMQ Worker Settings

```typescript
// server/src/queue/workers.ts
pageJobsWorker = new Worker<PageJobData>(
  QUEUE_NAMES.PAGE_JOBS,
  processPageJob,
  {
    connection: redisConfig,
    concurrency: config.crawler.maxConcurrentWorkers,
    limiter: {
      max: config.rateLimit.requestsPerSecond * 10,
      duration: 10000,
    },
  }
);
```

## Horizontal Scaling

### Multi-Process Workers

Run multiple worker processes on the same machine:

```bash
# Start 4 worker processes
for i in {1..4}; do
  npm run start:worker &
done
```

### Multi-Server Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
┌───▼───┐               ┌───▼───┐               ┌───▼───┐
│ API 1 │               │ API 2 │               │ API 3 │
└───────┘               └───────┘               └───────┘
    │                       │                       │
    └───────────────────────┴───────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
┌───▼────┐              ┌───▼────┐              ┌───▼────┐
│Worker 1│              │Worker 2│              │Worker 3│
└────────┘              └────────┘              └────────┘
    │                       │                       │
    └───────────────────────┴───────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
    ┌────▼────┐                          ┌─────▼─────┐
    │ Redis   │                          │ PostgreSQL│
    │ Cluster │                          │  Primary  │
    └─────────┘                          └───────────┘
```

## Database Scaling

### PostgreSQL Optimization

**Connection Pooling**
```typescript
// server/src/db/index.ts
pool = new Pool({
  connectionString: config.database.url,
  max: 50,  // Increase pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

**Indexes** (already in schema.sql)
```sql
CREATE INDEX idx_crawled_pages_job_status ON crawled_pages(job_id, status);
CREATE INDEX idx_url_queue_job_pending ON url_queue(job_id, status) WHERE status = 'pending';
```

**Partitioning** (for very large deployments)
```sql
-- Partition crawled_pages by job_id
CREATE TABLE crawled_pages (
  id UUID,
  job_id UUID,
  ...
) PARTITION BY HASH (job_id);
```

### Redis Scaling

**Redis Cluster** for high availability:
```yaml
# docker-compose.prod.yml
redis-node-1:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes

redis-node-2:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes

redis-node-3:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes
```

## Memory Management

### Playwright Memory

Each Playwright browser instance uses ~50-100MB. Control memory with:

```typescript
// server/src/crawler/crawler.ts
browserPoolOptions: {
  maxOpenPagesPerBrowser: 1,
  retireBrowserAfterPageCount: 1,  // Restart browser frequently
}
```

### Content Limiting

Limit stored content to prevent database bloat:

```typescript
// Truncate content before storing
content: result.content?.substring(0, 50000),
```

### Queue Memory

Configure Redis maxmemory:

```bash
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

## Monitoring

### Key Metrics to Track

1. **Queue Depth**: `await queue.getJobCounts()`
2. **Processing Rate**: Pages crawled per minute
3. **Error Rate**: Failed pages / total pages
4. **Memory Usage**: Node.js process.memoryUsage()
5. **Database Connections**: Active pool connections

### Logging

```typescript
// Production logging configuration
const logger = winston.createLogger({
  level: 'info',  // Reduce to 'warn' for less noise
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```

## Production Checklist

### Infrastructure
- [ ] PostgreSQL with replicas
- [ ] Redis with persistence (RDB + AOF)
- [ ] Load balancer for API servers
- [ ] Container orchestration (Docker Swarm / K8s)

### Configuration
- [ ] Increase worker concurrency (15-25)
- [ ] Configure proper connection pool sizes
- [ ] Set appropriate timeouts
- [ ] Enable Redis persistence

### Monitoring
- [ ] Application metrics (Prometheus/Datadog)
- [ ] Database monitoring
- [ ] Queue monitoring (Bull Dashboard)
- [ ] Alert on error rates

### Security
- [ ] API authentication
- [ ] Rate limiting at API level
- [ ] Network isolation
- [ ] Secrets management

## Troubleshooting

### High Memory Usage
1. Reduce worker concurrency
2. Enable browser recycling
3. Limit stored content size
4. Check for memory leaks

### Slow Crawling
1. Increase worker concurrency
2. Reduce crawl delay
3. Check target site response times
4. Verify database indexes

### Job Stalling
1. Check Redis connectivity
2. Verify worker processes are running
3. Check for lock contention
4. Review failed job logs

### Database Bottleneck
1. Add more connection pool slots
2. Optimize slow queries
3. Consider read replicas
4. Implement connection retry logic
