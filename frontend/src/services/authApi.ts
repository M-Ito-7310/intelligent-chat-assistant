import type { 
  ApiResponse, 
  AuthResponse, 
  LoginRequest, 
  RegisterRequest, 
  ChangePasswordRequest,
  User 
} from '../types/auth'
import { apiClient } from './api'

export const authApi = {
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    // Demo mode: handle demo credentials locally
    if (email === 'demo@example.com' && password === 'demo123456') {
      return {
        success: true,
        data: {
          user: {
            id: 'demo-user-id',
            email: 'demo@example.com',
            name: 'Demo User',
            role: 'user',
            created_at: '2024-01-01T00:00:00Z',
            stats: {
              conversation_count: 5,
              document_count: 3
            }
          },
          tokens: {
            accessToken: 'demo-access-token',
            refreshToken: 'demo-refresh-token'
          }
        }
      }
    }
    
    if (email === 'admin@example.com' && password === 'admin123456') {
      return {
        success: true,
        data: {
          user: {
            id: 'admin-user-id',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'admin',
            created_at: '2024-01-01T00:00:00Z',
            stats: {
              conversation_count: 10,
              document_count: 15
            }
          },
          tokens: {
            accessToken: 'admin-access-token',
            refreshToken: 'admin-refresh-token'
          }
        }
      }
    }
    
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', {
      email,
      password
    })
    return response.data
  },

  async register(name: string, email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', {
      name,
      email,
      password
    })
    return response.data
  },

  async logout(refreshToken: string): Promise<ApiResponse<void>> {
    const response = await apiClient.post<ApiResponse<void>>('/auth/logout', {
      refreshToken
    })
    return response.data
  },

  async refreshToken(refreshToken: string): Promise<ApiResponse<AuthResponse>> {
    const response = await apiClient.post<ApiResponse<AuthResponse>>('/auth/refresh', {
      refreshToken
    })
    return response.data
  },

  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    // Demo mode: return demo profile based on stored token
    const token = localStorage.getItem('accessToken')
    if (token === 'demo-access-token') {
      return {
        success: true,
        data: {
          user: {
            id: 'demo-user-id',
            email: 'demo@example.com',
            name: 'Demo User',
            role: 'user',
            created_at: '2024-01-01T00:00:00Z',
            stats: {
              conversation_count: 5,
              document_count: 3
            }
          }
        }
      }
    }
    
    if (token === 'admin-access-token') {
      return {
        success: true,
        data: {
          user: {
            id: 'admin-user-id',
            email: 'admin@example.com',
            name: 'Admin User',
            role: 'admin',
            created_at: '2024-01-01T00:00:00Z',
            stats: {
              conversation_count: 10,
              document_count: 15
            }
          }
        }
      }
    }
    
    const response = await apiClient.get<ApiResponse<{ user: User }>>('/auth/profile')
    return response.data
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    const response = await apiClient.post<ApiResponse<void>>('/auth/change-password', {
      currentPassword,
      newPassword
    })
    return response.data
  }
}