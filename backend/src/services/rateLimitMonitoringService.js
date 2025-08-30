import { getRedisClient, isRedisAvailable, redisKeys } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Rate Limit Monitoring and Analytics Service
 * Provides comprehensive monitoring, alerting, and analytics for rate limiting
 */
class RateLimitMonitoringService {
  constructor() {
    this.metricsBuffer = new Map(); // Buffer for offline metrics
    this.alertThresholds = {
      high_usage: 0.8, // 80% of limit
      critical_usage: 0.95, // 95% of limit
      global_limit_hit: 5, // 5 global limits hit in 5 minutes
      user_blocked: 3, // 3 users blocked in 10 minutes
      error_rate: 0.1 // 10% error rate in rate limiting
    };
    this.alertCooldown = new Map(); // Prevent spam alerts
  }

  /**
   * Record rate limit metrics
   * @param {Object} metrics - Rate limit metrics data
   */
  async recordMetrics(metrics) {
    const {
      userId,
      endpoint,
      allowed,
      remaining,
      limit,
      algorithm,
      responseTime,
      clientIP,
      userAgent,
      tier
    } = metrics;

    try {
      const timestamp = Date.now();
      const redis = getRedisClient();

      if (await isRedisAvailable()) {
        // Store detailed metrics in Redis
        const pipeline = redis.pipeline();
        
        // Endpoint-specific metrics
        const endpointKey = `metrics:endpoint:${endpoint}:${Math.floor(timestamp / 60000)}`; // Per minute
        pipeline.hincrby(endpointKey, 'total_requests', 1);
        pipeline.hincrby(endpointKey, allowed ? 'allowed' : 'blocked', 1);
        pipeline.hincrbyfloat(endpointKey, 'avg_response_time', responseTime);
        pipeline.expire(endpointKey, 7200); // 2 hours retention

        // User-specific metrics
        if (userId && userId !== 'demo-user-id') {
          const userKey = `metrics:user:${userId}:${Math.floor(timestamp / 3600000)}`; // Per hour
          pipeline.hincrby(userKey, 'total_requests', 1);
          pipeline.hincrby(userKey, allowed ? 'allowed' : 'blocked', 1);
          pipeline.hset(userKey, 'last_seen', timestamp);
          pipeline.hset(userKey, 'tier', tier);
          pipeline.expire(userKey, 86400); // 24 hours retention
        }

        // IP-specific metrics (for anonymous users or additional tracking)
        const ipKey = `metrics:ip:${clientIP}:${Math.floor(timestamp / 900000)}`; // Per 15 minutes
        pipeline.hincrby(ipKey, 'total_requests', 1);
        pipeline.hincrby(ipKey, allowed ? 'allowed' : 'blocked', 1);
        pipeline.expire(ipKey, 3600); // 1 hour retention

        // Algorithm performance metrics
        const algoKey = `metrics:algorithm:${algorithm}:${Math.floor(timestamp / 300000)}`; // Per 5 minutes
        pipeline.hincrby(algoKey, 'total_requests', 1);
        pipeline.hincrbyfloat(algoKey, 'avg_response_time', responseTime);
        pipeline.expire(algoKey, 1800); // 30 minutes retention

        // Global system metrics
        const globalKey = `metrics:global:${Math.floor(timestamp / 60000)}`; // Per minute
        pipeline.hincrby(globalKey, 'total_requests', 1);
        pipeline.hincrby(globalKey, allowed ? 'allowed' : 'blocked', 1);
        pipeline.expire(globalKey, 3600); // 1 hour retention

        await pipeline.exec();

        // Check for alerts
        await this.checkAlerts({
          endpoint,
          userId,
          clientIP,
          allowed,
          remaining,
          limit,
          timestamp
        });

      } else {
        // Fallback to in-memory buffer
        this.bufferMetrics(metrics);
      }

    } catch (error) {
      logger.error('Error recording rate limit metrics:', error);
      this.bufferMetrics(metrics); // Fallback to buffer
    }
  }

