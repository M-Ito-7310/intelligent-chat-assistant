import { getRedisClient, isRedisAvailable, redisKeys } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Redis-based Rate Limiting Service
 * Implements sliding window and token bucket algorithms
 */
class RedisRateLimitService {
  constructor() {
    this.fallbackCounts = new Map(); // In-memory fallback when Redis unavailable
  }

  /**
   * Check rate limit using sliding window algorithm
   * @param {string} userId - User ID
   * @param {string} operation - Operation type (message, api_call, etc.)
   * @param {number} limit - Request limit
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Promise<{allowed: boolean, count: number, resetTime: number}>}
   */
  async checkSlidingWindow(userId, operation, limit, windowMs) {
    const redis = getRedisClient();
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const key = redisKeys.rateLimit(userId, operation, window);

    try {
      if (await isRedisAvailable()) {
        // Redis implementation - sliding window
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.expire(key, Math.ceil(windowMs / 1000));
        const results = await pipeline.exec();
        
        const count = results[0][1];
        const resetTime = (window + 1) * windowMs;

        if (count > limit) {
          logger.debug(`Rate limit exceeded for ${userId}:${operation} - ${count}/${limit}`);
          return {
            allowed: false,
            count,
            resetTime,
            remaining: 0
          };
        }

        return {
          allowed: true,
          count,
          resetTime,
          remaining: Math.max(0, limit - count)
        };

      } else {
        // Fallback to in-memory implementation
        return this.fallbackSlidingWindow(userId, operation, limit, windowMs, window);
      }
    } catch (error) {
      logger.error('Redis rate limit check error:', error);
      return this.fallbackSlidingWindow(userId, operation, limit, windowMs, window);
    }
  }

  /**
   * Check rate limit using token bucket algorithm
   * @param {string} userId - User ID
   * @param {string} operation - Operation type
   * @param {number} capacity - Bucket capacity
   * @param {number} refillRate - Tokens per second
   * @param {number} tokens - Tokens to consume (default: 1)
   * @returns {Promise<{allowed: boolean, tokens: number, refillTime: number}>}
   */
  async checkTokenBucket(userId, operation, capacity, refillRate, tokens = 1) {
    const redis = getRedisClient();
    const now = Date.now();
    const key = redisKeys.rateLimit(userId, operation, 'bucket');

    try {
      if (await isRedisAvailable()) {
        // Redis Lua script for atomic token bucket operations
        const luaScript = `
          local key = KEYS[1]
          local capacity = tonumber(ARGV[1])
          local refill_rate = tonumber(ARGV[2])
          local tokens_requested = tonumber(ARGV[3])
          local now = tonumber(ARGV[4])
          
          local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
          local current_tokens = tonumber(bucket[1]) or capacity
          local last_refill = tonumber(bucket[2]) or now
          
          -- Calculate tokens to add based on time elapsed
          local time_elapsed = (now - last_refill) / 1000
          local tokens_to_add = math.floor(time_elapsed * refill_rate)
          current_tokens = math.min(capacity, current_tokens + tokens_to_add)
          
          if current_tokens >= tokens_requested then
            current_tokens = current_tokens - tokens_requested
            redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
            redis.call('EXPIRE', key, 3600) -- 1 hour expiry
            return {1, current_tokens, last_refill}
          else
            redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', now)
            redis.call('EXPIRE', key, 3600)
            return {0, current_tokens, last_refill}
          end
        `;

        const result = await redis.eval(luaScript, 1, key, capacity, refillRate, tokens, now);
        const [allowed, remainingTokens, lastRefill] = result;

        const nextRefillTime = lastRefill + (1000 / refillRate); // Next token available

        return {
          allowed: allowed === 1,
          tokens: remainingTokens,
          refillTime: nextRefillTime,
          capacity
        };

      } else {
        // Fallback to in-memory token bucket
        return this.fallbackTokenBucket(userId, operation, capacity, refillRate, tokens, now);
      }
    } catch (error) {
      logger.error('Redis token bucket check error:', error);
      return this.fallbackTokenBucket(userId, operation, capacity, refillRate, tokens, now);
    }
  }

