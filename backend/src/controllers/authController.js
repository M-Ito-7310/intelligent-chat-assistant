import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import pool from '../config/database.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import logger from '../utils/logger.js';

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const payload = { userId };
  
  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
  
  const refreshToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d' }
  );
  
  return { accessToken, refreshToken };
};

/**
 * Register new user
 */
export const register = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { email, password, name } = req.body;

  // Demo mode - prevent actual registration but show demo info
  if (process.env.NODE_ENV === 'development') {
    logger.info('Registration attempt in demo mode');
    return res.status(400).json({
      success: false,
      message: 'Registration is disabled in demo mode. Please use demo credentials to test the application.',
      demo: {
        email: 'demo@example.com',
        password: 'demo123456'
      }
    });
  }

  let client;
  try {
    client = await pool.connect();
  } catch (dbError) {
    logger.error('Database connection failed for registration:', dbError);
    return res.status(503).json({
      success: false,
      message: 'Database not available. Registration is currently disabled.',
      demo: {
        email: 'demo@example.com',
        password: 'demo123456'
      }
    });
  }
  
  try {
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userQuery = `
      INSERT INTO users (email, password_hash, name)
      VALUES ($1, $2, $3)
      RETURNING id, email, name, created_at
    `;
    
    const userResult = await client.query(userQuery, [email, passwordHash, name]);
    const user = userResult.rows[0];

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

    await client.query(
      'INSERT INTO user_sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshTokenExpiry]
    );

    logger.info(`User registered: ${email} (${user.id})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Login user
 */
export const login = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Demo mode fallback for when database is not available
  if (email === 'demo@example.com' && password === 'demo123456') {
    const demoUser = {
      id: 'demo-user-id',
      email: 'demo@example.com',
      name: 'Demo User',
      created_at: new Date().toISOString()
    };

    const { accessToken, refreshToken } = generateTokens(demoUser.id);

    logger.info('Demo user login successful');

    return res.json({
      success: true,
      message: 'Login successful (Demo Mode)',
      data: {
        user: demoUser,
        tokens: { accessToken, refreshToken }
      }
    });
  }

  let client;
  try {
    client = await pool.connect();
  } catch (dbError) {
    logger.error('Database connection failed, responding with demo login info:', dbError);
    return res.status(503).json({
      success: false,
      message: 'Database not available. Please use demo credentials: demo@example.com / demo123456',
      demo: {
        email: 'demo@example.com',
        password: 'demo123456'
      }
    });
  }
  
  try {
    // Get user by email
    const userQuery = `
      SELECT id, email, name, password_hash, is_active, created_at
      FROM users 
      WHERE email = $1
    `;
    
    const userResult = await client.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Clean up old sessions for this user
    await client.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND expires_at < NOW()',
      [user.id]
    );

    // Store refresh token
    const refreshTokenExpiry = new Date();
    refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

    await client.query(
      'INSERT INTO user_sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshTokenExpiry]
    );

    logger.info(`User logged in: ${email} (${user.id})`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          created_at: user.created_at
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Refresh JWT token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token is required'
    });
  }

  const client = await pool.connect();
  
  try {
    // Verify refresh token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if refresh token exists in database
    const sessionQuery = `
      SELECT us.user_id, us.expires_at, u.email, u.name, u.is_active
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.refresh_token = $1 AND us.expires_at > NOW()
    `;
    
    const sessionResult = await client.query(sessionQuery, [token]);

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    const session = sessionResult.rows[0];

    if (!session.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(session.user_id);

    // Update refresh token in database
    const newRefreshTokenExpiry = new Date();
    newRefreshTokenExpiry.setDate(newRefreshTokenExpiry.getDate() + 7);

    await client.query(
      'UPDATE user_sessions SET refresh_token = $1, expires_at = $2 WHERE refresh_token = $3',
      [newRefreshToken, newRefreshTokenExpiry, token]
    );

    logger.info(`Token refreshed for user: ${session.email} (${session.user_id})`);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name
        },
        tokens: {
          accessToken,
          refreshToken: newRefreshToken
        }
      }
    });

  } catch (error) {
    logger.error('Refresh token error:', error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
    
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Get user profile
 */
export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const client = await pool.connect();
  
  try {
    const userQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.avatar_url,
        u.created_at,
        COUNT(DISTINCT c.id) as conversation_count,
        COUNT(DISTINCT d.id) as document_count
      FROM users u
      LEFT JOIN conversations c ON u.id = c.user_id
      LEFT JOIN documents d ON u.id = d.user_id
      WHERE u.id = $1
      GROUP BY u.id, u.email, u.name, u.avatar_url, u.created_at
    `;
    
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          stats: {
            conversation_count: parseInt(user.conversation_count),
            document_count: parseInt(user.document_count)
          }
        }
      }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    throw error;
  } finally {
    client.release();
  }
});

/**
 * Logout user (invalidate refresh token)
 */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  
  if (!token) {
    return res.json({
      success: true,
      message: 'Logged out successfully'
    });
  }

  const client = await pool.connect();
  
  try {
    // Remove refresh token from database
    await client.query(
      'DELETE FROM user_sessions WHERE refresh_token = $1',
      [token]
    );

    logger.info('User logged out successfully');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    // Don't throw error for logout, just return success
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } finally {
    client.release();
  }
});

/**
 * Change password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  const client = await pool.connect();
  
  try {
    // Get current password hash
    const userQuery = 'SELECT password_hash FROM users WHERE id = $1';
    const userResult = await client.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Invalidate all existing sessions except current one (optional)
    await client.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [userId]
    );

    logger.info(`Password changed for user: ${userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    throw error;
  } finally {
    client.release();
  }
});