export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  getTimestamp?: () => number;
}

export interface RateLimiterCheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimiterCheckResult;
  reset(key: string): void;
}

export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly getTimestamp: () => number;
  private readonly windows = new Map<string, { windowStart: number; count: number }>();

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.getTimestamp = options.getTimestamp ?? Date.now;
  }

  check(key: string): RateLimiterCheckResult {
    const now = this.getTimestamp();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { windowStart: now, count: 1 });
      return { allowed: true, remaining: this.maxRequests - 1, retryAfterSeconds: 0 };
    }

    entry.count += 1;

    if (entry.count > this.maxRequests) {
      const elapsed = now - entry.windowStart;
      const retryAfterSeconds = Math.ceil((this.windowMs - elapsed) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return { allowed: true, remaining: this.maxRequests - entry.count, retryAfterSeconds: 0 };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}

export const rateLimiter = new FixedWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});
