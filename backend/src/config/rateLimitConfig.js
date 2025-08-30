/**
 * Rate Limiting Configuration for Different Endpoint Types
 * Defines specific rate limiting rules for various API endpoints
 */

/**
 * Endpoint-specific rate limiting configurations
 */
export const endpointConfigs = {
  // Authentication endpoints - strict limits to prevent brute force
  auth: {
    login: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 5,
        per_hour: 20,
        per_day: 50
      },
      blockDuration: 900000, // 15 minutes block after exceeded
      message: 'Too many login attempts. Please try again later.'
    },
    register: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 2,
        per_hour: 5,
        per_day: 10
      },
      blockDuration: 1800000, // 30 minutes block
      message: 'Too many registration attempts. Please try again later.'
    },
    'password-reset': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 1,
        per_hour: 3,
        per_day: 5
      },
      blockDuration: 3600000, // 1 hour block
      message: 'Too many password reset requests. Please try again later.'
    },
    refresh: {
      algorithm: 'token_bucket',
      capacity: 10,
      refillRate: 0.1, // 1 token per 10 seconds
      message: 'Token refresh rate exceeded. Please wait before requesting again.'
    }
  },

  // Chat endpoints - moderate limits for conversational flow
  chat: {
    message: {
      algorithm: 'token_bucket',
      capacity: 10,
      refillRate: 0.2, // 1 token per 5 seconds
      tierMultipliers: {
        free: 1,
        pro: 3,
        enterprise: 5
      },
      message: 'Chat message rate limit exceeded. Please slow down.'
    },
    'new-conversation': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 5,
        per_hour: 50
      },
      tierMultipliers: {
        free: 1,
        pro: 2,
        enterprise: 5
      },
      message: 'Too many new conversations created. Please wait.'
    },
    'delete-conversation': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 10,
        per_hour: 100
      },
      message: 'Too many delete requests. Please wait.'
    },
    'get-conversations': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 30,
        per_hour: 200
      },
      message: 'Too many conversation list requests.'
    }
  },

  // Document endpoints - restricted for resource management
  documents: {
    upload: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 2,
        per_hour: 10,
        per_day: 50
      },
      tierMultipliers: {
        free: 1,
        pro: 3,
        enterprise: 10
      },
      message: 'Document upload rate limit exceeded.'
    },
    'bulk-upload': {
      algorithm: 'sliding_window',
      limits: {
        per_hour: 3,
        per_day: 10
      },
      tierMultipliers: {
        free: 0.5, // Reduced for free tier
        pro: 1,
        enterprise: 3
      },
      message: 'Bulk upload rate limit exceeded.'
    },
    delete: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 5,
        per_hour: 50
      },
      message: 'Document deletion rate limit exceeded.'
    },
    search: {
      algorithm: 'token_bucket',
      capacity: 15,
      refillRate: 0.25, // 1 token per 4 seconds
      tierMultipliers: {
        free: 1,
        pro: 2,
        enterprise: 4
      },
      message: 'Document search rate limit exceeded.'
    },
    'get-list': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 20,
        per_hour: 100
      },
      message: 'Too many document list requests.'
    }
  },

  // Admin endpoints - very strict limits
  admin: {
    'user-management': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 10,
        per_hour: 100
      },
      message: 'Admin user management rate limit exceeded.'
    },
    'system-metrics': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 5,
        per_hour: 50
      },
      message: 'Admin metrics access rate limit exceeded.'
    },
    'rate-limit-reset': {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 2,
        per_hour: 10
      },
      message: 'Admin rate limit reset usage exceeded.'
    }
  },

  // Health and monitoring endpoints - relaxed limits
  system: {
    health: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 60,
        per_hour: 1000
      },
      message: 'Health check rate limit exceeded.'
    },
    metrics: {
      algorithm: 'sliding_window',
      limits: {
        per_minute: 10,
        per_hour: 100
      },
      message: 'Metrics endpoint rate limit exceeded.'
    }
  }
};

/**
 * Global rate limiting configurations
 */
export const globalConfigs = {
  // Overall API rate limits
  api: {
    requests_per_second: 100,
    requests_per_minute: 1000,
    requests_per_hour: 10000
  },
  
  // Bandwidth-intensive operations
  uploads: {
    concurrent_uploads: 10,
    total_size_per_hour: '500MB',
    requests_per_minute: 20
  },
  
  // AI model API calls
  ai_requests: {
    requests_per_minute: 30,
    requests_per_hour: 500,
    concurrent_requests: 5
  },
  
  // Database operations
  database: {
    queries_per_second: 50,
    heavy_queries_per_minute: 10
  }
};