  /**
   * Buffer metrics in memory when Redis is unavailable
   */
  bufferMetrics(metrics) {
    const key = `${metrics.endpoint}_${Math.floor(Date.now() / 60000)}`;
    if (!this.metricsBuffer.has(key)) {
      this.metricsBuffer.set(key, {
        endpoint: metrics.endpoint,
        total: 0,
        allowed: 0,
        blocked: 0,
        responseTimeSum: 0,
        timestamp: Date.now()
      });
    }

    const entry = this.metricsBuffer.get(key);
    entry.total++;
    entry[metrics.allowed ? 'allowed' : 'blocked']++;
    entry.responseTimeSum += metrics.responseTime || 0;

    // Clean old entries
    this.cleanupBuffer();
  }

  /**
   * Clean up old buffered metrics
   */
  cleanupBuffer() {
    const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour ago
    for (const [key, entry] of this.metricsBuffer) {
      if (entry.timestamp < cutoff) {
        this.metricsBuffer.delete(key);
      }
    }
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts(data) {
    try {
      const { endpoint, userId, clientIP, allowed, remaining, limit, timestamp } = data;

      // High usage alert
      if (allowed && remaining !== undefined && limit) {
        const usageRatio = (limit - remaining) / limit;
        if (usageRatio >= this.alertThresholds.high_usage) {
          await this.sendAlert('HIGH_USAGE', {
            endpoint,
            userId,
            usageRatio,
            remaining,
            limit,
            severity: usageRatio >= this.alertThresholds.critical_usage ? 'critical' : 'warning'
          });
        }
      }

      // User blocked alert
      if (!allowed && userId && userId !== 'demo-user-id') {
        await this.sendAlert('USER_RATE_LIMITED', {
          endpoint,
          userId,
          clientIP,
          timestamp,
          severity: 'warning'
        });
      }

      // Check for global rate limit issues
      await this.checkGlobalAlerts();

    } catch (error) {
      logger.error('Error checking rate limit alerts:', error);
    }
  }

  /**
   * Check for global rate limiting issues
   */
  async checkGlobalAlerts() {
    try {
      const redis = getRedisClient();
      if (!(await isRedisAvailable())) return;

      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      
      // Check global rate limit hits in last 5 minutes
      const globalKey = `metrics:global:*`;
      const keys = await redis.keys(globalKey);
      
      let totalBlocked = 0;
      for (const key of keys) {
        const keyTime = parseInt(key.split(':').pop()) * 60000;
        if (keyTime >= fiveMinutesAgo) {
          const blocked = await redis.hget(key, 'blocked');
          totalBlocked += parseInt(blocked) || 0;
        }
      }

      if (totalBlocked >= this.alertThresholds.global_limit_hit) {
        await this.sendAlert('GLOBAL_RATE_LIMITS', {
          blockedCount: totalBlocked,
          timeWindow: '5 minutes',
          severity: 'critical'
        });
      }

    } catch (error) {
      logger.error('Error checking global alerts:', error);
    }
  }

  /**
   * Send alert (with cooldown to prevent spam)
   */
  async sendAlert(type, data) {
    const alertKey = `${type}_${data.endpoint || 'global'}_${data.userId || 'system'}`;
    const now = Date.now();
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes

    // Check cooldown
    if (this.alertCooldown.has(alertKey)) {
      const lastAlert = this.alertCooldown.get(alertKey);
      if (now - lastAlert < cooldownPeriod) {
        return; // Skip alert due to cooldown
      }
    }

    // Update cooldown
    this.alertCooldown.set(alertKey, now);

    // Log alert (in production, this would also send to monitoring systems)
    const alertData = {
      type,
      timestamp: new Date().toISOString(),
      ...data
    };

    logger.warn(`Rate Limit Alert: ${type}`, alertData);

    // In production, you would also:
    // - Send to monitoring systems (DataDog, New Relic, etc.)
    // - Send notifications (Slack, PagerDuty, email)
    // - Update dashboards
    // - Trigger automated responses if configured
  }

  /**
   * Get comprehensive rate limiting analytics
   */
  async getAnalytics(timeRange = '1h') {
    try {
      const redis = getRedisClient();
      if (!(await isRedisAvailable())) {
        return this.getBufferedAnalytics();
      }

      const now = Date.now();
      const timeRanges = {
        '5m': 5 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000
      };

      const range = timeRanges[timeRange] || timeRanges['1h'];
      const startTime = now - range;

      // Get endpoint metrics
      const endpointMetrics = await this.getEndpointMetrics(startTime, now);
      
      // Get user metrics
      const userMetrics = await this.getUserMetrics(startTime, now);
      
      // Get system metrics
      const systemMetrics = await this.getSystemMetrics(startTime, now);
      
      // Get algorithm performance
      const algorithmMetrics = await this.getAlgorithmMetrics(startTime, now);

      return {
        timeRange,
        period: { start: startTime, end: now },
        endpoints: endpointMetrics,
        users: userMetrics,
        system: systemMetrics,
        algorithms: algorithmMetrics,
        generated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting rate limit analytics:', error);
      return null;
    }
  }

  /**
   * Get endpoint-specific metrics
   */
  async getEndpointMetrics(startTime, endTime) {
    const redis = getRedisClient();
    const metrics = {};

    try {
      const keys = await redis.keys('metrics:endpoint:*');
      
      for (const key of keys) {
        const keyTime = parseInt(key.split(':').pop()) * 60000;
        if (keyTime >= startTime && keyTime <= endTime) {
          const endpoint = key.split(':')[2];
          const data = await redis.hgetall(key);
          
          if (!metrics[endpoint]) {
            metrics[endpoint] = {
              total_requests: 0,
              allowed: 0,
              blocked: 0,
              avg_response_time: 0,
              block_rate: 0
            };
          }
          
          metrics[endpoint].total_requests += parseInt(data.total_requests) || 0;
          metrics[endpoint].allowed += parseInt(data.allowed) || 0;
          metrics[endpoint].blocked += parseInt(data.blocked) || 0;
          metrics[endpoint].avg_response_time += parseFloat(data.avg_response_time) || 0;
        }
      }

      // Calculate block rates
      for (const endpoint in metrics) {
        const total = metrics[endpoint].total_requests;
        metrics[endpoint].block_rate = total > 0 ? (metrics[endpoint].blocked / total * 100).toFixed(2) + '%' : '0%';
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting endpoint metrics:', error);
      return {};
    }
  }

  /**
   * Get user-specific metrics
   */
  async getUserMetrics(startTime, endTime) {
    const redis = getRedisClient();
    const metrics = {
      total_active_users: 0,
      users_blocked: 0,
      tier_distribution: { free: 0, pro: 0, enterprise: 0 },
      top_users: []
    };

    try {
      const keys = await redis.keys('metrics:user:*');
      
      for (const key of keys) {
        const keyTime = parseInt(key.split(':').pop()) * 3600000;
        if (keyTime >= startTime && keyTime <= endTime) {
          const data = await redis.hgetall(key);
          
          metrics.total_active_users++;
          
          if (parseInt(data.blocked) > 0) {
            metrics.users_blocked++;
          }
          
          const tier = data.tier || 'free';
          if (metrics.tier_distribution[tier] !== undefined) {
            metrics.tier_distribution[tier]++;
          }
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting user metrics:', error);
      return metrics;
    }
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(startTime, endTime) {
    const redis = getRedisClient();
    const metrics = {
      total_requests: 0,
      total_blocked: 0,
      system_block_rate: 0,
      peak_rps: 0,
      avg_rps: 0
    };

    try {
      const keys = await redis.keys('metrics:global:*');
      let totalMinutes = 0;
      
      for (const key of keys) {
        const keyTime = parseInt(key.split(':').pop()) * 60000;
        if (keyTime >= startTime && keyTime <= endTime) {
          const data = await redis.hgetall(key);
          
          const requests = parseInt(data.total_requests) || 0;
          const blocked = parseInt(data.blocked) || 0;
          
          metrics.total_requests += requests;
          metrics.total_blocked += blocked;
          
          // Calculate RPS for this minute
          const rps = requests / 60;
          if (rps > metrics.peak_rps) {
            metrics.peak_rps = rps;
          }
          
          totalMinutes++;
        }
      }

      // Calculate system block rate
      metrics.system_block_rate = metrics.total_requests > 0 ? 
        ((metrics.total_blocked / metrics.total_requests) * 100).toFixed(2) + '%' : '0%';
      
      // Calculate average RPS
      metrics.avg_rps = totalMinutes > 0 ? 
        (metrics.total_requests / (totalMinutes * 60)).toFixed(2) : 0;

      return metrics;
    } catch (error) {
      logger.error('Error getting system metrics:', error);
      return metrics;
    }
  }

  /**
   * Get algorithm performance metrics
   */
  async getAlgorithmMetrics(startTime, endTime) {
    const redis = getRedisClient();
    const metrics = {};

    try {
      const keys = await redis.keys('metrics:algorithm:*');
      
      for (const key of keys) {
        const keyTime = parseInt(key.split(':').pop()) * 300000; // 5-minute intervals
        if (keyTime >= startTime && keyTime <= endTime) {
          const algorithm = key.split(':')[2];
          const data = await redis.hgetall(key);
          
          if (!metrics[algorithm]) {
            metrics[algorithm] = {
              total_requests: 0,
              avg_response_time: 0,
              performance_score: 0
            };
          }
          
          metrics[algorithm].total_requests += parseInt(data.total_requests) || 0;
          metrics[algorithm].avg_response_time += parseFloat(data.avg_response_time) || 0;
        }
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting algorithm metrics:', error);
      return {};
    }
  }

  /**
   * Get analytics from buffered data (fallback)
   */
  getBufferedAnalytics() {
    const analytics = {
      timeRange: 'buffered',
      endpoints: {},
      system: {
        total_requests: 0,
        total_blocked: 0,
        system_block_rate: '0%'
      }
    };

    for (const [key, entry] of this.metricsBuffer) {
      analytics.system.total_requests += entry.total;
      analytics.system.total_blocked += entry.blocked;
      
      analytics.endpoints[entry.endpoint] = {
        total_requests: entry.total,
        allowed: entry.allowed,
        blocked: entry.blocked,
        block_rate: entry.total > 0 ? ((entry.blocked / entry.total) * 100).toFixed(2) + '%' : '0%'
      };
    }

    analytics.system.system_block_rate = analytics.system.total_requests > 0 ?
      ((analytics.system.total_blocked / analytics.system.total_requests) * 100).toFixed(2) + '%' : '0%';

    return analytics;
  }

  /**
   * Clean up old metrics data
   */
  async cleanupOldMetrics() {
    try {
      const redis = getRedisClient();
      if (!(await isRedisAvailable())) return;

      const patterns = [
        'metrics:endpoint:*',
        'metrics:user:*',
        'metrics:ip:*',
        'metrics:algorithm:*',
        'metrics:global:*'
      ];

      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        // Redis will automatically expire keys based on TTL set when creating them
        logger.debug(`Found ${keys.length} metric keys for pattern ${pattern}`);
      }

    } catch (error) {
      logger.error('Error cleaning up old metrics:', error);
    }
  }
}

// Singleton instance
export const rateLimitMonitoringService = new RateLimitMonitoringService();

// Clean up metrics every hour
setInterval(() => {
  rateLimitMonitoringService.cleanupOldMetrics();
}, 60 * 60 * 1000);

// Clean up buffered metrics every 5 minutes
setInterval(() => {
  rateLimitMonitoringService.cleanupBuffer();
}, 5 * 60 * 1000);