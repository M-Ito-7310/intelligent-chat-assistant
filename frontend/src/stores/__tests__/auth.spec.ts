import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { apiClient } from '../../services/api'

// Mock the API client
vi.mock('../../services/api', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

// Mock router
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

describe('Auth Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    setActivePinia(createPinia())
    // Clear all mocks
    vi.clearAllMocks()
    // Clear localStorage
    localStorage.clear()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const store = useAuthStore()
      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.loading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('should load token from localStorage on init', () => {
      const mockToken = 'mock-access-token'
      const mockUser = { id: 1, email: 'test@example.com' }
      
      localStorage.setItem('accessToken', mockToken)
      localStorage.setItem('user', JSON.stringify(mockUser))
      
      const store = useAuthStore()
      store.initializeAuth()
      
      expect(store.token).toBe(mockToken)
      expect(store.user).toEqual(mockUser)
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      const store = useAuthStore()
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: { id: 1, email: 'test@example.com' },
            tokens: {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
            },
          },
        },
      }

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse)

      await store.login('test@example.com', 'password123')

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      })
      expect(store.user).toEqual(mockResponse.data.data.user)
      expect(store.token).toBe('access-token')
      expect(store.isAuthenticated).toBe(true)
      expect(localStorage.getItem('accessToken')).toBe('access-token')
      expect(localStorage.getItem('refreshToken')).toBe('refresh-token')
    })

    it('should handle login failure', async () => {
      const store = useAuthStore()
      const mockError = new Error('Invalid credentials')
      
      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError)

      await expect(store.login('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials')
      
      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.error).toBe('Invalid credentials')
    })

    it('should handle demo login', async () => {
      const store = useAuthStore()
      
      await store.loginDemo()

      expect(store.user).toEqual({
        id: 'demo-user',
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'user',
      })
      expect(store.token).toBe('demo-access-token')
      expect(store.isAuthenticated).toBe(true)
      expect(localStorage.getItem('accessToken')).toBe('demo-access-token')
    })
  })

  describe('Logout', () => {
    it('should logout successfully', async () => {
      const store = useAuthStore()
      
      // Set up authenticated state
      store.user = { id: 1, email: 'test@example.com' }
      store.token = 'access-token'
      localStorage.setItem('accessToken', 'access-token')
      localStorage.setItem('refreshToken', 'refresh-token')

      await store.logout()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(localStorage.getItem('accessToken')).toBeNull()
      expect(localStorage.getItem('refreshToken')).toBeNull()
      expect(mockRouter.push).toHaveBeenCalledWith('/login')
    })
  })

  describe('Register', () => {
    it('should register successfully', async () => {
      const store = useAuthStore()
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: { id: 1, email: 'new@example.com', name: 'New User' },
            tokens: {
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
            },
          },
        },
      }

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse)

      await store.register('new@example.com', 'password123', 'New User')

      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      })
      expect(store.user).toEqual(mockResponse.data.data.user)
      expect(store.token).toBe('new-access-token')
      expect(store.isAuthenticated).toBe(true)
    })

    it('should handle registration failure', async () => {
      const store = useAuthStore()
      const mockError = {
        response: {
          data: {
            message: 'Email already exists',
          },
        },
      }

      vi.mocked(apiClient.post).mockRejectedValueOnce(mockError)

      await expect(store.register('existing@example.com', 'password123', 'User')).rejects.toThrow()
      
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('Fetch User', () => {
    it('should fetch current user successfully', async () => {
      const store = useAuthStore()
      const mockResponse = {
        data: {
          success: true,
          data: {
            user: { id: 1, email: 'test@example.com', name: 'Test User' },
          },
        },
      }

      store.token = 'access-token'
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse)

      await store.fetchUser()

      expect(apiClient.get).toHaveBeenCalledWith('/auth/me')
      expect(store.user).toEqual(mockResponse.data.data.user)
    })

    it('should handle fetch user failure', async () => {
      const store = useAuthStore()
      const mockError = new Error('Unauthorized')

      store.token = 'invalid-token'
      vi.mocked(apiClient.get).mockRejectedValueOnce(mockError)

      await store.fetchUser()

      expect(store.user).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('Computed Properties', () => {
    it('should correctly compute isAuthenticated', () => {
      const store = useAuthStore()
      
      expect(store.isAuthenticated).toBe(false)
      
      store.token = 'some-token'
      store.user = { id: 1, email: 'test@example.com' }
      expect(store.isAuthenticated).toBe(true)
      
      store.token = null
      expect(store.isAuthenticated).toBe(false)
    })

    it('should correctly compute isAdmin', () => {
      const store = useAuthStore()
      
      expect(store.isAdmin).toBe(false)
      
      store.user = { id: 1, email: 'test@example.com', role: 'user' }
      expect(store.isAdmin).toBe(false)
      
      store.user = { id: 2, email: 'admin@example.com', role: 'admin' }
      expect(store.isAdmin).toBe(true)
    })

    it('should correctly compute isDemo', () => {
      const store = useAuthStore()
      
      expect(store.isDemo).toBe(false)
      
      store.token = 'regular-token'
      expect(store.isDemo).toBe(false)
      
      store.token = 'demo-access-token'
      expect(store.isDemo).toBe(true)
      
      store.token = 'admin-access-token'
      expect(store.isDemo).toBe(true)
    })
  })
})