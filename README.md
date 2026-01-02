# CrawlScrap

A production-grade, asynchronous web crawler platform for US Higher Education websites, capable of crawling 50k-150k pages without timeouts, crashes, or memory issues.

## Features

- **Async Job Processing**: Non-blocking crawl jobs with real-time progress tracking
- **High Performance**: 20k-60k pages/hour with configurable parallel workers
- **Resume Safe**: Fault-tolerant design with PostgreSQL persistence
- **Polite Crawling**: robots.txt compliance, rate limiting, auto-throttle on 429
- **Modern Stack**: Next.js frontend with Material UI, Express backend
- **Enterprise Ready**: Docker support, comprehensive logging, graceful shutdown

## Tech Stack

### Frontend
- Next.js 14 (App Router)
- Material UI v5
- MUI DataGrid
- SWR for data fetching

### Backend
- Node.js + TypeScript
- Express.js
- Crawlee + Playwright
- BullMQ + Redis
- PostgreSQL

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm or yarn

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/crawlscrap.git
cd crawlscrap
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis
npm run docker:up
```

### 3. Configure Environment

```bash
# Copy environment template
cp server/.env.example server/.env

# Edit as needed (defaults work for local development)
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start Development Servers

```bash
# Start both client and server
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Usage

### Starting a Crawl

1. Open http://localhost:3000
2. Click "Start New Crawl"
3. Enter the website URL (e.g., https://www.university.edu)
4. Configure options (depth, max pages, workers)
5. Click "Start Crawl"

### API Usage

```bash
# Start a crawl
curl -X POST http://localhost:3001/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.university.edu", "maxPages": 1000}'

# Check job status
curl http://localhost:3001/api/jobs/{jobId}

# Get crawled pages
curl "http://localhost:3001/api/jobs/{jobId}/pages?page=1&limit=100"

# Export results
curl -o results.json "http://localhost:3001/api/jobs/{jobId}/export?format=json"
```

## Project Structure

```
crawlscrap/
├── client/                     # Next.js frontend
│   ├── app/                    # App Router pages
│   ├── components/             # React components
│   ├── lib/                    # API client
│   └── theme/                  # Material UI theme
│
├── server/                     # Express backend
│   ├── src/
│   │   ├── api/               # REST endpoints
│   │   ├── crawler/           # Crawlee engine
│   │   ├── queue/             # BullMQ workers
│   │   ├── db/                # PostgreSQL
│   │   ├── jobs/              # Job management
│   │   └── utils/             # Config, logger
│   └── tsconfig.json
│
├── docker/                     # Docker configuration
│   └── docker-compose.yml
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── SCALING.md
│
└── package.json               # Root workspace
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3001 | Server port |
| DATABASE_URL | - | PostgreSQL connection string |
| REDIS_HOST | localhost | Redis host |
| REDIS_PORT | 6379 | Redis port |
| MAX_CONCURRENT_WORKERS | 10 | Parallel crawl workers |
| DEFAULT_CRAWL_DELAY_MS | 1000 | Delay between requests |
| MAX_PAGES_PER_JOB | 150000 | Maximum pages per job |

### Crawl Options

| Option | Default | Description |
|--------|---------|-------------|
| maxDepth | 10 | Maximum link depth |
| maxPages | 100000 | Maximum pages to crawl |
| maxConcurrentWorkers | 10 | Parallel workers |
| crawlDelayMs | 1000 | Request delay in ms |
| respectRobotsTxt | true | Honor robots.txt |
| includePatterns | [] | URL patterns to include |
| excludePatterns | [] | URL patterns to exclude |

## Performance

| Workers | Pages/Hour | 100k Pages |
|---------|-----------|------------|
| 10      | ~20,000   | ~5 hours   |
| 15      | ~36,000   | ~3 hours   |
| 25      | ~60,000   | ~1.5 hours |

## API Reference

See [docs/API.md](docs/API.md) for complete API documentation.

### Key Endpoints

- `POST /api/crawl` - Start a new crawl job
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs/:id/pages` - Get crawled pages (paginated)
- `DELETE /api/jobs/:id` - Cancel a job
- `POST /api/jobs/:id/pause` - Pause a job
- `POST /api/jobs/:id/resume` - Resume a job

## Development

### Scripts

```bash
# Development
npm run dev              # Start both client and server
npm run dev:server       # Start server only
npm run dev:client       # Start client only

# Build
npm run build            # Build both
npm run build:server     # Build server
npm run build:client     # Build client

# Infrastructure
npm run docker:up        # Start PostgreSQL and Redis
npm run docker:down      # Stop containers
```

### Database

The schema is automatically applied when containers start. To manually apply:

```bash
docker exec -i crawlscrap-postgres psql -U crawler -d crawlscrap < server/src/db/schema.sql
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Scaling Guide](docs/SCALING.md)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built for crawling US Higher Education websites at scale.
