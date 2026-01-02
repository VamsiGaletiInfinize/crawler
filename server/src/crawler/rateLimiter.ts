import { logger } from '../utils/logger.js';

export class RateLimiter {
  private delayMs: number;
  private lastRequest: number = 0;
  private queue: Array<{ resolve: () => void }> = [];
  private processing: boolean = false;
  private throttleUntil: number = 0;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  // Acquire permission to make a request
  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ resolve });
      this.process();
    });
  }

  // Process the queue
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      const now = Date.now();

      // Check if we're throttled (429 response)
      if (this.throttleUntil > now) {
        const waitTime = this.throttleUntil - now;
        await this.sleep(waitTime);
      }

      // Calculate delay since last request
      const elapsed = now - this.lastRequest;
      const waitTime = Math.max(0, this.delayMs - elapsed);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      this.lastRequest = Date.now();
      item.resolve();
    }

    this.processing = false;
  }

  // Set throttle after receiving 429
  throttle(durationMs: number): void {
    this.throttleUntil = Date.now() + durationMs;
    logger.warn('Rate limiter throttled', {
      durationMs,
      until: new Date(this.throttleUntil).toISOString(),
    });
  }

  // Update delay (e.g., from robots.txt crawl-delay)
  setDelay(delayMs: number): void {
    this.delayMs = delayMs;
  }

  // Get current delay setting
  getDelay(): number {
    return this.delayMs;
  }

  // Check if currently throttled
  isThrottled(): boolean {
    return Date.now() < this.throttleUntil;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Token bucket rate limiter for more precise control
export class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1): Promise<void> {
    this.refill();

    while (this.tokens < tokens) {
      const needed = tokens - this.tokens;
      const waitTime = (needed / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.tokens -= tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Domain-specific rate limiter manager
export class DomainRateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();
  private defaultDelayMs: number;

  constructor(defaultDelayMs: number = 1000) {
    this.defaultDelayMs = defaultDelayMs;
  }

  get(domain: string): RateLimiter {
    if (!this.limiters.has(domain)) {
      this.limiters.set(domain, new RateLimiter(this.defaultDelayMs));
    }
    return this.limiters.get(domain)!;
  }

  setDelay(domain: string, delayMs: number): void {
    const limiter = this.get(domain);
    limiter.setDelay(delayMs);
  }

  throttle(domain: string, durationMs: number): void {
    const limiter = this.get(domain);
    limiter.throttle(durationMs);
  }

  clear(): void {
    this.limiters.clear();
  }
}

export default RateLimiter;
