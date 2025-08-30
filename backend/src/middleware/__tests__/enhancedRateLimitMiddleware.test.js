import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enhancedRateLimitMiddleware, createEndpointRateLimit } from '../enhancedRateLimitMiddleware.js';
import * as rateLimitConfig from '../../config/rateLimitConfig.js';
import { quotaService } from '../../services/quotaService.js';

// Mock dependencies
vi.mock('../../services/quotaService.js', () => ({
  quotaService: {
    checkRateLimit: vi.fn(),
    checkGlobalRateLimit: vi.fn()
  }
}));

vi.mock('../../config/rateLimitConfig.js', () => ({
  getEndpointConfig: vi.fn(),
  applyTierMultipliers: vi.fn(),
  shouldBypassRateLimit: vi.fn(),
  getRoleMultiplier: vi.fn(),
  responseConfigs: {
    statusCodes: {
      rateLimitExceeded: 429,
      blocked: 423
    },
    headers: {
      rateLimitLimit: 'X-RateLimit-Limit',
      rateLimitRemaining: 'X-RateLimit-Remaining',
      rateLimitReset: 'X-RateLimit-Reset',
      retryAfter: 'Retry-After'
    },
    messages: {
      generic: 'Rate limit exceeded. Please try again later.',
      blocked: 'Access temporarily blocked due to excessive requests.'
    }
  }
}));

describe('EnhancedRateLimitMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: {
        id: 'user123',
        role: 'user',
        subscription_tier: 'free'
      },
      ip: '192.168.1.1',
      connection: { remoteAddress: '192.168.1.1' }
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      set: vi.fn()
    };

    next = vi.fn();

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic middleware functionality', () => {
    it('should proceed when no rate limit config found', async () => {
      rateLimitConfig.getEndpointConfig.mockReturnValue(null);
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);

      const middleware = enhancedRateLimitMiddleware('test', 'operation');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should bypass rate limiting when conditions met', async () => {
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(true);

      const middleware = enhancedRateLimitMiddleware('test', 'operation');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for unauthenticated users by default', async () => {
      req.user = null;

      const middleware = enhancedRateLimitMiddleware('test', 'operation');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should apply rate limiting to unauthenticated users when requireAuth is false', async () => {
      req.user = null;
      
      const mockConfig = {
        algorithm: 'sliding_window',
        message: 'Rate limited',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);
      
      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('test', 'operation', { requireAuth: false });
      await middleware(req, res, next);

      expect(quotaService.checkRateLimit).toHaveBeenCalledWith(
        '192.168.1.1', // Should use IP when no user
        'test_operation',
        'sliding_window'
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate limiting algorithms', () => {
    beforeEach(() => {
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);
    });

    it('should use sliding window algorithm by default', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        message: 'Rate limited',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(quotaService.checkRateLimit).toHaveBeenCalledWith(
        'user123',
        'chat_message',
        'sliding_window'
      );
      expect(next).toHaveBeenCalled();
    });

    it('should use token bucket algorithm when configured', async () => {
      const mockConfig = {
        algorithm: 'token_bucket',
        message: 'Rate limited',
        capacity: 10,
        refillRate: 0.2
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(quotaService.checkRateLimit).toHaveBeenCalledWith(
        'user123',
        'chat_message',
        'token_bucket'
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Rate limit exceeded handling', () => {
    beforeEach(() => {
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);
    });

    it('should return 429 when rate limit exceeded', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        message: 'Too many requests',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 30,
        resetTime: Date.now() + 30000
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        retryAfter: 30,
        limit: 10, // from limits.per_minute
        remaining: 0,
        resetTime: expect.any(Number),
        timestamp: expect.any(String)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should set appropriate response headers', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        message: 'Rate limited',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 3,
        resetTime: 1640995200000,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '3');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Reset', '1640995200');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Tier and role multipliers', () => {
    beforeEach(() => {
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
    });

    it('should apply tier multipliers', async () => {
      const baseConfig = {
        algorithm: 'sliding_window',
        limits: { per_minute: 10 }
      };

      const tierAdjustedConfig = {
        algorithm: 'sliding_window',
        limits: { per_minute: 30 } // 3x multiplier for pro
      };

      req.user.subscription_tier = 'pro';

      rateLimitConfig.getEndpointConfig.mockReturnValue(baseConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(tierAdjustedConfig);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 25,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(rateLimitConfig.applyTierMultipliers).toHaveBeenCalledWith(baseConfig, 'pro');
      expect(next).toHaveBeenCalled();
    });

    it('should apply role multipliers', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        limits: { per_minute: 10 }
      };

      req.user.role = 'admin';

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(5); // Admin gets 5x multiplier

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 45,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(rateLimitConfig.getRoleMultiplier).toHaveBeenCalledWith('admin');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should proceed on middleware errors', async () => {
      rateLimitConfig.getEndpointConfig.mockImplementation(() => {
        throw new Error('Config error');
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should proceed when quota service throws error', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);

      quotaService.checkRateLimit.mockRejectedValue(new Error('Service error'));

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Endpoint-specific middleware factories', () => {
    it('should create auth login middleware', () => {
      const middleware = createEndpointRateLimit.auth.login();
      expect(typeof middleware).toBe('function');
    });

    it('should create chat message middleware', () => {
      const middleware = createEndpointRateLimit.chat.message();
      expect(typeof middleware).toBe('function');
    });

    it('should create document upload middleware', () => {
      const middleware = createEndpointRateLimit.documents.upload();
      expect(typeof middleware).toBe('function');
    });

    it('should create system health middleware with requireAuth false', async () => {
      // Mock the endpoint config for system health
      rateLimitConfig.getEndpointConfig.mockReturnValue({
        algorithm: 'sliding_window',
        limits: { per_minute: 60 }
      });
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.applyTierMultipliers.mockReturnValue({
        algorithm: 'sliding_window',
        limits: { per_minute: 60 }
      });
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 59
      });

      req.user = null; // Unauthenticated request

      const middleware = createEndpointRateLimit.system.health();
      await middleware(req, res, next);

      // Should still proceed because system.health allows unauthenticated access
      expect(quotaService.checkRateLimit).toHaveBeenCalledWith(
        '192.168.1.1', // Uses IP for anonymous users
        'system_health',
        'sliding_window'
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Request information storage', () => {
    it('should store rate limit info for usage recording', async () => {
      const mockConfig = {
        algorithm: 'sliding_window',
        message: 'Rate limited',
        limits: { per_minute: 10 }
      };

      rateLimitConfig.getEndpointConfig.mockReturnValue(mockConfig);
      rateLimitConfig.applyTierMultipliers.mockReturnValue(mockConfig);
      rateLimitConfig.shouldBypassRateLimit.mockReturnValue(false);
      rateLimitConfig.getRoleMultiplier.mockReturnValue(1);

      quotaService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        retryAfter: null
      });

      const middleware = enhancedRateLimitMiddleware('chat', 'message');
      await middleware(req, res, next);

      expect(req.rateLimitInfo).toEqual({
        endpoint: 'chat.message',
        algorithm: 'sliding_window',
        remaining: 5,
        limit: mockConfig
      });
      expect(next).toHaveBeenCalled();
    });
  });
});