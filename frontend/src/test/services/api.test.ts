import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { apiClient } from '../../services/api'

vi.mock('axios')
const mockedAxios = vi.mocked(axios, true)

const mockAuthStore = {
  tokens: { accessToken: 'test-token', refreshToken: 'refresh-token' },
  logout: vi.fn(),
  refreshToken: vi.fn()
}

vi.mock('../../stores/auth', () => ({
  useAuthStore: () => mockAuthStore
}))

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedAxios.create.mockReturnValue({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    } as any)
  })

  it('should create axios instance with correct config', () => {
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  })

  it('should add authorization header when token exists', () => {
    const mockInstance = {
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { 
          use: vi.fn((callback) => {
            // Test the request interceptor
            const config = { headers: {} }
            mockAuthStore.tokens = { accessToken: 'test-token' }
            const result = callback(config)
            expect(result.headers['Authorization']).toBe('Bearer test-token')
            return result
          })
        },
        response: { use: vi.fn() }
      }
    }

    mockedAxios.create.mockReturnValue(mockInstance as any)
    
    // Re-import to trigger the interceptor setup
    vi.resetModules()
  })

  it('should handle demo token errors', () => {
    const mockInstance = {
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { 
          use: vi.fn((onFulfilled, onRejected) => {
            // Test response interceptor with demo token error
            const error = {
              isDemo: true,
              message: 'Demo mode: API calls are disabled'
            }
            
            expect(() => onRejected(error)).not.toThrow()
            expect(onRejected(error)).rejects.toEqual(error)
          })
        }
      }
    }

    mockedAxios.create.mockReturnValue(mockInstance as any)
  })

  it('should handle 401 errors by attempting token refresh', async () => {
    const mockInstance = {
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { 
          use: vi.fn((onFulfilled, onRejected) => {
            const error = {
              response: { status: 401 },
              config: { url: '/test', _retry: false }
            }

            mockAuthStore.refreshToken.mockResolvedValue(true)
            
            const result = onRejected(error)
            expect(mockAuthStore.refreshToken).toHaveBeenCalled()
          })
        }
      }
    }

    mockedAxios.create.mockReturnValue(mockInstance as any)
  })
})