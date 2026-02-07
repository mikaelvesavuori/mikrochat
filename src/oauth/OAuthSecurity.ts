import { randomBytes } from 'node:crypto';

import type {
  OAuthConfiguration,
  OAuthState,
  RateLimitRecord
} from './interfaces';

const DEFAULT_STATE_EXPIRY_SECONDS = 600;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_MS = 900_000;
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * @description In-memory CSRF state and rate limiting for OAuth flows.
 */
export class OAuthSecurity {
  private readonly states = new Map<string, OAuthState>();
  private readonly rateLimits = new Map<string, RateLimitRecord>();
  private readonly stateExpiryMs: number;
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: OAuthConfiguration) {
    this.stateExpiryMs =
      (config.stateExpirySeconds || DEFAULT_STATE_EXPIRY_SECONDS) * 1000;
    this.maxAttempts = config.rateLimiting?.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    this.windowMs = config.rateLimiting?.windowMs || DEFAULT_WINDOW_MS;

    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  /**
   * @description Generate a CSRF state token tied to the client IP and provider.
   */
  generateState(ip: string, providerId: string): string {
    const token = randomBytes(32).toString('hex');

    this.states.set(token, {
      expires: Date.now() + this.stateExpiryMs,
      providerId,
      ip
    });

    return token;
  }

  /**
   * @description Validate a CSRF state token. Consumes the token on success.
   */
  validateState(
    state: string,
    ip: string,
    providerId: string
  ): { valid: boolean; error?: string } {
    const stored = this.states.get(state);

    if (!stored) return { valid: false, error: 'Invalid or expired state' };

    // Always consume the state token (one-time use)
    this.states.delete(state);

    if (Date.now() > stored.expires)
      return { valid: false, error: 'State token expired' };

    if (stored.providerId !== providerId)
      return { valid: false, error: 'Provider mismatch' };

    if (stored.ip !== ip) return { valid: false, error: 'IP address mismatch' };

    return { valid: true };
  }

  /**
   * @description Check if a key (typically IP-based) is within rate limits.
   * Returns true if the request is allowed, false if rate-limited.
   */
  checkRateLimit(key: string): boolean {
    const now = Date.now();
    const record = this.rateLimits.get(key);

    if (!record || now > record.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    record.count++;
    return record.count <= this.maxAttempts;
  }

  /**
   * @description Get rate limit info for a key (for Retry-After headers).
   */
  getRateLimitInfo(key: string): { remaining: number; reset: number } {
    const record = this.rateLimits.get(key);
    if (!record)
      return { remaining: this.maxAttempts, reset: Date.now() + this.windowMs };

    return {
      remaining: Math.max(0, this.maxAttempts - record.count),
      reset: record.resetAt
    };
  }

  /**
   * @description Clean up expired states and rate limit records.
   */
  private cleanup() {
    const now = Date.now();

    for (const [key, state] of this.states) {
      if (now > state.expires) this.states.delete(key);
    }

    for (const [key, record] of this.rateLimits) {
      if (now > record.resetAt) this.rateLimits.delete(key);
    }
  }

  /**
   * @description Stop the cleanup timer. Call when shutting down.
   */
  destroy() {
    clearInterval(this.cleanupTimer);
  }
}
