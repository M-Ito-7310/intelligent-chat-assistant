import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, AuthTokens } from '../types/auth'
import { authApi } from '../services/authApi'
import { setLocale, type LocaleCode } from '../i18n'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null)
  const tokens = ref<AuthTokens | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const isAuthenticated = computed(() => {
    // If we have tokens, consider authenticated even if user profile is still loading
    return !!tokens.value && !!tokens.value.accessToken
  })

  // Actions
  async function login(email: string, password: string) {
    isLoading.value = true
    error.value = null

    try {
      const response = await authApi.login(email, password)
      
      user.value = response.data.user
      tokens.value = response.data.tokens
      
      // Store tokens in localStorage
      localStorage.setItem('accessToken', tokens.value.accessToken)
      localStorage.setItem('refreshToken', tokens.value.refreshToken)
      
      // Apply default language preference after successful login
      const defaultLanguage = localStorage.getItem('defaultLanguage')
      if (defaultLanguage) {
        setLocale(defaultLanguage as LocaleCode)
      }
      
      return response.data.user
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      console.error('Login error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function register(name: string, email: string, password: string) {
    isLoading.value = true
    error.value = null

    try {
      const response = await authApi.register(name, email, password)
      
      user.value = response.data.user
      tokens.value = response.data.tokens
      
      // Store tokens in localStorage
      localStorage.setItem('accessToken', tokens.value.accessToken)
      localStorage.setItem('refreshToken', tokens.value.refreshToken)
      
      // Apply default language preference after successful registration
      const defaultLanguage = localStorage.getItem('defaultLanguage')
      if (defaultLanguage) {
        setLocale(defaultLanguage as LocaleCode)
      }
      
      return response.data.user
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Registration failed'
      console.error('Registration error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      if (tokens.value?.refreshToken) {
        await authApi.logout(tokens.value.refreshToken)
      }
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      // Clear state regardless of API call success
      user.value = null
      tokens.value = null
      
      // Clear localStorage
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      
      // Reset language to default (Japanese) to clear session language
      setLocale('ja')
    }
  }

  async function refreshToken() {
    const refreshTokenValue = tokens.value?.refreshToken || localStorage.getItem('refreshToken')
    
    if (!refreshTokenValue) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await authApi.refreshToken(refreshTokenValue)
      
      user.value = response.data.user
      tokens.value = response.data.tokens
      
      // Update localStorage
      localStorage.setItem('accessToken', tokens.value.accessToken)
      localStorage.setItem('refreshToken', tokens.value.refreshToken)
      
      return tokens.value.accessToken
    } catch (err) {
      // If refresh fails, logout user
      await logout()
      throw err
    }
  }

  async function getProfile() {
    try {
      const response = await authApi.getProfile()
      user.value = response.data.user
      return response.data.user
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to get profile'
      console.error('Get profile error:', err)
      throw err
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    isLoading.value = true
    error.value = null

    try {
      await authApi.changePassword(currentPassword, newPassword)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to change password'
      console.error('Change password error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function initializeAuth() {
    // Try to restore from localStorage
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')
    
    if (accessToken && refreshToken) {
      tokens.value = { accessToken, refreshToken }
      
      // Try to get user profile
      try {
        await getProfile()
        // Auth initialized successfully
      } catch (error) {
        console.error('Failed to restore user profile:', error)
        // If profile fetch fails, clear tokens
        logout()
      }
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    // State
    user,
    tokens,
    isLoading,
    error,
    
    // Computed
    isAuthenticated,
    
    // Actions
    login,
    register,
    logout,
    refreshToken,
    getProfile,
    changePassword,
    initializeAuth,
    clearError
  }
})