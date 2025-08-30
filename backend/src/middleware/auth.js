import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * JWT Authentication Middleware
 */
export const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Handle demo user authentication
    if (decoded.userId === 'demo-user-id') {
      req.user = {
        id: 'demo-user-id',
        email: 'demo@example.com',
        name: 'Demo User',
        is_active: true
      };
      
      logger.info('Authenticated demo user');
      return next();
    }
    
    // Get user from database for real users
    let client;
    try {
      client = await pool.connect();
    } catch (dbError) {
      logger.error('Database connection failed for authentication:', dbError);
      return res.status(503).json({
        success: false,
        message: 'Authentication service temporarily unavailable'
      });
    }

    try {
      const userQuery = 'SELECT id, email, name, is_active FROM users WHERE id = $1';
      const userResult = await client.query(userQuery, [decoded.userId]);
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      const user = userResult.rows[0];
      
      if (!user.is_active) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Account is deactivated.'
        });
      }

      // Add user info to request object
      req.user = user;
      
      logger.info(`Authenticated user: ${user.email} (${user.id})`);
      next();

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Token expired.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication failed.'
    });
  }
};

/**
 * Optional Authentication Middleware (for public endpoints that benefit from user context)
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const client = await pool.connect();
    try {
      const userQuery = 'SELECT id, email, name, is_active FROM users WHERE id = $1';
      const userResult = await client.query(userQuery, [decoded.userId]);
      
      if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
        req.user = null;
      } else {
        req.user = userResult.rows[0];
      }

    } finally {
      client.release();
    }

    next();

  } catch (error) {
    logger.warn('Optional authentication failed:', error.message);
    req.user = null;
    next();
  }
};

/**
 * Admin Role Middleware
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.'
      });
    }

    // Check if user has admin role (you might want to add a roles table)
    const client = await pool.connect();
    try {
      const adminQuery = 'SELECT is_admin FROM users WHERE id = $1';
      const result = await client.query(adminQuery, [req.user.id]);
      
      if (result.rows.length === 0 || !result.rows[0].is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      next();

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Admin check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed.'
    });
  }
};

/**
 * Rate Limiting Middleware (per user)
 */
export const createUserRateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }

    const requests = userRequests.get(userId);
    
    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    userRequests.set(userId, recentRequests);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    recentRequests.push(now);
    
    // Set headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - recentRequests.length),
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString()
    });

    next();
  };
};

/**
 * Validate conversation ownership
 */
export const validateConversationOwnership = async (req, res, next) => {
  try {
    const conversationId = req.params.id || req.body.conversationId;
    
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Conversation ID is required.'
      });
    }

    const client = await pool.connect();
    try {
      const query = 'SELECT user_id FROM conversations WHERE id = $1';
      const result = await client.query(query, [conversationId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found.'
        });
      }

      if (result.rows[0].user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Not your conversation.'
        });
      }

      req.conversationId = conversationId;
      next();

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Conversation ownership validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate conversation ownership.'
    });
  }
};

/**
 * Validate document ownership
 */
export const validateDocumentOwnership = async (req, res, next) => {
  try {
    const documentId = req.params.id || req.body.documentId;
    
    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'Document ID is required.'
      });
    }

    const client = await pool.connect();
    try {
      const query = 'SELECT user_id FROM documents WHERE id = $1';
      const result = await client.query(query, [documentId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Document not found.'
        });
      }

      if (result.rows[0].user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Not your document.'
        });
      }

      req.documentId = documentId;
      next();

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Document ownership validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate document ownership.'
    });
  }
};