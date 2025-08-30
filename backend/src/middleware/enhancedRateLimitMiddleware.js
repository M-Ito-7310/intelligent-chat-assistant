import { quotaService } from '../services/quotaService.js';
import { 
  getEndpointConfig, 
  applyTierMultipliers, 
  shouldBypassRateLimit, 
  getRoleMultiplier,
  responseConfigs 
} from '../config/rateLimitConfig.js';
import logger from '../utils/logger.js';

/**
 * Enhanced rate limiting middleware with endpoint-specific configurations
 */
export const enhancedRateLimitMiddleware = (category, operation, options = {}) => {
  return async (req, res, next) => {
    try {
      const startTime = Date.now();
      const userId = req.user?.id;
      const userRole = req.user?.role || 'user';
      const userTier = req.user?.subscription_tier || 'free';
      const clientIP = req.ip || req.connection.remoteAddress;
      const endpoint = `${category}.${operation}`;
      
      // Skip rate limiting for unauthenticated requests if configured
      if (!userId && options.requireAuth !== false) {
        return next();
      }
      
      // Check if should bypass rate limits
      if (shouldBypassRateLimit(userId, userRole, clientIP, endpoint)) {
        logger.debug(`Rate limit bypassed for ${userId || clientIP}:${endpoint}`);
        return next();
      }
      
      // Get endpoint-specific configuration
      let config = getEndpointConfig(category, operation);
      if (!config) {
        logger.warn(`No rate limit configuration found for ${endpoint}, using defaults`);
        return next();
      }
      
      // Apply tier multipliers
      config = applyTierMultipliers(config, userTier);
      
      // Apply role multipliers
      const roleMultiplier = getRoleMultiplier(userRole);
      if (roleMultiplier > 1) {
        config = applyRoleMultipliers(config, roleMultiplier);
      }
      
      // Perform rate limit check based on algorithm
      let rateLimitResult;
      
      switch (config.algorithm) {
        case 'token_bucket':
          rateLimitResult = await quotaService.checkRateLimit(
            userId || clientIP, 
            `${category}_${operation}`, 
            'token_bucket'
          );
          break;
          
        case 'sliding_window':
        default:
          rateLimitResult = await quotaService.checkRateLimit(
            userId || clientIP, 
            `${category}_${operation}`, 
            'sliding_window'
          );
          break;
      }
      
      // Add rate limit headers
      addRateLimitHeaders(res, rateLimitResult, config);
      
      // Check if rate limit exceeded
      if (!rateLimitResult.allowed) {
        const responseTime = Date.now() - startTime;
        
        // Log rate limit violation
        logger.warn('Rate limit exceeded', {
          userId: userId || 'anonymous',
          clientIP,
          endpoint,
          algorithm: config.algorithm,
          remaining: rateLimitResult.remaining,
          retryAfter: rateLimitResult.retryAfter,
          responseTime
        });
        
        // Handle blocked users (multiple violations)
        if (await isUserBlocked(userId || clientIP, endpoint)) {
          return res.status(responseConfigs.statusCodes.blocked).json({
            success: false,
            error: 'RATE_LIMIT_BLOCKED',
            message: responseConfigs.messages.blocked,
            blockDuration: config.blockDuration,
            timestamp: new Date().toISOString()
          });
        }
        
        // Record violation for blocking logic
        await recordRateLimitViolation(userId || clientIP, endpoint, config);
        
        // Return rate limit exceeded response
        return res.status(responseConfigs.statusCodes.rateLimitExceeded).json({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: config.message || responseConfigs.messages.generic,
          retryAfter: rateLimitResult.retryAfter,
          limit: getLimitInfo(config),
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
          timestamp: new Date().toISOString()
        });
      }
      
      // Store rate limit info for usage recording
      req.rateLimitInfo = {
        endpoint,
        algorithm: config.algorithm,
        remaining: rateLimitResult.remaining,
        limit: config
      };
      
      next();
      
    } catch (error) {
      logger.error('Enhanced rate limit middleware error:', error);
      // Allow request to proceed in case of middleware error
      next();
    }
  };
};

/**
 * Apply role multipliers to configuration
 */
