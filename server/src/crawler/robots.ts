import robotsParser from 'robots-parser';
import { URL } from 'url';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

interface RobotsCache {
  domain: string;
  robotsTxt: string | null;
  crawlDelay: number | null;
  disallowedPaths: string[];
  allowedPaths: string[];
  fetchedAt: Date;
  expiresAt: Date;
}

interface RobotsCacheRow {
  id: string;
  domain: string;
  robots_txt: string | null;
  crawl_delay: number | null;
  disallowed_paths: string[];
  allowed_paths: string[];
  fetched_at: Date;
  expires_at: Date;
}

// In-memory cache for faster access
const memoryCache = new Map<string, { parser: ReturnType<typeof robotsParser>; expiresAt: Date }>();

// Fetch robots.txt content
async function fetchRobotsTxt(domain: string): Promise<string | null> {
  const url = `https://${domain}/robots.txt`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CrawlScrapBot/1.0',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No robots.txt means allow all
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    // Try HTTP fallback
    try {
      const httpUrl = `http://${domain}/robots.txt`;
      const response = await fetch(httpUrl, {
        headers: {
          'User-Agent': 'CrawlScrapBot/1.0',
        },
      });

      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Ignore HTTP fallback errors
    }

    logger.warn('Failed to fetch robots.txt', { domain, error });
    return null;
  }
}

// Get cached robots.txt from database
async function getCachedRobots(domain: string): Promise<RobotsCache | null> {
  const result = await query<RobotsCacheRow>(
    `SELECT * FROM robots_cache WHERE domain = $1 AND expires_at > NOW()`,
    [domain]
  );

  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      domain: row.domain,
      robotsTxt: row.robots_txt,
      crawlDelay: row.crawl_delay,
      disallowedPaths: row.disallowed_paths || [],
      allowedPaths: row.allowed_paths || [],
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
    };
  }

  return null;
}

// Save robots.txt to database cache
async function cacheRobots(
  domain: string,
  robotsTxt: string | null,
  crawlDelay: number | null
): Promise<void> {
  await query(
    `INSERT INTO robots_cache (domain, robots_txt, crawl_delay, fetched_at, expires_at)
     VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (domain) DO UPDATE SET
       robots_txt = EXCLUDED.robots_txt,
       crawl_delay = EXCLUDED.crawl_delay,
       fetched_at = NOW(),
       expires_at = NOW() + INTERVAL '24 hours'`,
    [domain, robotsTxt, crawlDelay]
  );
}

// Get or fetch robots.txt parser
async function getRobotsParser(domain: string): Promise<ReturnType<typeof robotsParser> | null> {
  // Check memory cache first
  const cached = memoryCache.get(domain);
  if (cached && cached.expiresAt > new Date()) {
    return cached.parser;
  }

  // Check database cache
  const dbCache = await getCachedRobots(domain);
  if (dbCache && dbCache.robotsTxt) {
    const parser = robotsParser(`https://${domain}/robots.txt`, dbCache.robotsTxt);
    memoryCache.set(domain, {
      parser,
      expiresAt: dbCache.expiresAt,
    });
    return parser;
  }

  // Fetch fresh robots.txt
  const robotsTxt = await fetchRobotsTxt(domain);

  if (robotsTxt) {
    const parser = robotsParser(`https://${domain}/robots.txt`, robotsTxt);
    const crawlDelay = parser.getCrawlDelay('CrawlScrapBot') || parser.getCrawlDelay('*') || null;

    // Cache in database
    await cacheRobots(domain, robotsTxt, crawlDelay);

    // Cache in memory
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    memoryCache.set(domain, { parser, expiresAt });

    return parser;
  }

  // No robots.txt - cache null
  await cacheRobots(domain, null, null);
  return null;
}

// Check if URL is allowed by robots.txt
export async function isUrlAllowed(url: string, domain: string): Promise<boolean> {
  try {
    const parser = await getRobotsParser(domain);

    if (!parser) {
      return true; // No robots.txt means allow all
    }

    // Check for CrawlScrapBot first, then general user agent
    const allowed = parser.isAllowed(url, 'CrawlScrapBot');
    if (allowed !== undefined) {
      return allowed;
    }

    return parser.isAllowed(url, '*') ?? true;
  } catch (error) {
    logger.warn('Error checking robots.txt', { url, domain, error });
    return true; // Allow on error
  }
}

// Get crawl delay from robots.txt
export async function getCrawlDelay(domain: string): Promise<number | null> {
  try {
    const parser = await getRobotsParser(domain);

    if (!parser) {
      return null;
    }

    return parser.getCrawlDelay('CrawlScrapBot') || parser.getCrawlDelay('*') || null;
  } catch {
    return null;
  }
}

// Get sitemaps from robots.txt
export async function getSitemaps(domain: string): Promise<string[]> {
  try {
    const parser = await getRobotsParser(domain);

    if (!parser) {
      return [];
    }

    return parser.getSitemaps() || [];
  } catch {
    return [];
  }
}

// Initialize robots.txt cache for a domain
export async function checkRobotsTxt(domain: string): Promise<void> {
  await getRobotsParser(domain);
  logger.debug('Robots.txt checked', { domain });
}

// Clear memory cache
export function clearRobotsCache(): void {
  memoryCache.clear();
}