/**
 * Rate limit bypass configurations
 */
export const bypassConfigs = {
  // IP addresses that bypass rate limits (for monitoring, etc.)
  whitelistedIPs: [
    '127.0.0.1',
    '::1'
  ],
  
  // User roles that have different limits
  roleOverrides: {
    admin: {
      multiplier: 10,
      bypassEndpoints: ['system.health', 'system.metrics']
    },
    moderator: {
      multiplier: 5,
      bypassEndpoints: ['system.health']
    },
    premium: {
      multiplier: 3
    }
  },
  
  // Service-to-service authentication bypasses
  serviceTokens: {
    // These would be loaded from environment variables
    // 'service-token-hash': { name: 'internal-service', bypass: true }
  }
};

/**
 * Rate limit response configurations
 */
export const responseConfigs = {
  // HTTP status codes for different scenarios
  statusCodes: {
    rateLimitExceeded: 429,
    quotaExceeded: 402, // Payment required
    blocked: 423, // Locked
    serviceUnavailable: 503
  },
  
  // Response headers
  headers: {
    rateLimitLimit: 'X-RateLimit-Limit',
    rateLimitRemaining: 'X-RateLimit-Remaining',
    rateLimitReset: 'X-RateLimit-Reset',
    retryAfter: 'Retry-After'
  },
  
  // Response messages
  messages: {
    generic: 'Rate limit exceeded. Please try again later.',
    quota: 'Usage quota exceeded. Please upgrade your plan or wait for quota reset.',
    blocked: 'Access temporarily blocked due to excessive requests.',
    maintenance: 'Service temporarily unavailable. Please try again later.'
  }
};

/**
 * Get rate limit configuration for specific endpoint
 * @param {string} category - Endpoint category (auth, chat, documents, etc.)
 * @param {string} operation - Specific operation within category
 * @returns {Object|null} - Rate limit configuration or null if not found
 */
export function getEndpointConfig(category, operation) {
  const categoryConfig = endpointConfigs[category];
  if (!categoryConfig) return null;
  
  const operationConfig = categoryConfig[operation];
  if (!operationConfig) return null;
  
  return {
    ...operationConfig,
    category,
    operation,
    key: `${category}.${operation}`
  };
}

/**
 * Apply tier multipliers to rate limits
 * @param {Object} config - Base rate limit configuration
 * @param {string} tier - User subscription tier
 * @returns {Object} - Modified configuration with tier-adjusted limits
 */
export function applyTierMultipliers(config, tier) {
  if (!config.tierMultipliers) return config;
  
  const multiplier = config.tierMultipliers[tier] || 1;
  const adjustedConfig = { ...config };
  
  // Apply multiplier to limits
  if (config.limits) {
    adjustedConfig.limits = {};
    for (const [period, limit] of Object.entries(config.limits)) {
      adjustedConfig.limits[period] = Math.floor(limit * multiplier);
    }
  }
  
  // Apply multiplier to token bucket capacity
  if (config.capacity) {
    adjustedConfig.capacity = Math.floor(config.capacity * multiplier);
  }
  
  return adjustedConfig;
}

/**
 * Check if user/IP should bypass rate limits
 * @param {string} userId - User ID
 * @param {string} userRole - User role
 * @param {string} clientIP - Client IP address
 * @param {string} endpoint - Endpoint key (category.operation)
 * @returns {boolean} - Whether to bypass rate limits
 */
export function shouldBypassRateLimit(userId, userRole, clientIP, endpoint) {
  // Check IP whitelist
  if (bypassConfigs.whitelistedIPs.includes(clientIP)) {
    return true;
  }
  
  // Check role overrides
  const roleOverride = bypassConfigs.roleOverrides[userRole];
  if (roleOverride) {
    // Check if endpoint is in bypass list
    if (roleOverride.bypassEndpoints && roleOverride.bypassEndpoints.includes(endpoint)) {
      return true;
    }
  }
  
  // Demo users bypass rate limits
  if (userId === 'demo-user-id') {
    return true;
  }
  
  return false;
}

/**
 * Get role multiplier for rate limits
 * @param {string} userRole - User role
 * @returns {number} - Rate limit multiplier
 */
export function getRoleMultiplier(userRole) {
  const roleOverride = bypassConfigs.roleOverrides[userRole];
  return roleOverride ? roleOverride.multiplier : 1;
}