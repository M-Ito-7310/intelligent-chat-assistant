const request = require('supertest')
const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const authController = require('../authController')
const db = require('../../config/database')

// Mock database
jest.mock('../../config/database')

// Mock bcrypt
jest.mock('bcryptjs')

// Mock jsonwebtoken
jest.mock('jsonwebtoken')

// Create Express app for testing
const app = express()
app.use(express.json())

// Define routes
app.post('/register', authController.register)
app.post('/login', authController.login)
app.post('/refresh', authController.refreshToken)
app.get('/me', authController.getCurrentUser)

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        created_at: new Date(),
      }

      // Mock database responses
      db.query.mockResolvedValueOnce({ rows: [] }) // Check existing user
      bcrypt.hash.mockResolvedValueOnce('hashed-password')
      db.query.mockResolvedValueOnce({ rows: [mockUser] }) // Insert user
      jwt.sign.mockReturnValueOnce('access-token')
      jwt.sign.mockReturnValueOnce('refresh-token')

      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toEqual(mockUser)
      expect(response.body.data.tokens).toHaveProperty('accessToken')
      expect(response.body.data.tokens).toHaveProperty('refreshToken')
    })

    it('should return error if email already exists', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, email: 'existing@example.com' }],
      })

      const response = await request(app)
        .post('/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Email already exists')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          email: 'test@example.com',
          // Missing password and name
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('required')
    })

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('email')
    })
  })

  describe('POST /login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password',
        role: 'user',
      }

      db.query.mockResolvedValueOnce({ rows: [mockUser] })
      bcrypt.compare.mockResolvedValueOnce(true)
      jwt.sign.mockReturnValueOnce('access-token')
      jwt.sign.mockReturnValueOnce('refresh-token')

      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user.email).toBe('test@example.com')
      expect(response.body.data.user).not.toHaveProperty('password')
      expect(response.body.data.tokens).toHaveProperty('accessToken')
      expect(response.body.data.tokens).toHaveProperty('refreshToken')
    })

    it('should return error for invalid email', async () => {
      db.query.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post('/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Invalid credentials')
    })

    it('should return error for invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashed-password',
      }

      db.query.mockResolvedValueOnce({ rows: [mockUser] })
      bcrypt.compare.mockResolvedValueOnce(false)

      const response = await request(app)
        .post('/login')
        .send({
          email: 'test@example.com',
          password: 'wrong-password',
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Invalid credentials')
    })
  })

  describe('POST /refresh', () => {
    it('should refresh token successfully', async () => {
      const mockPayload = { userId: 1 }
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        role: 'user',
      }

      jwt.verify.mockReturnValueOnce(mockPayload)
      db.query.mockResolvedValueOnce({ rows: [mockUser] })
      jwt.sign.mockReturnValueOnce('new-access-token')
      jwt.sign.mockReturnValueOnce('new-refresh-token')

      const response = await request(app)
        .post('/refresh')
        .send({
          refreshToken: 'valid-refresh-token',
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.tokens.accessToken).toBe('new-access-token')
      expect(response.body.data.tokens.refreshToken).toBe('new-refresh-token')
    })

    it('should return error for invalid refresh token', async () => {
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token')
      })

      const response = await request(app)
        .post('/refresh')
        .send({
          refreshToken: 'invalid-refresh-token',
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Invalid refresh token')
    })

    it('should return error if refresh token is missing', async () => {
      const response = await request(app)
        .post('/refresh')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Refresh token is required')
    })
  })

  describe('GET /me', () => {
    it('should get current user successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      }

      // Mock auth middleware
      const authMiddleware = (req, res, next) => {
        req.userId = 1
        next()
      }

      // Create new app with auth middleware
      const protectedApp = express()
      protectedApp.use(express.json())
      protectedApp.get('/me', authMiddleware, authController.getCurrentUser)

      db.query.mockResolvedValueOnce({ rows: [mockUser] })

      const response = await request(protectedApp)
        .get('/me')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toEqual(mockUser)
    })

    it('should return error if user not found', async () => {
      const authMiddleware = (req, res, next) => {
        req.userId = 999
        next()
      }

      const protectedApp = express()
      protectedApp.use(express.json())
      protectedApp.get('/me', authMiddleware, authController.getCurrentUser)

      db.query.mockResolvedValueOnce({ rows: [] })

      const response = await request(protectedApp)
        .get('/me')
        .set('Authorization', 'Bearer valid-token')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('User not found')
    })
  })
})