function applyRoleMultipliers(config, multiplier) {
  const adjustedConfig = { ...config };
  
  if (config.limits) {
    adjustedConfig.limits = {};
    for (const [period, limit] of Object.entries(config.limits)) {
      adjustedConfig.limits[period] = Math.floor(limit * multiplier);
    }
  }
  
  if (config.capacity) {
    adjustedConfig.capacity = Math.floor(config.capacity * multiplier);
  }
  
  return adjustedConfig;
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(res, rateLimitResult, config) {
  const headers = responseConfigs.headers;
  
  // Add standard rate limit headers
  if (rateLimitResult.remaining !== undefined) {
    res.set(headers.rateLimitRemaining, rateLimitResult.remaining.toString());
  }
  
  if (rateLimitResult.resetTime) {
    res.set(headers.rateLimitReset, Math.ceil(rateLimitResult.resetTime / 1000).toString());
  }
  
  if (rateLimitResult.retryAfter) {
    res.set(headers.retryAfter, rateLimitResult.retryAfter.toString());
  }
  
  // Add limit information
  const limitInfo = getLimitInfo(config);
  if (limitInfo) {
    res.set(headers.rateLimitLimit, limitInfo.toString());
  }
}

/**
 * Get limit information for headers
 */
function getLimitInfo(config) {
  if (config.capacity) {
    return config.capacity;
  }
  
  if (config.limits) {
    // Return the most restrictive limit
    return Math.min(...Object.values(config.limits));
  }
  
  return null;
}

/**
 * Check if user is temporarily blocked
 */
async function isUserBlocked(identifier, endpoint) {
  try {
    // Implementation would check Redis for block status
    // For now, return false - would be implemented with Redis
    return false;
  } catch (error) {
    logger.error('Error checking user block status:', error);
    return false;
  }
}

/**
 * Record rate limit violation for blocking logic
 */
async function recordRateLimitViolation(identifier, endpoint, config) {
  try {
    // Implementation would record violations in Redis
    // and trigger blocking after threshold violations
    logger.debug(`Recording rate limit violation for ${identifier}:${endpoint}`);
  } catch (error) {
    logger.error('Error recording rate limit violation:', error);
  }
}

/**
 * Middleware factory for specific endpoint types
 */
export const createEndpointRateLimit = {
  // Authentication endpoints
  auth: {
    login: () => enhancedRateLimitMiddleware('auth', 'login'),
    register: () => enhancedRateLimitMiddleware('auth', 'register'),
    passwordReset: () => enhancedRateLimitMiddleware('auth', 'password-reset'),
    refresh: () => enhancedRateLimitMiddleware('auth', 'refresh')
  },
  
  // Chat endpoints
  chat: {
    message: () => enhancedRateLimitMiddleware('chat', 'message'),
    newConversation: () => enhancedRateLimitMiddleware('chat', 'new-conversation'),
    deleteConversation: () => enhancedRateLimitMiddleware('chat', 'delete-conversation'),
    getConversations: () => enhancedRateLimitMiddleware('chat', 'get-conversations')
  },
  
  // Document endpoints
  documents: {
    upload: () => enhancedRateLimitMiddleware('documents', 'upload'),
    bulkUpload: () => enhancedRateLimitMiddleware('documents', 'bulk-upload'),
    delete: () => enhancedRateLimitMiddleware('documents', 'delete'),
    search: () => enhancedRateLimitMiddleware('documents', 'search'),
    getList: () => enhancedRateLimitMiddleware('documents', 'get-list')
  },
  
  // Admin endpoints
  admin: {
    userManagement: () => enhancedRateLimitMiddleware('admin', 'user-management'),
    systemMetrics: () => enhancedRateLimitMiddleware('admin', 'system-metrics'),
    rateLimitReset: () => enhancedRateLimitMiddleware('admin', 'rate-limit-reset')
  },
  
  // System endpoints
  system: {
    health: () => enhancedRateLimitMiddleware('system', 'health', { requireAuth: false }),
    metrics: () => enhancedRateLimitMiddleware('system', 'metrics')
  }
};

/**
 * Global rate limiting middleware for all endpoints
 */
export const globalRateLimitMiddleware = () => {
  return async (req, res, next) => {
    try {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      // Check global API rate limits
      const globalResult = await quotaService.checkGlobalRateLimit('api_call');
      
      if (!globalResult.allowed) {
        logger.warn(`Global rate limit exceeded from IP: ${clientIP}`);
        
        return res.status(responseConfigs.statusCodes.serviceUnavailable).json({
          success: false,
          error: 'GLOBAL_RATE_LIMIT_EXCEEDED',
          message: responseConfigs.messages.maintenance,
          retryAfter: 60, // 1 minute default retry
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    } catch (error) {
      logger.error('Global rate limit middleware error:', error);
      next();
    }
  };
};