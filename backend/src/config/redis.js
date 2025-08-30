import Redis from 'ioredis';
import logger from '../utils/logger.js';

let redisClient = null;

/**
 * Initialize Redis connection
 */
export const initializeRedis = () => {
  try {
    // Create Redis connection with configuration
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Connection event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    // Test connection
    redisClient.ping().catch(err => {
      logger.warn('Redis ping failed, running in fallback mode:', err.message);
    });

    return redisClient;

  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    return null;
  }
};

/**
 * Get Redis client instance
 */
export const getRedisClient = () => {
  if (!redisClient) {
    return initializeRedis();
  }
  return redisClient;
};

/**
 * Check if Redis is available
 */
export const isRedisAvailable = async () => {
  try {
    if (!redisClient) return false;
    await redisClient.ping();
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Close Redis connection
 */
export const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
    redisClient = null;
  }
};

/**
 * Redis key helpers
 */
export const redisKeys = {
  // Rate limiting keys
  rateLimit: (userId, operation, timeWindow) => `rl:${userId}:${operation}:${timeWindow}`,
  rateLimitGlobal: (operation, timeWindow) => `rl:global:${operation}:${timeWindow}`,
  
  // Quota keys
  quota: (userId, operation, period) => `quota:${userId}:${operation}:${period}`,
  
  // Session keys
  session: (sessionId) => `session:${sessionId}`,
  
  // Cache keys
  cache: (key) => `cache:${key}`,
};

export default redisClient;