import { PlaywrightCrawler, Configuration } from 'crawlee';
import { Page } from 'playwright';
import { URL } from 'url';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { isUrlAllowed } from './robots.js';

export interface CrawlResult {
  url: string;
  statusCode: number;
  contentType: string | null;
  contentLength: number;
  title: string | null;
  description: string | null;
  content: string | null;
  links: string[];
  headers: Record<string, string>;
}

export interface CrawlOptions {
  respectRobotsTxt: boolean;
  domain: string;
  timeout?: number;
}

// Normalize URL for deduplication
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Convert to lowercase
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    // Remove trailing slash from path (except for root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Sort query parameters
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsed.search = sortedParams.toString();

    // Remove fragment
    parsed.hash = '';

    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    trackingParams.forEach((p) => sortedParams.delete(p));
    parsed.search = sortedParams.toString();

    return parsed.toString();
  } catch {
    return url;
  }
}

// Check if URL belongs to the target domain
export function isInDomain(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);
    const urlDomain = parsed.hostname.toLowerCase();

    // Allow exact match or subdomains
    return urlDomain === domain || urlDomain.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

// Extract links from HTML content
export function extractLinks(html: string, baseUrl: string, domain: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // Simple regex to find href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1];

      // Skip non-http links
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }

      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).toString();

      // Check if in domain
      if (!isInDomain(absoluteUrl, domain)) {
        continue;
      }

      // Normalize and deduplicate
      const normalized = normalizeUrl(absoluteUrl);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return links;
}

// Crawl a single page using Playwright
export async function crawlPage(
  url: string,
  options: CrawlOptions
): Promise<CrawlResult> {
  const { respectRobotsTxt, domain, timeout = config.crawler.requestTimeoutMs } = options;

  // Check robots.txt
  if (respectRobotsTxt) {
    const allowed = await isUrlAllowed(url, domain);
    if (!allowed) {
      throw new Error('URL blocked by robots.txt');
    }
  }

  return new Promise((resolve, reject) => {
    let result: CrawlResult | null = null;

    // Configure Crawlee to use minimal storage
    Configuration.getGlobalConfig().set('persistStorage', false);

    const crawler = new PlaywrightCrawler({
      headless: true,
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: timeout / 1000,
      navigationTimeoutSecs: timeout / 1000,
      browserPoolOptions: {
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 1,
      },
      launchContext: {
        launchOptions: {
          args: [
            '--disable-gpu',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      },
      async requestHandler({ page, request, response }) {
        // Get response details
        const statusCode = response?.status() || 0;
        const headers = response?.headers() || {};
        const contentType = headers['content-type'] || null;

        // Get page content
        const content = await page.content();
        const contentLength = content.length;

        // Extract title
        const title = await page.title().catch(() => null);

        // Extract meta description
        const description = await page
          .$eval('meta[name="description"]', (el) => el.getAttribute('content'))
          .catch(() => null);

        // Extract links
        const links = extractLinks(content, request.url, domain);

        result = {
          url: request.url,
          statusCode,
          contentType,
          contentLength,
          title,
          description,
          content,
          links,
          headers,
        };
      },
      failedRequestHandler({ request }, error) {
        reject(error);
      },
    });

    crawler
      .run([url])
      .then(() => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('No result from crawler'));
        }
      })
      .catch(reject)
      .finally(() => {
        crawler.teardown().catch(() => {});
      });
  });
}

// User agent rotation
const userAgents = [
  'Mozilla/5.0 (compatible; CrawlScrapBot/1.0; +https://example.com/bot)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}
