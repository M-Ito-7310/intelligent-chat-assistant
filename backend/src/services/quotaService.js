import pool from '../config/database.js';
import { cacheService } from './cacheService.js';
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
      messages_per_minute: 10,
      messages_per_hour: 100,
      api_calls_per_minute: 20,
      api_calls_per_hour: 500
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
   * Rate limiting check
   */
  async checkRateLimit(userId, operation) {
    if (userId === 'demo-user-id') {
      return { allowed: true, retryAfter: null };
    }

    try {
      const cacheKey = `rate_limit:${userId}:${operation}`;
      const now = Date.now();
      const minute = Math.floor(now / (60 * 1000));
      const hour = Math.floor(now / (60 * 60 * 1000));

      // For now, we'll use a simple in-memory approach
      // In production, you'd want to use Redis for this

      let limit;
      let timeWindow;
      
      switch (operation) {
        case 'message':
          limit = this.rateLimits.messages_per_minute;
          timeWindow = minute;
          break;
        case 'api_call':
          limit = this.rateLimits.api_calls_per_minute;
          timeWindow = minute;
          break;
        default:
          return { allowed: true, retryAfter: null };
      }

      // Simple rate limiting logic
      // In a real implementation, you'd use sliding window or token bucket algorithms
      const requests = await this.getRateLimitCount(userId, operation, timeWindow);
      
      if (requests >= limit) {
        return { 
          allowed: false, 
          retryAfter: 60 - (now % (60 * 1000)) / 1000 // Seconds until next minute
        };
      }

      await this.incrementRateLimitCount(userId, operation, timeWindow);
      return { allowed: true, retryAfter: null };

    } catch (error) {
      logger.error('Rate limit check error:', error);
      return { allowed: true, retryAfter: null };
    }
  }

  /**
   * Get rate limit count (simplified implementation)
   */
  async getRateLimitCount(userId, operation, timeWindow) {
    // This is a simplified implementation
    // In production, use Redis with expiring keys
    return 0;
  }

  /**
   * Increment rate limit count
   */
  async incrementRateLimitCount(userId, operation, timeWindow) {
    // Simplified implementation
    // In production, use Redis INCR with expiration
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