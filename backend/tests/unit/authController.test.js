import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import authController from '../../src/controllers/authController.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Mock dependencies
jest.mock('bcryptjs')
jest.mock('jsonwebtoken')
jest.mock('../../src/config/database.js', () => ({
  query: jest.fn()
}))

const app = express()
app.use(express.json())
app.post('/auth/login', authController.login)
app.post('/auth/register', authController.register)
app.post('/auth/refresh', authController.refreshToken)

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashedPassword',
        name: 'Test User',
        role: 'user'
      }

      global.mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }) // Update tokens

      bcrypt.compare.mockResolvedValue(true)
      jwt.sign.mockImplementation((payload, secret, options) => {
        if (options.expiresIn === '15m') return 'access-token'
        if (options.expiresIn === '7d') return 'refresh-token'
      })

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user.email).toBe('test@example.com')
      expect(response.body.data.tokens).toHaveProperty('accessToken')
      expect(response.body.data.tokens).toHaveProperty('refreshToken')
    })

    it('should handle demo user login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'demo@example.com',
          password: 'demo123456'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user.email).toBe('demo@example.com')
      expect(response.body.data.user.role).toBe('user')
      expect(response.body.data.tokens.accessToken).toBe('demo-access-token')
    })

    it('should handle admin demo login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'admin@example.com',
          password: 'admin123456'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user.email).toBe('admin@example.com')
      expect(response.body.data.user.role).toBe('admin')
      expect(response.body.data.tokens.accessToken).toBe('admin-access-token')
    })

    it('should return 400 for invalid credentials', async () => {
      global.mockPool.query.mockResolvedValueOnce({ rows: [] })

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid credentials')
    })

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@example.com'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      global.mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [{ id: '1' }] }) // Insert new user

      bcrypt.hash.mockResolvedValue('hashedPassword')

      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user.email).toBe('test@example.com')
    })

    it('should return 400 if user already exists', async () => {
      global.mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '1', email: 'test@example.com' }]
      })

      const response = await request(app)
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('already registered')
    })
  })

  describe('POST /auth/refresh', () => {
    it('should refresh valid token', async () => {
      const mockUser = { id: '1', email: 'test@example.com' }
      
      jwt.verify.mockReturnValue({ userId: '1' })
      global.mockPool.query.mockResolvedValueOnce({ rows: [mockUser] })
      jwt.sign.mockReturnValue('new-access-token')

      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: 'valid-refresh-token'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.accessToken).toBe('new-access-token')
    })

    it('should return 401 for invalid refresh token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token')
      })

      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })
  })
})