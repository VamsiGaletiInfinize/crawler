# CrawlScrap Architecture

## Overview

CrawlScrap is a production-grade, asynchronous web crawler platform designed for crawling US Higher Education websites at scale (50k-150k pages per job).

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js App (Material UI)                     │   │
│  │  ┌──────────┐ ┌──────────────┐ ┌────────────────────────────┐  │   │
│  │  │  Landing │ │   Dashboard  │ │      Job Details Page      │  │   │
│  │  │   Page   │ │    (Jobs)    │ │   (Progress + Pages Table) │  │   │
│  │  └──────────┘ └──────────────┘ └────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ REST API
┌──────────────────────────────────▼──────────────────────────────────────┐
│                              SERVER                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Express Server                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ /crawl   │ │  /jobs   │ │ /pages   │ │ /cancel,pause,   │   │   │
│  │  │  (POST)  │ │  (GET)   │ │  (GET)   │ │     resume       │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Job Manager                                  │   │
│  │  • Job lifecycle management                                      │   │
│  │  • Completion detection                                          │   │
│  │  • Progress monitoring                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Crawler Engine                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ Crawler  │ │ Scraper  │ │ Robots   │ │   Rate Limiter   │   │   │
│  │  │(Crawlee) │ │(Extract) │ │ (Parser) │ │   (Per-domain)   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    BullMQ Workers                                │   │
│  │  ┌────────────────────┐  ┌─────────────────────────────────┐   │   │
│  │  │  Crawl Job Worker  │  │       Page Job Workers          │   │   │
│  │  │  (Initialization)  │  │  (5-25 concurrent, configurable)│   │   │
│  │  └────────────────────┘  └─────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         │                                                   │
┌────────▼────────┐                               ┌──────────▼──────────┐
│                 │                               │                     │
│   PostgreSQL    │                               │       Redis         │
│                 │                               │                     │
│ • crawl_jobs    │                               │ • Job Queue         │
│ • crawled_pages │                               │ • Page Queue        │
│ • url_queue     │                               │ • Rate Limit State  │
│ • robots_cache  │                               │                     │
│                 │                               │                     │
└─────────────────┘                               └─────────────────────┘
```

## Core Components

### 1. Frontend (Next.js + Material UI)

- **Landing Page**: Introduction and quick-start crawl form
- **Dashboard**: List all crawl jobs with filtering and pagination
- **Job Details**: Real-time progress, statistics, and paginated results

### 2. Backend (Express + TypeScript)

#### API Layer
- RESTful endpoints for job management
- Non-blocking request handling
- Paginated responses

#### Crawler Engine
- **Crawlee + Playwright**: Headless browser crawling
- **robots.txt Parser**: Compliance with site policies
- **Rate Limiter**: Per-domain request throttling
- **Content Scraper**: HTML parsing and data extraction

#### Queue System (BullMQ + Redis)
- **Crawl Jobs Queue**: Job initialization
- **Page Jobs Queue**: Individual page processing
- Automatic retry with exponential backoff
- Priority-based processing (depth-aware)

#### Database (PostgreSQL)
- **crawl_jobs**: Job configuration and status
- **crawled_pages**: Extracted page data
- **url_queue**: Pending URLs for resume capability
- **robots_cache**: Cached robots.txt data

## Data Flow

### Starting a Crawl

1. Client sends `POST /api/crawl` with configuration
2. Server creates job record in PostgreSQL
3. Job added to BullMQ crawl queue
4. Returns `jobId` immediately (202 Accepted)

### Job Processing

1. Crawl worker initializes job (fetches robots.txt, adds seed URL)
2. Page workers process URLs concurrently
3. New discovered URLs added to queue
4. Progress updated in real-time

### Result Retrieval

1. Client polls `GET /api/jobs/:jobId` for status
2. Paginated results via `GET /api/jobs/:jobId/pages`
3. Export via streaming `GET /api/jobs/:jobId/export`

## Key Design Decisions

### Async by Default
- Never block HTTP requests
- All long-running operations queued
- Real-time progress via polling

### Resume Safety
- All state persisted to PostgreSQL
- Queue state in Redis with persistence
- Job can resume after crash/restart

### Scalability
- Horizontal scaling via worker count
- Per-domain rate limiting
- Memory-efficient streaming exports

### Politeness
- robots.txt compliance
- Configurable crawl delays
- Auto-throttle on 429 responses

## Performance Characteristics

| Workers | Pages/Hour | 100k Pages |
|---------|-----------|------------|
| 10      | ~20,000   | ~5 hours   |
| 15      | ~36,000   | ~3 hours   |
| 25      | ~60,000   | ~1.5 hours |

## Error Handling

- Automatic retry (3 attempts) with exponential backoff
- Failed pages tracked separately
- Job continues despite individual page failures
- Comprehensive logging with Winston

## Security Considerations

- Helmet.js for HTTP security headers
- CORS configuration
- Input validation with Zod
- No credential storage in crawled content
