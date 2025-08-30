import { quotaService } from '../services/quotaService.js';
import logger from '../utils/logger.js';

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = (operation = 'api_call') => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return next(); // Skip for unauthenticated requests
      }

      // Check rate limit
      const rateCheck = await quotaService.checkRateLimit(userId, operation);
      
      if (!rateCheck.allowed) {
        logger.warn(`Rate limit exceeded for user ${userId}, operation: ${operation}`);
        
        return res.status(429).json({
          success: false,
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: rateCheck.retryAfter
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      // Allow request to proceed in case of middleware error
      next();
    }
  };
};

/**
 * Quota checking middleware
 */
export const quotaMiddleware = (operation, estimatedAmount = null) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return next(); // Skip for unauthenticated requests
      }

      // Skip quota check for demo users
      if (userId === 'demo-user-id') {
        return next();
      }

      let amount = estimatedAmount;
      
      // Estimate token usage for messages
      if (operation === 'tokens' && !amount && req.body?.message) {
        // Rough estimation: 1 token ≈ 4 characters
        amount = Math.ceil(req.body.message.length / 4);
      }

      // Default amount
      if (!amount) {
        amount = 1;
      }

      // Check quota
      const quotaCheck = await quotaService.checkQuota(userId, operation, amount);
      
      if (!quotaCheck.allowed) {
        logger.warn(`Quota exceeded for user ${userId}, operation: ${operation}`);
        
        return res.status(402).json({
          success: false,
          message: `${operation} quota exceeded. Please upgrade your plan or wait for quota reset.`,
          quota: {
            operation,
            remaining: quotaCheck.remaining,
            resetTime: quotaCheck.resetTime,
            tier: quotaCheck.tier
          }
        });
      }

      // Store quota info for later usage recording
      req.quotaInfo = {
        operation,
        amount,
        remaining: quotaCheck.remaining
      };

      next();
    } catch (error) {
      logger.error('Quota middleware error:', error);
      // Allow request to proceed in case of middleware error
      next();
    }
  };
};

/**
 * Usage recording middleware (to be used after successful operations)
 */
export const recordUsageMiddleware = (operation) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = async function(data) {
      // Only record usage if the operation was successful
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const userId = req.user?.id;
          if (userId && userId !== 'demo-user-id') {
            let amount = req.quotaInfo?.amount || 1;
            
            // Extract actual token usage from AI response
            if (operation === 'tokens' && data) {
              const responseData = typeof data === 'string' ? JSON.parse(data) : data;
              if (responseData.data?.assistantMessage?.metadata?.usage?.total_tokens) {
                amount = responseData.data.assistantMessage.metadata.usage.total_tokens;
              }
            }

            await quotaService.recordUsage(userId, operation, amount, {
              endpoint: req.path,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          logger.error('Record usage middleware error:', error);
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

/**
 * Combined middleware for rate limiting, quota checking, and usage recording
 */
export const createLimitMiddleware = (operation, options = {}) => {
  const {
    checkRate = true,
    checkQuota = true,
    recordUsage = true,
    estimatedAmount = null
  } = options;

  const middlewares = [];

  if (checkRate) {
    middlewares.push(rateLimitMiddleware(operation));
  }

  if (checkQuota) {
    middlewares.push(quotaMiddleware(operation, estimatedAmount));
  }

  if (recordUsage) {
    middlewares.push(recordUsageMiddleware(operation));
  }

  return middlewares;
};