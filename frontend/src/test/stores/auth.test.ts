import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../../stores/auth'

// Mock services
vi.mock('../../services/api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
}))

vi.mock('../../services/authApi', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
    getCurrentUser: vi.fn()
  }
}))

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('should initialize with default state', () => {
    const store = useAuthStore()
    
    expect(store.user).toBeNull()
    expect(store.tokens).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.isLoading).toBe(false)
  })

  it('should handle successful login', async () => {
    const store = useAuthStore()
    const mockResponse = {
      success: true,
      data: {
        user: { id: '1', email: 'test@example.com', name: 'Test User' },
        tokens: { accessToken: 'access-token', refreshToken: 'refresh-token' }
      }
    }

    const { authApi } = await import('../../services/authApi')
    vi.mocked(authApi.login).mockResolvedValue(mockResponse)

    await store.login('test@example.com', 'password')

    expect(store.user).toEqual(mockResponse.data.user)
    expect(store.tokens).toEqual(mockResponse.data.tokens)
    expect(store.isAuthenticated).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'auth_tokens',
      JSON.stringify(mockResponse.data.tokens)
    )
  })

  it('should handle failed login', async () => {
    const store = useAuthStore()
    mockApiClient.post.mockRejectedValue(new Error('Invalid credentials'))

    await expect(store.login('test@example.com', 'wrong-password'))
      .rejects.toThrow('Invalid credentials')
    
    expect(store.user).toBeNull()
    expect(store.tokens).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('should handle logout', async () => {
    const store = useAuthStore()
    
    // Set up authenticated state
    store.user = { id: '1', email: 'test@example.com', name: 'Test User' }
    store.tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' }

    await store.logout()

    expect(store.user).toBeNull()
    expect(store.tokens).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_tokens')
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_user')
  })

  it('should initialize auth from localStorage', async () => {
    const mockTokens = { accessToken: 'access-token', refreshToken: 'refresh-token' }
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' }
    
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key === 'auth_tokens') return JSON.stringify(mockTokens)
      if (key === 'auth_user') return JSON.stringify(mockUser)
      return null
    })

    mockApiClient.get.mockResolvedValue({ data: { success: true, data: { user: mockUser } } })

    const store = useAuthStore()
    await store.initializeAuth()

    expect(store.tokens).toEqual(mockTokens)
    expect(store.user).toEqual(mockUser)
    expect(store.isAuthenticated).toBe(true)
  })

  it('should handle demo login', async () => {
    const store = useAuthStore()
    
    await store.login('demo@example.com', 'demo123456')

    expect(store.user?.email).toBe('demo@example.com')
    expect(store.user?.role).toBe('user')
    expect(store.tokens?.accessToken).toBe('demo-access-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('should handle admin demo login', async () => {
    const store = useAuthStore()
    
    await store.login('admin@example.com', 'admin123456')

    expect(store.user?.email).toBe('admin@example.com')
    expect(store.user?.role).toBe('admin')
    expect(store.tokens?.accessToken).toBe('admin-access-token')
    expect(store.isAuthenticated).toBe(true)
  })
})