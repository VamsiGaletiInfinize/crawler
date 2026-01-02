# CrawlScrap API Documentation

## Base URL

```
http://localhost:3001/api
```

## Authentication

Currently, the API does not require authentication. In production, implement appropriate authentication middleware.

---

## Endpoints

### Health Check

```
GET /api/health
```

Check the health status of the server and its dependencies.

**Response**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

---

### Start Crawl

```
POST /api/crawl
```

Start a new crawl job. Returns immediately with a job ID.

**Request Body**
```json
{
  "url": "https://www.university.edu",
  "maxDepth": 10,
  "maxPages": 100000,
  "maxConcurrentWorkers": 10,
  "crawlDelayMs": 1000,
  "respectRobotsTxt": true,
  "includePatterns": ["/admissions/.*", "/programs/.*"],
  "excludePatterns": ["/calendar/.*", "/events/.*"]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| url | string | required | The seed URL to start crawling from |
| maxDepth | number | 10 | Maximum link depth to crawl (1-50) |
| maxPages | number | 100000 | Maximum pages to crawl (1-150000) |
| maxConcurrentWorkers | number | 10 | Parallel workers (1-50) |
| crawlDelayMs | number | 1000 | Delay between requests in ms (100-10000) |
| respectRobotsTxt | boolean | true | Honor robots.txt rules |
| includePatterns | string[] | [] | Regex patterns for URLs to include |
| excludePatterns | string[] | [] | Regex patterns for URLs to exclude |

**Response (202 Accepted)**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Crawl job created and queued for processing"
}
```

---

### List Jobs

```
GET /api/jobs
```

List all crawl jobs with pagination.

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Items per page (max 100) |
| status | string | - | Filter by status |

**Response**
```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "seedUrl": "https://www.university.edu",
      "domain": "www.university.edu",
      "status": "running",
      "progress": {
        "discovered": 15000,
        "crawled": 8500,
        "failed": 50,
        "skipped": 100,
        "percent": 57
      },
      "createdAt": "2024-01-15T10:00:00.000Z",
      "startedAt": "2024-01-15T10:00:05.000Z",
      "completedAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### Get Job Details

```
GET /api/jobs/:jobId
```

Get detailed information about a specific job.

**Response**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "seedUrl": "https://www.university.edu",
  "domain": "www.university.edu",
  "status": "running",
  "config": {
    "maxDepth": 10,
    "maxPages": 100000,
    "maxConcurrentWorkers": 10,
    "crawlDelayMs": 1000,
    "respectRobotsTxt": true,
    "includePatterns": [],
    "excludePatterns": []
  },
  "progress": {
    "discovered": 15000,
    "crawled": 8500,
    "failed": 50,
    "skipped": 100,
    "percent": 57,
    "eta": "2024-01-15T12:30:00.000Z",
    "crawlRate": 25000
  },
  "queue": {
    "pending": 6350,
    "crawling": 10,
    "completed": 8500,
    "failed": 50
  },
  "timing": {
    "createdAt": "2024-01-15T10:00:00.000Z",
    "startedAt": "2024-01-15T10:00:05.000Z",
    "completedAt": null,
    "updatedAt": "2024-01-15T11:15:00.000Z"
  },
  "errors": {
    "lastError": null,
    "errorCount": 50
  }
}
```

---

### Get Crawled Pages

```
GET /api/jobs/:jobId/pages
```

Get paginated list of crawled pages.

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 100 | Items per page (max 1000) |
| status | string | - | Filter by status (completed, failed, pending) |

**Response**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "pages": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "url": "https://www.university.edu/admissions",
      "depth": 1,
      "status": "completed",
      "httpStatus": 200,
      "contentType": "text/html",
      "title": "Admissions | University",
      "description": "Learn about admissions requirements...",
      "linksFound": 45,
      "crawledAt": "2024-01-15T10:01:00.000Z",
      "durationMs": 1250,
      "errorMessage": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 8500,
    "totalPages": 85,
    "hasMore": true
  }
}
```

---

### Export Pages

```
GET /api/jobs/:jobId/export
```

Export all completed pages as JSON or CSV (streaming response).

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | json | Export format (json, csv) |

**Response Headers**
```
Content-Type: application/json (or text/csv)
Content-Disposition: attachment; filename="crawl-{jobId}.json"
```

---

### Cancel Job

```
DELETE /api/jobs/:jobId
```

Cancel a running or pending job.

**Response**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "message": "Job cancellation initiated"
}
```

---

### Pause Job

```
POST /api/jobs/:jobId/pause
```

Pause a running job.

**Response**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "paused",
  "message": "Job paused successfully"
}
```

---

### Resume Job

```
POST /api/jobs/:jobId/resume
```

Resume a paused job.

**Response**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "message": "Job resumed successfully"
}
```

---

## Job Status Values

| Status | Description |
|--------|-------------|
| pending | Job created, waiting to start |
| running | Actively crawling pages |
| paused | Temporarily stopped by user |
| completed | Successfully finished |
| failed | Terminated due to errors |
| cancelled | Stopped by user request |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "details": { ... }
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 202 | Accepted (async operation started) |
| 400 | Bad Request (invalid input) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Rate Limiting

The API does not currently implement rate limiting at the HTTP level. The crawler engine handles rate limiting per-domain internally.

---

## Best Practices

1. **Poll for status** - Use `GET /api/jobs/:jobId` to check progress
2. **Paginate results** - Always use pagination for pages endpoint
3. **Handle async** - The crawl endpoint returns immediately; job runs in background
4. **Export large results** - Use the export endpoint for bulk data retrieval
