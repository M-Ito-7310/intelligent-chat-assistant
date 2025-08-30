import { describe, it, expect } from 'vitest';
import {
  getEndpointConfig,
  applyTierMultipliers,
  shouldBypassRateLimit,
  getRoleMultiplier,
  endpointConfigs,
  globalConfigs,
  bypassConfigs
} from '../rateLimitConfig.js';

describe('RateLimitConfig', () => {
  describe('getEndpointConfig', () => {
    it('should return correct config for existing endpoint', () => {
      const config = getEndpointConfig('auth', 'login');
      
      expect(config).toEqual({
        algorithm: 'sliding_window',
        limits: {
          per_minute: 5,
          per_hour: 20,
          per_day: 50
        },
        blockDuration: 900000,
        message: 'Too many login attempts. Please try again later.',
        category: 'auth',
        operation: 'login',
        key: 'auth.login'
      });
    });

    it('should return null for non-existent category', () => {
      const config = getEndpointConfig('nonexistent', 'operation');
      expect(config).toBeNull();
    });

    it('should return null for non-existent operation', () => {
      const config = getEndpointConfig('auth', 'nonexistent');
      expect(config).toBeNull();
    });

    it('should return config with correct key format', () => {
      const config = getEndpointConfig('chat', 'message');
      expect(config.key).toBe('chat.message');
      expect(config.category).toBe('chat');
      expect(config.operation).toBe('message');
    });
  });

  describe('applyTierMultipliers', () => {
    const baseConfig = {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 10,
        per_hour: 100
      },
      tierMultipliers: {
        free: 1,
        pro: 3,
        enterprise: 5
      }
    };

    it('should apply pro tier multiplier correctly', () => {
      const result = applyTierMultipliers(baseConfig, 'pro');
      
      expect(result.limits).toEqual({
        per_minute: 30, // 10 * 3
        per_hour: 300   // 100 * 3
      });
    });

    it('should apply enterprise tier multiplier correctly', () => {
      const result = applyTierMultipliers(baseConfig, 'enterprise');
      
      expect(result.limits).toEqual({
        per_minute: 50,  // 10 * 5
        per_hour: 500    // 100 * 5
      });
    });

    it('should apply free tier multiplier correctly', () => {
      const result = applyTierMultipliers(baseConfig, 'free');
      
      expect(result.limits).toEqual({
        per_minute: 10,  // 10 * 1
        per_hour: 100    // 100 * 1
      });
    });

    it('should default to multiplier of 1 for unknown tier', () => {
      const result = applyTierMultipliers(baseConfig, 'unknown');
      
      expect(result.limits).toEqual({
        per_minute: 10,  // 10 * 1
        per_hour: 100    // 100 * 1
      });
    });

    it('should apply multiplier to token bucket capacity', () => {
      const tokenBucketConfig = {
        algorithm: 'token_bucket',
        capacity: 10,
        refillRate: 0.2,
        tierMultipliers: {
          pro: 3
        }
      };

      const result = applyTierMultipliers(tokenBucketConfig, 'pro');
      expect(result.capacity).toBe(30); // 10 * 3
    });

    it('should return original config when no tier multipliers defined', () => {
      const configWithoutMultipliers = {
        algorithm: 'sliding_window',
        limits: {
          per_minute: 10
        }
      };

      const result = applyTierMultipliers(configWithoutMultipliers, 'pro');
      expect(result).toEqual(configWithoutMultipliers);
    });

    it('should floor multiplied values', () => {
      const config = {
        limits: {
          per_minute: 7
        },
        tierMultipliers: {
          pro: 1.5
        }
      };

      const result = applyTierMultipliers(config, 'pro');
      expect(result.limits.per_minute).toBe(10); // Math.floor(7 * 1.5) = 10
    });
  });

  describe('shouldBypassRateLimit', () => {
    it('should bypass for whitelisted IPs', () => {
      const result = shouldBypassRateLimit('user123', 'user', '127.0.0.1', 'auth.login');
      expect(result).toBe(true);
    });

    it('should bypass for IPv6 localhost', () => {
      const result = shouldBypassRateLimit('user123', 'user', '::1', 'auth.login');
      expect(result).toBe(true);
    });

    it('should bypass for demo users', () => {
      const result = shouldBypassRateLimit('demo-user-id', 'user', '192.168.1.1', 'auth.login');
      expect(result).toBe(true);
    });

    it('should bypass admin role for system endpoints', () => {
      // Mock admin bypass endpoints
      const originalRoleOverrides = bypassConfigs.roleOverrides.admin.bypassEndpoints;
      bypassConfigs.roleOverrides.admin.bypassEndpoints = ['system.health', 'system.metrics'];

      const result = shouldBypassRateLimit('admin123', 'admin', '192.168.1.1', 'system.health');
      expect(result).toBe(true);

      // Restore original
      bypassConfigs.roleOverrides.admin.bypassEndpoints = originalRoleOverrides;
    });

    it('should not bypass admin role for non-whitelisted endpoints', () => {
      const result = shouldBypassRateLimit('admin123', 'admin', '192.168.1.1', 'auth.login');
      expect(result).toBe(false);
    });

    it('should not bypass regular users', () => {
      const result = shouldBypassRateLimit('user123', 'user', '192.168.1.1', 'auth.login');
      expect(result).toBe(false);
    });

    it('should not bypass unknown IPs', () => {
      const result = shouldBypassRateLimit('user123', 'user', '10.0.0.1', 'auth.login');
      expect(result).toBe(false);
    });
  });

  describe('getRoleMultiplier', () => {
    it('should return correct multiplier for admin', () => {
      const multiplier = getRoleMultiplier('admin');
      expect(multiplier).toBe(10);
    });

    it('should return correct multiplier for moderator', () => {
      const multiplier = getRoleMultiplier('moderator');
      expect(multiplier).toBe(5);
    });

    it('should return correct multiplier for premium', () => {
      const multiplier = getRoleMultiplier('premium');
      expect(multiplier).toBe(3);
    });

    it('should return 1 for unknown roles', () => {
      const multiplier = getRoleMultiplier('unknown');
      expect(multiplier).toBe(1);
    });

    it('should return 1 for regular user', () => {
      const multiplier = getRoleMultiplier('user');
      expect(multiplier).toBe(1);
    });
  });

  describe('Configuration structure validation', () => {
    it('should have all required auth endpoint configs', () => {
      expect(endpointConfigs.auth).toBeDefined();
      expect(endpointConfigs.auth.login).toBeDefined();
      expect(endpointConfigs.auth.register).toBeDefined();
      expect(endpointConfigs.auth['password-reset']).toBeDefined();
      expect(endpointConfigs.auth.refresh).toBeDefined();
    });

    it('should have all required chat endpoint configs', () => {
      expect(endpointConfigs.chat).toBeDefined();
      expect(endpointConfigs.chat.message).toBeDefined();
      expect(endpointConfigs.chat['new-conversation']).toBeDefined();
      expect(endpointConfigs.chat['delete-conversation']).toBeDefined();
      expect(endpointConfigs.chat['get-conversations']).toBeDefined();
    });

    it('should have all required document endpoint configs', () => {
      expect(endpointConfigs.documents).toBeDefined();
      expect(endpointConfigs.documents.upload).toBeDefined();
      expect(endpointConfigs.documents['bulk-upload']).toBeDefined();
      expect(endpointConfigs.documents.delete).toBeDefined();
      expect(endpointConfigs.documents.search).toBeDefined();
      expect(endpointConfigs.documents['get-list']).toBeDefined();
    });

    it('should have valid algorithms for all configs', () => {
      const validAlgorithms = ['sliding_window', 'token_bucket'];
      
      Object.values(endpointConfigs).forEach(category => {
        Object.values(category).forEach(config => {
          expect(validAlgorithms).toContain(config.algorithm);
        });
      });
    });

    it('should have proper global configurations', () => {
      expect(globalConfigs.api).toBeDefined();
      expect(globalConfigs.uploads).toBeDefined();
      expect(globalConfigs.ai_requests).toBeDefined();
      expect(globalConfigs.database).toBeDefined();
      
      expect(typeof globalConfigs.api.requests_per_second).toBe('number');
      expect(typeof globalConfigs.api.requests_per_minute).toBe('number');
      expect(typeof globalConfigs.api.requests_per_hour).toBe('number');
    });

    it('should have proper bypass configurations', () => {
      expect(Array.isArray(bypassConfigs.whitelistedIPs)).toBe(true);
      expect(bypassConfigs.roleOverrides).toBeDefined();
      expect(bypassConfigs.serviceTokens).toBeDefined();
      
      expect(bypassConfigs.whitelistedIPs).toContain('127.0.0.1');
      expect(bypassConfigs.whitelistedIPs).toContain('::1');
    });
  });

  describe('Tier multipliers in endpoint configs', () => {
    it('should have tier multipliers for chat message endpoint', () => {
      const config = getEndpointConfig('chat', 'message');
      expect(config.tierMultipliers).toBeDefined();
      expect(config.tierMultipliers.free).toBe(1);
      expect(config.tierMultipliers.pro).toBe(3);
      expect(config.tierMultipliers.enterprise).toBe(5);
    });

    it('should have tier multipliers for document upload endpoint', () => {
      const config = getEndpointConfig('documents', 'upload');
      expect(config.tierMultipliers).toBeDefined();
      expect(config.tierMultipliers.free).toBe(1);
      expect(config.tierMultipliers.pro).toBe(3);
      expect(config.tierMultipliers.enterprise).toBe(10);
    });

    it('should have reduced multiplier for free tier bulk uploads', () => {
      const config = getEndpointConfig('documents', 'bulk-upload');
      expect(config.tierMultipliers.free).toBe(0.5); // Reduced for free tier
    });
  });

  describe('Block durations', () => {
    it('should have appropriate block durations for auth endpoints', () => {
      const loginConfig = getEndpointConfig('auth', 'login');
      expect(loginConfig.blockDuration).toBe(900000); // 15 minutes

      const registerConfig = getEndpointConfig('auth', 'register');
      expect(registerConfig.blockDuration).toBe(1800000); // 30 minutes

      const resetConfig = getEndpointConfig('auth', 'password-reset');
      expect(resetConfig.blockDuration).toBe(3600000); // 1 hour
    });
  });

  describe('Message configurations', () => {
    it('should have appropriate error messages', () => {
      const loginConfig = getEndpointConfig('auth', 'login');
      expect(loginConfig.message).toContain('login attempts');

      const uploadConfig = getEndpointConfig('documents', 'upload');
      expect(uploadConfig.message).toContain('upload rate limit');

      const chatConfig = getEndpointConfig('chat', 'message');
      expect(chatConfig.message).toContain('Chat message rate limit');
    });
  });
});