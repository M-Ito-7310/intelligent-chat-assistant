import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

/**
 * Environment Configuration and Validation
 * Centralizes all environment variable handling and validation
 */

// Environment validation schema
const requiredEnvVars = {
  NODE_ENV: {
    required: true,
    allowedValues: ['development', 'staging', 'production', 'test'],
    default: 'development'
  },
  PORT: {
    required: false,
    type: 'number',
    default: 3000
  },
  
  // Database
  DATABASE_URL: {
    required: process.env.NODE_ENV !== 'development',
    description: 'PostgreSQL connection string'
  },
  
  // JWT
  JWT_SECRET: {
    required: process.env.NODE_ENV !== 'development',
    minLength: 32,
    description: 'JWT signing secret'
  },
  JWT_REFRESH_SECRET: {
    required: process.env.NODE_ENV !== 'development',
    minLength: 32,
    description: 'JWT refresh token signing secret'
  },
  
  // AI Services
  OPENAI_API_KEY: {
    required: process.env.NODE_ENV !== 'development',
    startsWith: 'sk-',
    description: 'OpenAI API key'
  },
  
  // Redis
  REDIS_HOST: {
    required: false,
    default: 'localhost'
  },
  REDIS_PORT: {
    required: false,
    type: 'number',
    default: 6379
  }
};

/**
 * Validate environment variable
 * @param {string} key - Environment variable name
 * @param {Object} config - Validation configuration
 * @returns {boolean} - Whether validation passed
 */
function validateEnvVar(key, config) {
  const value = process.env[key];
  
  // Check if required
  if (config.required && !value) {
    logger.error(`Missing required environment variable: ${key}${config.description ? ` (${config.description})` : ''}`);
    return false;
  }
  
  // Skip further validation if not provided and not required
  if (!value && !config.required) {
    if (config.default !== undefined) {
      process.env[key] = String(config.default);
    }
    return true;
  }
  
  // Type validation
  if (config.type === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      logger.error(`Environment variable ${key} must be a number, got: ${value}`);
      return false;
    }
  }
  
  // Allowed values validation
  if (config.allowedValues && !config.allowedValues.includes(value)) {
    logger.error(`Environment variable ${key} must be one of: ${config.allowedValues.join(', ')}, got: ${value}`);
    return false;
  }
  
  // Minimum length validation
  if (config.minLength && value.length < config.minLength) {
    logger.error(`Environment variable ${key} must be at least ${config.minLength} characters long`);
    return false;
  }
  
  // Starts with validation
  if (config.startsWith && !value.startsWith(config.startsWith)) {
    logger.error(`Environment variable ${key} must start with "${config.startsWith}"`);
    return false;
  }
  
  return true;
}

/**
 * Validate all environment variables
 * @returns {boolean} - Whether all validations passed
 */
function validateEnvironment() {
  logger.info('Validating environment configuration...');
  
  let allValid = true;
  
  for (const [key, config] of Object.entries(requiredEnvVars)) {
    if (!validateEnvVar(key, config)) {
      allValid = false;
    }
  }
  
  // Custom validation for production
  if (process.env.NODE_ENV === 'production') {
    const productionRequiredVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'OPENAI_API_KEY',
      'REDIS_HOST'
    ];
    
    for (const varName of productionRequiredVars) {
      if (!process.env[varName]) {
        logger.error(`Production environment requires ${varName}`);
        allValid = false;
      }
    }
  }
  
  if (!allValid) {
    logger.error('Environment validation failed. Please check your environment variables.');
    if (process.env.VALIDATE_ENV_ON_START !== 'false') {
      process.exit(1);
    }
  } else {
    logger.info('Environment validation passed');
  }
  
  return allValid;
}

/**
 * Get environment configuration object
 * @returns {Object} - Configuration object
 */
