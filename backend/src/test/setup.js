// Test environment setup
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-key'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.PORT = '3001'

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}

// Cleanup after all tests
afterAll(async () => {
  // Close database connections, if any
  if (global.db) {
    await global.db.close()
  }
  // Clear all mocks
  jest.clearAllMocks()
})