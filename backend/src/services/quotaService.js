import pool from '../config/database.js';
import { cacheService } from './cacheService.js';
import { redisRateLimitService } from './redisRateLimitService.js';
import logger from '../utils/logger.js';

/**
 * Quota and Rate Limiting Service
 * Manages user usage limits and rate limiting
 */
class QuotaService {
  constructor() {
    this.quotaLimits = {
      free: {
        daily_messages: 50,
        daily_tokens: 100000,
        monthly_messages: 1000,
        monthly_tokens: 2000000,
        concurrent_requests: 2,
        document_uploads: 10
      },
      pro: {
        daily_messages: 500,
        daily_tokens: 1000000,
        monthly_messages: 15000,
        monthly_tokens: 30000000,
        concurrent_requests: 5,
        document_uploads: 100
      },
      enterprise: {
        daily_messages: -1, // unlimited
        daily_tokens: -1,
        monthly_messages: -1,
        monthly_tokens: -1,
        concurrent_requests: 10,
        document_uploads: -1
      }
    };

    this.rateLimits = {
      // Per-user rate limits
      user: {
        messages_per_minute: 10,
        messages_per_hour: 100,
        api_calls_per_minute: 20,
        api_calls_per_hour: 500,
        document_uploads_per_hour: 5,
        search_requests_per_minute: 15
      },
      
      // Global rate limits (across all users)
      global: {
        messages_per_second: 50,
        api_calls_per_second: 100,
        heavy_operations_per_minute: 10
      },
      
      // Rate limit configurations for different algorithms
      algorithms: {
        sliding_window: {
          window_sizes: {
            minute: 60 * 1000,
            hour: 60 * 60 * 1000,
            day: 24 * 60 * 60 * 1000
          }
        },
        token_bucket: {
          message: { capacity: 10, refillRate: 0.2 }, // 10 tokens, 0.2 per second
          api_call: { capacity: 20, refillRate: 0.5 }, // 20 tokens, 0.5 per second
          heavy_operation: { capacity: 3, refillRate: 0.05 } // 3 tokens, 0.05 per second
        }
      }
    };
  }