  /**
   * Check global rate limits (across all users)
   * @param {string} operation - Operation type
   * @param {number} limit - Global limit
   * @param {number} windowMs - Time window in milliseconds
   * @returns {Promise<{allowed: boolean, count: number}>}
   */
  async checkGlobalLimit(operation, limit, windowMs) {
    const redis = getRedisClient();
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const key = redisKeys.rateLimitGlobal(operation, window);

    try {
      if (await isRedisAvailable()) {
        const pipeline = redis.pipeline();
        pipeline.incr(key);
        pipeline.expire(key, Math.ceil(windowMs / 1000));
        const results = await pipeline.exec();
        
        const count = results[0][1];
        const allowed = count <= limit;

        if (!allowed) {
          logger.warn(`Global rate limit exceeded for ${operation} - ${count}/${limit}`);
        }

        return { allowed, count };
      } else {
        // Fallback - allow all requests if Redis unavailable
        return { allowed: true, count: 0 };
      }
    } catch (error) {
      logger.error('Global rate limit check error:', error);
      return { allowed: true, count: 0 };
    }
  }

  /**
   * Get current rate limit status
   * @param {string} userId - User ID
   * @param {string} operation - Operation type
   * @returns {Promise<Object>}
   */
  async getRateLimitStatus(userId, operation) {
    const redis = getRedisClient();

    try {
      if (await isRedisAvailable()) {
        const now = Date.now();
        const currentMinute = Math.floor(now / (60 * 1000));
        const currentHour = Math.floor(now / (60 * 60 * 1000));
        
        const minuteKey = redisKeys.rateLimit(userId, operation, currentMinute);
        const hourKey = redisKeys.rateLimit(userId, operation, currentHour);

        const [minuteCount, hourCount] = await Promise.all([
          redis.get(minuteKey).then(val => parseInt(val) || 0),
          redis.get(hourKey).then(val => parseInt(val) || 0)
        ]);

        return {
          minute: {
            count: minuteCount,
            resetTime: (currentMinute + 1) * 60 * 1000
          },
          hour: {
            count: hourCount,
            resetTime: (currentHour + 1) * 60 * 60 * 1000
          }
        };
      }
    } catch (error) {
      logger.error('Get rate limit status error:', error);
    }

    return null;
  }

  /**
   * Reset rate limit for user
   * @param {string} userId - User ID
   * @param {string} operation - Operation type
   * @returns {Promise<boolean>}
   */
  async resetRateLimit(userId, operation) {
    const redis = getRedisClient();

    try {
      if (await isRedisAvailable()) {
        const pattern = redisKeys.rateLimit(userId, operation, '*');
        const keys = await redis.keys(pattern);
        
        if (keys.length > 0) {
          await redis.del(...keys);
          logger.info(`Reset rate limit for ${userId}:${operation}`);
          return true;
        }
      }
    } catch (error) {
      logger.error('Reset rate limit error:', error);
    }

    return false;
  }

  /**
   * Fallback sliding window implementation (in-memory)
   */
  fallbackSlidingWindow(userId, operation, limit, windowMs, window) {
    const key = `${userId}:${operation}:${window}`;
    const now = Date.now();
    
    if (!this.fallbackCounts.has(key)) {
      this.fallbackCounts.set(key, { count: 0, expiry: now + windowMs });
    }

    const entry = this.fallbackCounts.get(key);
    
    // Clean expired entries
    if (entry.expiry < now) {
      this.fallbackCounts.delete(key);
      this.fallbackCounts.set(key, { count: 1, expiry: now + windowMs });
      return {
        allowed: true,
        count: 1,
        resetTime: now + windowMs,
        remaining: limit - 1
      };
    }

    entry.count++;
    const allowed = entry.count <= limit;

    return {
      allowed,
      count: entry.count,
      resetTime: entry.expiry,
      remaining: Math.max(0, limit - entry.count)
    };
  }

  /**
   * Fallback token bucket implementation (in-memory)
   */
  fallbackTokenBucket(userId, operation, capacity, refillRate, tokens, now) {
    const key = `${userId}:${operation}:bucket`;
    
    if (!this.fallbackCounts.has(key)) {
      this.fallbackCounts.set(key, { tokens: capacity, lastRefill: now });
    }

    const bucket = this.fallbackCounts.get(key);
    
    // Refill tokens
    const timeElapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.floor(timeElapsed * refillRate);
    bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= tokens;
    if (allowed) {
      bucket.tokens -= tokens;
    }

    return {
      allowed,
      tokens: bucket.tokens,
      refillTime: now + (1000 / refillRate),
      capacity
    };
  }

  /**
   * Clean up expired fallback entries
   */
  cleanupFallbackEntries() {
    const now = Date.now();
    for (const [key, entry] of this.fallbackCounts) {
      if (entry.expiry && entry.expiry < now) {
        this.fallbackCounts.delete(key);
      }
    }
  }
}

// Singleton instance
export const redisRateLimitService = new RedisRateLimitService();

// Cleanup interval for fallback entries
setInterval(() => {
  redisRateLimitService.cleanupFallbackEntries();
}, 60000); // Clean every minute