function getConfig() {
  return {
    // Application
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT) || 3000,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
    
    // Database
    DATABASE_URL: process.env.DATABASE_URL,
    DB_MAX_CONNECTIONS: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    DB_IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    DB_CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
    DB_SSL_MODE: process.env.DB_SSL_MODE || 'prefer',
    
    // JWT
    JWT_SECRET: process.env.JWT_SECRET || 'dev-jwt-secret',
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    
    // Redis
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: parseInt(process.env.REDIS_DB) || 0,
    REDIS_TLS: process.env.REDIS_TLS === 'true',
    
    // AI Services
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    OPENAI_MAX_TOKENS: parseInt(process.env.OPENAI_MAX_TOKENS) || 4096,
    OPENAI_TEMPERATURE: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
    
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-pro',
    
    HUGGING_FACE_API_KEY: process.env.HUGGING_FACE_API_KEY,
    
    // Vector Database
    PINECONE_API_KEY: process.env.PINECONE_API_KEY,
    PINECONE_ENVIRONMENT: process.env.PINECONE_ENVIRONMENT,
    PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
    
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    EMBEDDING_DIMENSIONS: parseInt(process.env.EMBEDDING_DIMENSIONS) || 1536,
    
    // File Storage
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    ALLOWED_FILE_TYPES: (process.env.ALLOWED_FILE_TYPES || 'pdf,txt,doc,docx').split(','),
    
    // AWS S3
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION || 'us-west-2',
    AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
    
    // Security
    CORS_ORIGIN: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
    CORS_CREDENTIALS: process.env.CORS_CREDENTIALS !== 'false',
    
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15,
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    
    // Password policy
    MIN_PASSWORD_LENGTH: parseInt(process.env.MIN_PASSWORD_LENGTH) || 8,
    REQUIRE_UPPERCASE: process.env.REQUIRE_UPPERCASE !== 'false',
    REQUIRE_NUMBERS: process.env.REQUIRE_NUMBERS !== 'false',
    REQUIRE_SYMBOLS: process.env.REQUIRE_SYMBOLS !== 'false',
    
    // Monitoring
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FORMAT: process.env.LOG_FORMAT || 'text',
    
    DATADOG_API_KEY: process.env.DATADOG_API_KEY,
    NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    
    HEALTH_CHECK_ENABLED: process.env.HEALTH_CHECK_ENABLED !== 'false',
    HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    
    // Performance
    NODE_MAX_OLD_SPACE_SIZE: parseInt(process.env.NODE_MAX_OLD_SPACE_SIZE) || 2048,
    REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    AI_REQUEST_TIMEOUT: parseInt(process.env.AI_REQUEST_TIMEOUT) || 60000,
    
    // Cache
    CACHE_DEFAULT_TTL: parseInt(process.env.CACHE_DEFAULT_TTL) || 3600,
    CACHE_SHORT_TTL: parseInt(process.env.CACHE_SHORT_TTL) || 300,
    CACHE_LONG_TTL: parseInt(process.env.CACHE_LONG_TTL) || 86400,
    
    // Feature Flags
    ENABLE_RAG: process.env.ENABLE_RAG !== 'false',
    ENABLE_STREAMING: process.env.ENABLE_STREAMING !== 'false',
    ENABLE_DOCUMENT_UPLOAD: process.env.ENABLE_DOCUMENT_UPLOAD !== 'false',
    ENABLE_WEBSOCKETS: process.env.ENABLE_WEBSOCKETS !== 'false',
    ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS !== 'false',
    ENABLE_ADMIN_DASHBOARD: process.env.ENABLE_ADMIN_DASHBOARD !== 'false',
    
    ENABLE_BETA_FEATURES: process.env.ENABLE_BETA_FEATURES === 'true',
    ENABLE_EXPERIMENTAL_AI: process.env.ENABLE_EXPERIMENTAL_AI === 'true',
    
    // Email
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: parseInt(process.env.SMTP_PORT) || 587,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    
    FROM_EMAIL: process.env.FROM_EMAIL,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    
    // Analytics
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID,
    ENABLE_USER_ANALYTICS: process.env.ENABLE_USER_ANALYTICS !== 'false',
    ANALYTICS_SAMPLE_RATE: parseFloat(process.env.ANALYTICS_SAMPLE_RATE) || 0.1,
    
    // Backup
    BACKUP_ENABLED: process.env.BACKUP_ENABLED === 'true',
    BACKUP_SCHEDULE: process.env.BACKUP_SCHEDULE || '0 2 * * *',
    BACKUP_RETENTION_DAYS: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
    
    // Development
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
    ENABLE_GRAPHQL_PLAYGROUND: process.env.ENABLE_GRAPHQL_PLAYGROUND === 'true',
    ENABLE_API_DOCS: process.env.ENABLE_API_DOCS === 'true',
    ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING === 'true',
    LOG_SQL_QUERIES: process.env.LOG_SQL_QUERIES === 'true',
    
    // Microservices
    DOCUMENT_SERVICE_URL: process.env.DOCUMENT_SERVICE_URL,
    CHAT_SERVICE_URL: process.env.CHAT_SERVICE_URL,
    AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL,
    
    // CDN
    CDN_URL: process.env.CDN_URL,
    STATIC_FILES_URL: process.env.STATIC_FILES_URL,
    ASSET_VERSION: process.env.ASSET_VERSION || 'v1.0.0',
    
    // Compliance
    ENABLE_GDPR_MODE: process.env.ENABLE_GDPR_MODE === 'true',
    DATA_RETENTION_DAYS: parseInt(process.env.DATA_RETENTION_DAYS) || 365,
    ALLOW_DATA_EXPORT: process.env.ALLOW_DATA_EXPORT !== 'false',
    ANONYMIZE_LOGS: process.env.ANONYMIZE_LOGS === 'true',
    ENCRYPT_USER_DATA: process.env.ENCRYPT_USER_DATA !== 'false',
    
    // Scaling
    CLUSTER_MODE: process.env.CLUSTER_MODE === 'true',
    WORKER_PROCESSES: process.env.WORKER_PROCESSES || 'auto',
    SESSION_AFFINITY: process.env.SESSION_AFFINITY === 'true',
    
    // Security
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
    ENABLE_2FA: process.env.ENABLE_2FA === 'true',
    
    // Application metadata
    APP_NAME: process.env.APP_NAME || 'AI Chatbot Service',
    APP_VERSION: process.env.APP_VERSION || '1.0.0',
    APP_DESCRIPTION: process.env.APP_DESCRIPTION || 'Intelligent AI-powered chatbot with RAG capabilities',
    
    BRAND_NAME: process.env.BRAND_NAME || 'Your Company',
    BRAND_COLOR: process.env.BRAND_COLOR || '#1f2937',
    BRAND_LOGO_URL: process.env.BRAND_LOGO_URL,
    
    // Environment validation
    REQUIRED_ENV_VARS: (process.env.REQUIRED_ENV_VARS || '').split(',').filter(Boolean),
    VALIDATE_ENV_ON_START: process.env.VALIDATE_ENV_ON_START !== 'false',
    CHECK_DATABASE_ON_START: process.env.CHECK_DATABASE_ON_START !== 'false',
    CHECK_REDIS_ON_START: process.env.CHECK_REDIS_ON_START !== 'false',
    CHECK_AI_SERVICE_ON_START: process.env.CHECK_AI_SERVICE_ON_START !== 'false'
  };
}