  /**
   * Get user's current quota tier
   */
  async getUserTier(userId) {
    if (userId === 'demo-user-id') {
      return 'demo';
    }

    try {
      const client = await pool.connect();
      try {
        const query = 'SELECT subscription_tier FROM users WHERE id = $1';
        const result = await client.query(query, [userId]);
        
        return result.rows[0]?.subscription_tier || 'free';
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Get user tier error:', error);
      return 'free'; // Default fallback
    }
  }

  /**
   * Get usage limits for user tier
   */
  getQuotaLimits(tier) {
    return this.quotaLimits[tier] || this.quotaLimits.free;
  }

  /**
   * Check if user has quota for operation
   */
  async checkQuota(userId, operation, amount = 1) {
    if (userId === 'demo-user-id') {
      return { allowed: true, remaining: 999, resetTime: null };
    }

    try {
      const tier = await this.getUserTier(userId);
      const limits = this.getQuotaLimits(tier);

      // Get current usage
      const usage = await this.getCurrentUsage(userId);
      
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().substring(0, 7);

      let allowed = true;
      let remaining = null;
      let resetTime = null;

      switch (operation) {
        case 'message':
          // Check daily limit
          const dailyMessages = usage.daily_messages?.[today] || 0;
          if (limits.daily_messages !== -1 && dailyMessages + amount > limits.daily_messages) {
            allowed = false;
            remaining = Math.max(0, limits.daily_messages - dailyMessages);
            resetTime = new Date().setHours(24, 0, 0, 0); // Next midnight
          }

          // Check monthly limit
          const monthlyMessages = usage.monthly_messages?.[currentMonth] || 0;
          if (allowed && limits.monthly_messages !== -1 && monthlyMessages + amount > limits.monthly_messages) {
            allowed = false;
            remaining = Math.max(0, limits.monthly_messages - monthlyMessages);
            resetTime = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
          }

          if (allowed) {
            remaining = limits.daily_messages === -1 ? -1 : Math.max(0, limits.daily_messages - dailyMessages);
          }
          break;

        case 'tokens':
          // Check daily token limit
          const dailyTokens = usage.daily_tokens?.[today] || 0;
          if (limits.daily_tokens !== -1 && dailyTokens + amount > limits.daily_tokens) {
            allowed = false;
            remaining = Math.max(0, limits.daily_tokens - dailyTokens);
            resetTime = new Date().setHours(24, 0, 0, 0);
          }

          // Check monthly token limit
          const monthlyTokens = usage.monthly_tokens?.[currentMonth] || 0;
          if (allowed && limits.monthly_tokens !== -1 && monthlyTokens + amount > limits.monthly_tokens) {
            allowed = false;
            remaining = Math.max(0, limits.monthly_tokens - monthlyTokens);
            resetTime = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
          }

          if (allowed) {
            remaining = limits.daily_tokens === -1 ? -1 : Math.max(0, limits.daily_tokens - dailyTokens);
          }
          break;

        case 'document_upload':
          const documentsUploaded = usage.documents_uploaded || 0;
          if (limits.document_uploads !== -1 && documentsUploaded + amount > limits.document_uploads) {
            allowed = false;
            remaining = Math.max(0, limits.document_uploads - documentsUploaded);
          } else {
            remaining = limits.document_uploads === -1 ? -1 : Math.max(0, limits.document_uploads - documentsUploaded);
          }
          break;
      }

      return { allowed, remaining, resetTime, tier };

    } catch (error) {
      logger.error('Check quota error:', error);
      // Allow operation in case of error to prevent service disruption
      return { allowed: true, remaining: 0, resetTime: null, error: error.message };
    }
  }

  /**
   * Record usage for tracking quotas
   */
  async recordUsage(userId, operation, amount = 1, metadata = {}) {
    if (userId === 'demo-user-id') {
      return; // Skip recording for demo users
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().substring(0, 7);

      const client = await pool.connect();
      try {
        // Get or create usage record
        let usageQuery = `
          INSERT INTO user_usage (user_id, date, month)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, date) DO NOTHING
          RETURNING *
        `;
        
        await client.query(usageQuery, [userId, today, currentMonth]);

        // Update usage counters
        switch (operation) {
          case 'message':
            await client.query(`
              UPDATE user_usage 
              SET daily_messages = daily_messages + $3,
                  monthly_messages = monthly_messages + $3,
                  updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND date = $2
            `, [userId, today, amount]);
            break;

          case 'tokens':
            await client.query(`
              UPDATE user_usage 
              SET daily_tokens = daily_tokens + $3,
                  monthly_tokens = monthly_tokens + $3,
                  updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND date = $2
            `, [userId, today, amount]);
            break;

          case 'document_upload':
            await client.query(`
              UPDATE user_usage 
              SET documents_uploaded = documents_uploaded + $3,
                  updated_at = CURRENT_TIMESTAMP
              WHERE user_id = $1 AND date = $2
            `, [userId, today, amount]);
            break;
        }

        // Invalidate cache
        await cacheService.invalidateUserConversations(userId);

      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Record usage error:', error);
    }
  }

  /**
   * Get current usage for user
   */
  async getCurrentUsage(userId) {
    try {
      const client = await pool.connect();
      try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().substring(0, 7);

        // Get daily usage
        const dailyQuery = `
          SELECT daily_messages, daily_tokens, documents_uploaded
          FROM user_usage 
          WHERE user_id = $1 AND date = $2
        `;
        const dailyResult = await client.query(dailyQuery, [userId, today]);

        // Get monthly usage  
        const monthlyQuery = `
          SELECT SUM(daily_messages) as monthly_messages, 
                 SUM(daily_tokens) as monthly_tokens
          FROM user_usage 
          WHERE user_id = $1 AND month = $2
        `;
        const monthlyResult = await client.query(monthlyQuery, [userId, currentMonth]);

        return {
          daily_messages: { [today]: dailyResult.rows[0]?.daily_messages || 0 },
          daily_tokens: { [today]: dailyResult.rows[0]?.daily_tokens || 0 },
          monthly_messages: { [currentMonth]: parseInt(monthlyResult.rows[0]?.monthly_messages) || 0 },
          monthly_tokens: { [currentMonth]: parseInt(monthlyResult.rows[0]?.monthly_tokens) || 0 },
          documents_uploaded: dailyResult.rows[0]?.documents_uploaded || 0
        };

      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Get current usage error:', error);
      return {};
    }
  }

  /**
   * Enhanced rate limiting check with multiple algorithms
   */
  async checkRateLimit(userId, operation, algorithm = 'sliding_window') {
    if (userId === 'demo-user-id') {
      return { allowed: true, retryAfter: null, remaining: 999 };
    }

    try {
      const tier = await this.getUserTier(userId);
      const rateLimits = this.getRateLimits(tier, operation);
      
      if (!rateLimits) {
        return { allowed: true, retryAfter: null, remaining: null };
      }

      // Check global limits first
      await this.checkGlobalRateLimit(operation);

      let result;
      switch (algorithm) {
        case 'token_bucket':
          result = await this.checkTokenBucketRateLimit(userId, operation, rateLimits);
          break;
        case 'sliding_window':
        default:
          result = await this.checkSlidingWindowRateLimit(userId, operation, rateLimits);
          break;
      }

      if (!result.allowed) {
        logger.warn(`Rate limit exceeded for user ${userId}, operation: ${operation}`, {
          userId,
          operation,
          algorithm,
          limit: rateLimits,
          current: result.count || result.tokens
        });
      }

      return result;

    } catch (error) {
      logger.error('Rate limit check error:', error);
      return { allowed: true, retryAfter: null, remaining: null, error: error.message };
    }
  }

  /**
   * Check sliding window rate limits
   */
  async checkSlidingWindowRateLimit(userId, operation, rateLimits) {
    const checks = [];
    
    // Check per-minute limits
    if (rateLimits.per_minute) {
      checks.push(
        redisRateLimitService.checkSlidingWindow(
          userId, 
          `${operation}_minute`, 
          rateLimits.per_minute,
          this.rateLimits.algorithms.sliding_window.window_sizes.minute
        )
      );
    }

    // Check per-hour limits
    if (rateLimits.per_hour) {
      checks.push(
        redisRateLimitService.checkSlidingWindow(
          userId,
          `${operation}_hour`,
          rateLimits.per_hour,
          this.rateLimits.algorithms.sliding_window.window_sizes.hour
        )
      );
    }

    const results = await Promise.all(checks);
    
    // If any limit is exceeded, deny the request
    for (const result of results) {
      if (!result.allowed) {
        return {
          allowed: false,
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
          remaining: result.remaining,
          resetTime: result.resetTime
        };
      }
    }

    // Return the most restrictive remaining count
    const minRemaining = Math.min(...results.map(r => r.remaining));
    return {
      allowed: true,
      retryAfter: null,
      remaining: minRemaining
    };
  }

  /**
   * Check token bucket rate limits
   */
  async checkTokenBucketRateLimit(userId, operation, rateLimits) {
    const config = this.rateLimits.algorithms.token_bucket[operation];
    if (!config) {
      return { allowed: true, retryAfter: null, remaining: null };
    }

    const result = await redisRateLimitService.checkTokenBucket(
      userId,
      operation,
      config.capacity,
      config.refillRate,
      1 // consume 1 token
    );

    return {
      allowed: result.allowed,
      retryAfter: result.allowed ? null : Math.ceil((result.refillTime - Date.now()) / 1000),
      remaining: result.tokens,
      capacity: result.capacity
    };
  }

  /**
   * Check global rate limits
   */
  async checkGlobalRateLimit(operation) {
    const globalLimits = this.rateLimits.global;
    
    if (globalLimits.messages_per_second && operation === 'message') {
      const result = await redisRateLimitService.checkGlobalLimit(
        'message',
        globalLimits.messages_per_second,
        1000 // 1 second
      );
      
      if (!result.allowed) {
        throw new Error('Global message rate limit exceeded');
      }
    }

    if (globalLimits.api_calls_per_second && operation === 'api_call') {
      const result = await redisRateLimitService.checkGlobalLimit(
        'api_call',
        globalLimits.api_calls_per_second,
        1000 // 1 second
      );
      
      if (!result.allowed) {
        throw new Error('Global API rate limit exceeded');
      }
    }
  }

  /**
   * Get rate limits for user tier and operation
   */
  getRateLimits(tier, operation) {
    const baseLimits = this.rateLimits.user;
    
    // Tier multipliers
    const multipliers = {
      free: 1,
      pro: 5,
      enterprise: 10
    };
    
    const multiplier = multipliers[tier] || 1;
    
    switch (operation) {
      case 'message':
        return {
          per_minute: Math.floor(baseLimits.messages_per_minute * multiplier),
          per_hour: Math.floor(baseLimits.messages_per_hour * multiplier)
        };
      case 'api_call':
        return {
          per_minute: Math.floor(baseLimits.api_calls_per_minute * multiplier),
          per_hour: Math.floor(baseLimits.api_calls_per_hour * multiplier)
        };
      case 'document_upload':
        return {
          per_hour: Math.floor(baseLimits.document_uploads_per_hour * multiplier)
        };
      case 'search_request':
        return {
          per_minute: Math.floor(baseLimits.search_requests_per_minute * multiplier)
        };
      default:
        return null;
    }
  }

  /**
   * Get current rate limit status for user
   */
  async getRateLimitStatus(userId, operation) {
    if (userId === 'demo-user-id') {
      return {
        status: 'unlimited',
        remaining: 999,
        resetTime: null
      };
    }

    try {
      return await redisRateLimitService.getRateLimitStatus(userId, operation);
    } catch (error) {
      logger.error('Get rate limit status error:', error);
      return null;
    }
  }

  /**
   * Reset rate limits for user
   */
  async resetUserRateLimit(userId, operation = null) {
    if (userId === 'demo-user-id') {
      return true;
    }

    try {
      if (operation) {
        return await redisRateLimitService.resetRateLimit(userId, operation);
      } else {
        // Reset all rate limits for user
        const operations = ['message', 'api_call', 'document_upload', 'search_request'];
        const results = await Promise.all(
          operations.map(op => redisRateLimitService.resetRateLimit(userId, op))
        );
        return results.every(result => result);
      }
    } catch (error) {
      logger.error('Reset rate limit error:', error);
      return false;
    }
  }

  /**
   * Get comprehensive rate limit metrics
   */
  async getRateLimitMetrics(userId) {
    if (userId === 'demo-user-id') {
      return {
        user: 'demo',
        operations: {
          message: { current: 5, limit: 999, remaining: 994 },
          api_call: { current: 2, limit: 999, remaining: 997 }
        }
      };
    }

    try {
      const tier = await this.getUserTier(userId);
      const operations = ['message', 'api_call', 'document_upload', 'search_request'];
      const metrics = {};

      for (const operation of operations) {
        const limits = this.getRateLimits(tier, operation);
        const status = await this.getRateLimitStatus(userId, operation);
        
        if (limits && status) {
          metrics[operation] = {
            limits,
            current: status.minute?.count || 0,
            remaining: limits.per_minute - (status.minute?.count || 0),
            resetTime: status.minute?.resetTime
          };
        }
      }

      return {
        user: userId,
        tier,
        operations: metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Get rate limit metrics error:', error);
      return null;
    }
  }

  /**
   * Get usage statistics for user
   */
  async getUsageStats(userId) {
    if (userId === 'demo-user-id') {
      return {
        tier: 'demo',
        current_usage: {
          daily_messages: 5,
          daily_tokens: 1000,
          monthly_messages: 50,
          monthly_tokens: 10000
        },
        limits: this.quotaLimits.free,
        percentage_used: {
          daily_messages: 10,
          monthly_messages: 5
        }
      };
    }

    try {
      const tier = await this.getUserTier(userId);
      const limits = this.getQuotaLimits(tier);
      const usage = await this.getCurrentUsage(userId);

      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().substring(0, 7);

      const current_usage = {
        daily_messages: usage.daily_messages?.[today] || 0,
        daily_tokens: usage.daily_tokens?.[today] || 0,
        monthly_messages: usage.monthly_messages?.[currentMonth] || 0,
        monthly_tokens: usage.monthly_tokens?.[currentMonth] || 0,
        documents_uploaded: usage.documents_uploaded || 0
      };

      const percentage_used = {
        daily_messages: limits.daily_messages === -1 ? 0 : 
          Math.round((current_usage.daily_messages / limits.daily_messages) * 100),
        daily_tokens: limits.daily_tokens === -1 ? 0 : 
          Math.round((current_usage.daily_tokens / limits.daily_tokens) * 100),
        monthly_messages: limits.monthly_messages === -1 ? 0 : 
          Math.round((current_usage.monthly_messages / limits.monthly_messages) * 100),
        monthly_tokens: limits.monthly_tokens === -1 ? 0 : 
          Math.round((current_usage.monthly_tokens / limits.monthly_tokens) * 100)
      };

      return {
        tier,
        current_usage,
        limits,
        percentage_used
      };

    } catch (error) {
      logger.error('Get usage stats error:', error);
      throw error;
    }
  }

  /**
   * Initialize usage tracking table
   */
  async initializeTables() {
    try {
      const client = await pool.connect();
      try {
        // Create user_usage table
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_usage (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            month VARCHAR(7) NOT NULL,
            daily_messages INTEGER DEFAULT 0,
            daily_tokens INTEGER DEFAULT 0,
            monthly_messages INTEGER DEFAULT 0,
            monthly_tokens INTEGER DEFAULT 0,
            documents_uploaded INTEGER DEFAULT 0,
            api_calls INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
          )
        `);

        // Add subscription_tier column to users table if it doesn't exist
        await client.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'
        `);

        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_usage_user_date ON user_usage(user_id, date)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_user_usage_month ON user_usage(user_id, month)');

        logger.info('Quota service tables initialized');

      } finally {
        client.release();
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        logger.info('Database unavailable in development mode, quota service running in demo mode');
      } else {
        logger.error('Initialize quota tables error:', error);
      }
    }
  }
}

// Singleton instance
export const quotaService = new QuotaService();

// Initialize tables on startup
quotaService.initializeTables();