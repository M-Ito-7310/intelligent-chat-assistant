import Redis from 'ioredis';
import logger from '../utils/logger.js';

/**
 * Cache Service for AI responses and conversation data
 * Implements Redis-based caching with TTL management
 */
class CacheService {
  constructor() {
    this.redis = null;
    this.isEnabled = false;
    this.defaultTTL = 60 * 60; // 1 hour in seconds
    
    this.initialize();
  }

  async initialize() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
      
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableReadyCheck: false,
        connectTimeout: 1000,
        commandTimeout: 1000
      });

      this.redis.on('connect', () => {
        this.isEnabled = true;
        logger.info('Cache service connected to Redis');
      });

      this.redis.on('error', (error) => {
        this.isEnabled = false;
        // Suppress repeated Redis errors in demo mode
        if (!error.message.includes('ECONNREFUSED')) {
          logger.warn('Cache service Redis error:', error.message);
        }
      });

      // Test connection with timeout
      const pingPromise = this.redis.ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 1000)
      );
      
      await Promise.race([pingPromise, timeoutPromise]);
      this.isEnabled = true;

    } catch (error) {
      this.isEnabled = false;
      if (process.env.NODE_ENV === 'development') {
        logger.info('Cache service unavailable in development mode, continuing without caching');
      } else {
        logger.warn('Cache service unavailable, continuing without caching:', error.message);
      }
    }
  }

  /**
   * Generate cache key for AI responses
   */
  generateResponseKey(messages, options = {}) {
    const { provider = 'default', model = 'default', enableRAG = false } = options;
    const messageHash = this.hashMessages(messages);
    return `ai_response:${provider}:${model}:${enableRAG}:${messageHash}`;
  }

  /**
   * Generate cache key for conversations
   */
  generateConversationKey(userId, conversationId) {
    return `conversation:${userId}:${conversationId}`;
  }

  /**
   * Generate cache key for user conversations list
   */
  generateUserConversationsKey(userId, options = {}) {
    const { limit = 20, offset = 0, archived = false } = options;
    return `user_conversations:${userId}:${limit}:${offset}:${archived}`;
  }

  /**
   * Hash messages array for consistent caching
   */
  hashMessages(messages) {
    const content = messages.map(msg => `${msg.role}:${msg.content}`).join('|');
    return Buffer.from(content).toString('base64').substring(0, 32);
  }

  /**
   * Get cached AI response
   */
  async getCachedResponse(messages, options = {}) {
    if (!this.isEnabled) return null;

    try {
      const key = this.generateResponseKey(messages, options);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.info(`Cache hit for AI response: ${key.substring(0, 32)}...`);
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.warn('Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Cache AI response
   */
  async cacheResponse(messages, response, options = {}) {
    if (!this.isEnabled) return;

    try {
      const key = this.generateResponseKey(messages, options);
      const ttl = options.cacheTTL || this.defaultTTL;
      
      await this.redis.setex(key, ttl, JSON.stringify({
        content: response.content,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        cached_at: new Date().toISOString()
      }));
      
      logger.info(`Cached AI response: ${key.substring(0, 32)}... (TTL: ${ttl}s)`);
    } catch (error) {
      logger.warn('Cache set error:', error.message);
    }
  }

  /**
   * Get cached conversation
   */
  async getCachedConversation(userId, conversationId) {
    if (!this.isEnabled) return null;

    try {
      const key = this.generateConversationKey(userId, conversationId);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.info(`Cache hit for conversation: ${conversationId}`);
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.warn('Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Cache conversation data
   */
  async cacheConversation(userId, conversationId, data, ttl = 300) {
    if (!this.isEnabled) return;

    try {
      const key = this.generateConversationKey(userId, conversationId);
      await this.redis.setex(key, ttl, JSON.stringify(data));
      
      logger.info(`Cached conversation: ${conversationId} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.warn('Cache set error:', error.message);
    }
  }

  /**
   * Get cached user conversations list
   */
  async getCachedUserConversations(userId, options = {}) {
    if (!this.isEnabled) return null;

    try {
      const key = this.generateUserConversationsKey(userId, options);
      const cached = await this.redis.get(key);
      
      if (cached) {
        logger.info(`Cache hit for user conversations: ${userId}`);
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.warn('Cache get error:', error.message);
      return null;
    }
  }

  /**
   * Cache user conversations list
   */
  async cacheUserConversations(userId, data, options = {}, ttl = 180) {
    if (!this.isEnabled) return;

    try {
      const key = this.generateUserConversationsKey(userId, options);
      await this.redis.setex(key, ttl, JSON.stringify(data));
      
      logger.info(`Cached user conversations: ${userId} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.warn('Cache set error:', error.message);
    }
  }

  /**
   * Invalidate cache for user conversations
   */
  async invalidateUserConversations(userId) {
    if (!this.isEnabled) return;

    try {
      const pattern = `user_conversations:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} conversation cache entries for user: ${userId}`);
      }
    } catch (error) {
      logger.warn('Cache invalidation error:', error.message);
    }
  }

  /**
   * Invalidate specific conversation cache
   */
  async invalidateConversation(userId, conversationId) {
    if (!this.isEnabled) return;

    try {
      const key = this.generateConversationKey(userId, conversationId);
      await this.redis.del(key);
      
      // Also invalidate user conversations list
      await this.invalidateUserConversations(userId);
      
      logger.info(`Invalidated conversation cache: ${conversationId}`);
    } catch (error) {
      logger.warn('Cache invalidation error:', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isEnabled) {
      return { enabled: false, message: 'Cache service unavailable' };
    }

    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        enabled: true,
        memory_usage: this.parseRedisInfo(info, 'used_memory_human'),
        total_keys: this.parseRedisInfo(keyspace, 'keys') || 0,
        hit_rate: 'Available via Redis MONITOR command'
      };
    } catch (error) {
      logger.warn('Cache stats error:', error.message);
      return { enabled: false, error: error.message };
    }
  }

  /**
   * Parse Redis INFO command output
   */
  parseRedisInfo(info, field) {
    const lines = info.split('\n');
    for (const line of lines) {
      if (line.startsWith(field)) {
        return line.split(':')[1]?.trim();
      }
    }
    return null;
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    if (!this.isEnabled) return false;

    try {
      await this.redis.flushdb();
      logger.info('Cache cleared successfully');
      return true;
    } catch (error) {
      logger.warn('Cache clear error:', error.message);
      return false;
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();