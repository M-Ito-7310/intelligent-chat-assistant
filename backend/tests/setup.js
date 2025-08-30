import { jest } from '@jest/globals'

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/ai_chatbot_test'
process.env.REDIS_URL = 'redis://localhost:6379/1'

// Mock external APIs
global.mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn()
    }
  },
  embeddings: {
    create: jest.fn()
  }
}

global.mockHuggingFace = {
  chatCompletion: jest.fn(),
  featureExtraction: jest.fn()
}

// Mock database connections
global.mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn()
}

global.mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  flushall: jest.fn()
}

// Mock file uploads
global.mockMulter = {
  single: jest.fn(() => (req, res, next) => next()),
  array: jest.fn(() => (req, res, next) => next())
}

// Setup and teardown
beforeAll(async () => {
  // Setup test database if needed
})

afterAll(async () => {
  // Cleanup test database
})

beforeEach(() => {
  // Reset all mocks
  jest.clearAllMocks()
})

afterEach(() => {
  // Cleanup after each test
})