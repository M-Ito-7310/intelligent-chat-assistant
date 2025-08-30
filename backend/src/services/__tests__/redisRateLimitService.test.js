import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { redisRateLimitService } from '../redisRateLimitService.js';
import * as redisConfig from '../../config/redis.js';

// Mock Redis client
const mockRedis = {
  ping: vi.fn(),
  pipeline: vi.fn(),
  eval: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  keys: vi.fn(),
  del: vi.fn(),
  hmget: vi.fn(),
  hmset: vi.fn()
};

const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([[null, 1], [null, 'OK']])
};

// Mock redis configuration
vi.mock('../../config/redis.js', () => ({
  getRedisClient: vi.fn(() => mockRedis),
  isRedisAvailable: vi.fn(),
  redisKeys: {
    rateLimit: (userId, operation, timeWindow) => `rl:${userId}:${operation}:${timeWindow}`,
    rateLimitGlobal: (operation, timeWindow) => `rl:global:${operation}:${timeWindow}`
  }
}));

describe('RedisRateLimitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.pipeline.mockReturnValue(mockPipeline);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkSlidingWindow', () => {
    it('should allow request within rate limit', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockPipeline.exec.mockResolvedValue([[null, 5], [null, 'OK']]);

      const result = await redisRateLimitService.checkSlidingWindow(
        'user123',
        'message',
        10, // limit
        60000 // 1 minute window
      );

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(5);
      expect(result.remaining).toBe(5);
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should deny request when rate limit exceeded', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockPipeline.exec.mockResolvedValue([[null, 11], [null, 'OK']]);

      const result = await redisRateLimitService.checkSlidingWindow(
        'user123',
        'message',
        10, // limit
        60000 // 1 minute window
      );

      expect(result.allowed).toBe(false);
      expect(result.count).toBe(11);
      expect(result.remaining).toBe(0);
    });

    it('should use fallback when Redis unavailable', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      const result = await redisRateLimitService.checkSlidingWindow(
        'user123',
        'message',
        10,
        60000
      );

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockPipeline.exec.mockRejectedValue(new Error('Redis connection failed'));

      const result = await redisRateLimitService.checkSlidingWindow(
        'user123',
        'message',
        10,
        60000
      );

      expect(result.allowed).toBe(true); // Should fallback
      expect(result.count).toBe(1);
    });
  });

  describe('checkTokenBucket', () => {
    it('should allow request when tokens available', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockRedis.eval.mockResolvedValue([1, 9, 1640995200000]);

      const result = await redisRateLimitService.checkTokenBucket(
        'user123',
        'message',
        10, // capacity
        0.2, // refill rate (tokens per second)
        1 // tokens requested
      );

      expect(result.allowed).toBe(true);
      expect(result.tokens).toBe(9);
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('should deny request when insufficient tokens', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockRedis.eval.mockResolvedValue([0, 0, 1640995200000]);

      const result = await redisRateLimitService.checkTokenBucket(
        'user123',
        'message',
        10,
        0.2,
        1
      );

      expect(result.allowed).toBe(false);
      expect(result.tokens).toBe(0);
    });

    it('should use fallback when Redis unavailable', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      const result = await redisRateLimitService.checkTokenBucket(
        'user123',
        'message',
        10,
        0.2,
        1
      );

      expect(result.allowed).toBe(true);
      expect(result.capacity).toBe(10);
    });
  });

  describe('checkGlobalLimit', () => {
    it('should allow request within global limit', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockPipeline.exec.mockResolvedValue([[null, 25], [null, 'OK']]);

      const result = await redisRateLimitService.checkGlobalLimit(
        'api_call',
        50, // global limit
        60000 // 1 minute window
      );

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(25);
    });

    it('should deny request when global limit exceeded', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockPipeline.exec.mockResolvedValue([[null, 51], [null, 'OK']]);

      const result = await redisRateLimitService.checkGlobalLimit(
        'api_call',
        50,
        60000
      );

      expect(result.allowed).toBe(false);
      expect(result.count).toBe(51);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockRedis.get
        .mockResolvedValueOnce('5') // minute count
        .mockResolvedValueOnce('20'); // hour count

      const result = await redisRateLimitService.getRateLimitStatus(
        'user123',
        'message'
      );

      expect(result).toEqual({
        minute: {
          count: 5,
          resetTime: expect.any(Number)
        },
        hour: {
          count: 20,
          resetTime: expect.any(Number)
        }
      });
    });

    it('should return null when Redis unavailable', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      const result = await redisRateLimitService.getRateLimitStatus(
        'user123',
        'message'
      );

      expect(result).toBeNull();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limits successfully', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockRedis.keys.mockResolvedValue(['rl:user123:message:1640995200', 'rl:user123:message:1640995260']);
      mockRedis.del.mockResolvedValue(2);

      const result = await redisRateLimitService.resetRateLimit('user123', 'message');

      expect(result).toBe(true);
      expect(mockRedis.keys).toHaveBeenCalledWith('rl:user123:message:*');
      expect(mockRedis.del).toHaveBeenCalledWith('rl:user123:message:1640995200', 'rl:user123:message:1640995260');
    });

    it('should return false when no keys to reset', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(true);
      mockRedis.keys.mockResolvedValue([]);

      const result = await redisRateLimitService.resetRateLimit('user123', 'message');

      expect(result).toBe(false);
    });

    it('should return false when Redis unavailable', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      const result = await redisRateLimitService.resetRateLimit('user123', 'message');

      expect(result).toBe(false);
    });
  });

  describe('Fallback functionality', () => {
    it('should maintain separate counters for different users in fallback', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      // First user
      const result1 = await redisRateLimitService.checkSlidingWindow('user1', 'message', 5, 60000);
      expect(result1.allowed).toBe(true);
      expect(result1.count).toBe(1);

      // Second user should have separate counter
      const result2 = await redisRateLimitService.checkSlidingWindow('user2', 'message', 5, 60000);
      expect(result2.allowed).toBe(true);
      expect(result2.count).toBe(1);

      // First user again
      const result3 = await redisRateLimitService.checkSlidingWindow('user1', 'message', 5, 60000);
      expect(result3.allowed).toBe(true);
      expect(result3.count).toBe(2);
    });

    it('should enforce limits in fallback mode', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);

      // Make requests up to limit
      for (let i = 1; i <= 5; i++) {
        const result = await redisRateLimitService.checkSlidingWindow('user123', 'message', 5, 60000);
        expect(result.allowed).toBe(true);
        expect(result.count).toBe(i);
      }

      // Sixth request should be denied
      const result = await redisRateLimitService.checkSlidingWindow('user123', 'message', 5, 60000);
      expect(result.allowed).toBe(false);
      expect(result.count).toBe(6);
    });

    it('should clean up expired fallback entries', () => {
      // Set up expired entry
      const expiredTime = Date.now() - 70000; // 70 seconds ago
      redisRateLimitService.fallbackCounts.set('expired:key', {
        count: 1,
        expiry: expiredTime
      });

      // Set up valid entry
      const validTime = Date.now() + 50000; // 50 seconds from now
      redisRateLimitService.fallbackCounts.set('valid:key', {
        count: 1,
        expiry: validTime
      });

      redisRateLimitService.cleanupFallbackEntries();

      expect(redisRateLimitService.fallbackCounts.has('expired:key')).toBe(false);
      expect(redisRateLimitService.fallbackCounts.has('valid:key')).toBe(true);
    });
  });

  describe('Token bucket fallback', () => {
    it('should refill tokens over time in fallback mode', async () => {
      redisConfig.isRedisAvailable.mockResolvedValue(false);
      
      const now = Date.now();
      
      // First request
      const result1 = await redisRateLimitService.checkTokenBucket('user123', 'test', 10, 1, 5); // Use 5 tokens
      expect(result1.allowed).toBe(true);
      expect(result1.tokens).toBe(5); // 10 - 5 = 5 remaining

      // Mock time advancement (5 seconds)
      const futureTime = now + 5000;
      vi.spyOn(Date, 'now').mockReturnValue(futureTime);

      // Should have refilled 5 tokens (1 token per second * 5 seconds)
      const result2 = await redisRateLimitService.checkTokenBucket('user123', 'test', 10, 1, 1);
      expect(result2.allowed).toBe(true);
      expect(result2.tokens).toBe(9); // 5 + 5 (refilled) - 1 (used) = 9

      vi.restoreAllMocks();
    });
  });
});