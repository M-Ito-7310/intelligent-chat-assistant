import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { jest } from '@jest/globals';

// Import the route under test
import authRoutes from '../authRoutes.js';

// Mock dependencies
vi.mock('../../services/aiCoordinator.js', () => ({
  aiCoordinator: {
    chat: vi.fn().mockResolvedValue({
      content: 'Mock AI response',
      metadata: { usage: { total_tokens: 100 } }
    })
  }
}));

vi.mock('../../config/database.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn()
    })
  }
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Auth Routes Integration Tests', () => {
  let app;
  let mockDb;
  let mockClient;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    // Setup mock database client
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    mockDb = await import('../../config/database.js');
    mockDb.default.connect.mockResolvedValue(mockClient);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if user exists
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'user-123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'user',
            subscription_tier: 'free',
            created_at: new Date()
          }] 
        }); // Insert new user

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePassword123!',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should reject registration with existing email', async () => {
      // Mock database to return existing user
      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ id: 'existing-user', email: 'test@example.com' }] 
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Mock database to return user with hashed password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 12);
      
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should reject login with invalid email', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SecurePassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('CorrectPassword123!', 12);
      
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login for inactive user', async () => {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 12);
      
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          password: hashedPassword,
          name: 'Test User',
          role: 'user',
          subscription_tier: 'free',
          is_active: false
        }]
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Account is deactivated');
    });

    it('should validate input fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      // Mock JWT verification
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(null, { userId: 'user-123', type: 'refresh' });
        }
        return { userId: 'user-123', type: 'refresh' };
      });

      // Mock database to return user
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');

      mockVerify.mockRestore();
    });

    it('should reject invalid refresh token', async () => {
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Invalid token'));
        }
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid refresh token');

      mockVerify.mockRestore();
    });

    it('should require refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(null, { userId: 'user-123', type: 'access' });
        }
        return { userId: 'user-123', type: 'access' };
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
          subscription_tier: 'free',
          is_active: true,
          created_at: new Date(),
          last_login: new Date()
        }]
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid-access-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.user.password).toBeUndefined();

      mockVerify.mockRestore();
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('No token provided');
    });

    it('should reject invalid token', async () => {
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Invalid token'));
        }
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid token');

      mockVerify.mockRestore();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(null, { userId: 'user-123', type: 'access' });
        }
        return { userId: 'user-123', type: 'access' };
      });

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer valid-access-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('successfully');

      mockVerify.mockRestore();
    });

    it('should work even without token (logout is idempotent)', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const pool = await import('../../config/database.js');
      pool.default.connect.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Internal server error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // missing password and name
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should apply rate limiting to login endpoint', async () => {
      // Mock rate limit exceeded
      mockClient.query.mockRejectedValue(new Error('Rate limit exceeded'));

      const promises = [];
      // Make multiple rapid requests
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'test@example.com',
              password: 'SecurePassword123!'
            })
        );
      }

      const responses = await Promise.allSettled(promises);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(response => response.status === 429);

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});