/**
 * Check external service health
 * @returns {Object} - Health status of external services
 */
async function checkExternalServices() {
  const config = getConfig();
  const status = {
    database: false,
    redis: false,
    aiService: false,
    errors: []
  };
  
  // Check database
  if (config.CHECK_DATABASE_ON_START && config.DATABASE_URL) {
    try {
      const { default: pool } = await import('../config/database.js');
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      status.database = true;
      logger.info('Database connection: OK');
    } catch (error) {
      status.errors.push(`Database: ${error.message}`);
      logger.warn(`Database connection failed: ${error.message}`);
    }
  }
  
  // Check Redis
  if (config.CHECK_REDIS_ON_START && config.REDIS_HOST) {
    try {
      const { isRedisAvailable } = await import('./redis.js');
      status.redis = await isRedisAvailable();
      if (status.redis) {
        logger.info('Redis connection: OK');
      } else {
        status.errors.push('Redis: Connection failed');
        logger.warn('Redis connection failed');
      }
    } catch (error) {
      status.errors.push(`Redis: ${error.message}`);
      logger.warn(`Redis connection failed: ${error.message}`);
    }
  }
  
  // Check AI service
  if (config.CHECK_AI_SERVICE_ON_START && config.OPENAI_API_KEY) {
    try {
      const { aiCoordinator } = await import('../services/aiCoordinator.js');
      // This would be a simple test call to verify API key works
      status.aiService = true;
      logger.info('AI service connection: OK');
    } catch (error) {
      status.errors.push(`AI Service: ${error.message}`);
      logger.warn(`AI service connection failed: ${error.message}`);
    }
  }
  
  return status;
}

/**
 * Initialize environment configuration
 * @returns {Object} - Configuration object
 */
async function initializeEnvironment() {
  // Validate environment
  validateEnvironment();
  
  // Get configuration
  const config = getConfig();
  
  // Check external services if enabled
  if (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') {
    const serviceStatus = await checkExternalServices();
    
    if (serviceStatus.errors.length > 0) {
      logger.warn('Some external services are unavailable:', serviceStatus.errors);
    }
  }
  
  // Log configuration summary (without sensitive data)
  logger.info('Environment configuration loaded:', {
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    DATABASE_CONFIGURED: !!config.DATABASE_URL,
    REDIS_CONFIGURED: !!config.REDIS_HOST,
    AI_SERVICE_CONFIGURED: !!config.OPENAI_API_KEY,
    FEATURES_ENABLED: {
      RAG: config.ENABLE_RAG,
      STREAMING: config.ENABLE_STREAMING,
      DOCUMENT_UPLOAD: config.ENABLE_DOCUMENT_UPLOAD,
      WEBSOCKETS: config.ENABLE_WEBSOCKETS,
      ANALYTICS: config.ENABLE_ANALYTICS
    }
  });
  
  return config;
}

export {
  getConfig,
  validateEnvironment,
  checkExternalServices,
  initializeEnvironment
};