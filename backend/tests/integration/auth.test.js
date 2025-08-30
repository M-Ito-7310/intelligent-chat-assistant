import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import cors from 'cors'
import authRoutes from '../../src/routes/auth.js'

// Integration test for auth flow
const app = express()
app.use(cors())
app.use(express.json())
app.use('/api/auth', authRoutes)

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    // Setup test database
    if (global.mockPool) {
      // Initialize test data if needed
    }
  })

  afterAll(async () => {
    // Cleanup test database
    if (global.mockPool) {
      await global.mockPool.end()
    }
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication Flow', () => {
    it('should complete full registration and login flow', async () => {
      // Mock database responses for registration
      global.mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'integration@test.com' }] }) // Insert user

      // Register new user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Integration Test User',
          email: 'integration@test.com',
          password: 'password123'
        })

      expect(registerResponse.status).toBe(201)
      expect(registerResponse.body.success).toBe(true)

      // Mock database responses for login
      const mockUser = {
        id: 'user-1',
        email: 'integration@test.com',
        password: 'hashedPassword',
        name: 'Integration Test User',
        role: 'user'
      }

      global.mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }) // Update refresh token

      // Mock bcrypt and jwt
      const bcrypt = await import('bcryptjs')
      const jwt = await import('jsonwebtoken')
      
      bcrypt.compare.mockResolvedValue(true)
      jwt.sign.mockImplementation((payload, secret, options) => {
        if (options.expiresIn === '15m') return 'access-token'
        if (options.expiresIn === '7d') return 'refresh-token'
      })

      // Login with registered user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'integration@test.com',
          password: 'password123'
        })

      expect(loginResponse.status).toBe(200)
      expect(loginResponse.body.success).toBe(true)
      expect(loginResponse.body.data.tokens.accessToken).toBe('access-token')
      expect(loginResponse.body.data.tokens.refreshToken).toBe('refresh-token')
    })

    it('should handle demo mode authentication', async () => {
      // Test demo user login
      const demoResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'demo@example.com',
          password: 'demo123456'
        })

      expect(demoResponse.status).toBe(200)
      expect(demoResponse.body.success).toBe(true)
      expect(demoResponse.body.data.user.role).toBe('user')
      expect(demoResponse.body.data.tokens.accessToken).toBe('demo-access-token')

      // Test admin demo login
      const adminResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123456'
        })

      expect(adminResponse.status).toBe(200)
      expect(adminResponse.body.success).toBe(true)
      expect(adminResponse.body.data.user.role).toBe('admin')
      expect(adminResponse.body.data.tokens.accessToken).toBe('admin-access-token')
    })

    it('should handle token refresh flow', async () => {
      const jwt = await import('jsonwebtoken')
      
      // Mock valid refresh token
      jwt.verify.mockReturnValue({ userId: 'user-1' })
      jwt.sign.mockReturnValue('new-access-token')
      
      global.mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'test@example.com' }]
      })

      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token'
        })

      expect(refreshResponse.status).toBe(200)
      expect(refreshResponse.body.success).toBe(true)
      expect(refreshResponse.body.data.accessToken).toBe('new-access-token')
    })

    it('should reject invalid authentication attempts', async () => {
      // Test with non-existent user
      global.mockPool.query.mockResolvedValueOnce({ rows: [] })

      const invalidUserResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password'
        })

      expect(invalidUserResponse.status).toBe(400)
      expect(invalidUserResponse.body.success).toBe(false)

      // Test with invalid refresh token
      const jwt = await import('jsonwebtoken')
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const invalidRefreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        })

      expect(invalidRefreshResponse.status).toBe(401)
      expect(invalidRefreshResponse.body.success).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      global.mockPool.query.mockRejectedValue(new Error('Database connection failed'))

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password'
        })

      expect(response.status).toBe(500)
      expect(response.body.success).toBe(false)
    })

    it('should validate required fields', async () => {
      // Missing email
      const missingEmailResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          password: 'password123'
        })

      expect(missingEmailResponse.status).toBe(400)
      expect(missingEmailResponse.body.success).toBe(false)

      // Missing password
      const missingPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
        })

      expect(missingPasswordResponse.status).toBe(400)
      expect(missingPasswordResponse.body.success).toBe(false)
    })
  })
})