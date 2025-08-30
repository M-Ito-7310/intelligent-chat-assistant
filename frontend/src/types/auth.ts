export interface User {
  id: string
  email: string
  name: string
  role?: 'user' | 'admin'
  avatar_url?: string
  created_at: string
  stats?: {
    conversation_count: number
    document_count: number
  }
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
  error?: string
}

export interface AuthResponse {
  user: User
  tokens: AuthTokens
}