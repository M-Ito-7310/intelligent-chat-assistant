import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    
    // Skip API calls for demo tokens to avoid 401 errors
    if (token === 'demo-access-token' || token === 'admin-access-token') {
      // Return a rejected promise to stop the request
      return Promise.reject({
        isDemo: true,
        message: 'Demo mode: API calls are disabled'
      })
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response
  },
  async (error) => {
    // Handle demo mode errors
    if (error.isDemo) {
      return Promise.reject(error)
    }
    
    const originalRequest = error.config

    // If error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          throw new Error('No refresh token')
        }
        
        // Skip refresh for demo tokens
        if (refreshToken === 'demo-refresh-token' || refreshToken === 'admin-refresh-token') {
          throw new Error('Demo tokens cannot be refreshed')
        }

        // Try to refresh token
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken
        })

        const { accessToken, refreshToken: newRefreshToken } = response.data.data.tokens

        // Update stored tokens
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', newRefreshToken)

        // Update authorization header and retry request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return apiClient(originalRequest)

      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        
        // Redirect to login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

// Generic API response handler
export const handleApiError = (error: any): string => {
  if (error.response) {
    // Server responded with error status
    const message = error.response.data?.message || error.response.data?.error
    return message || `Server error: ${error.response.status}`
  } else if (error.request) {
    // Request was made but no response received
    return 'Network error: Unable to reach server'
  } else {
    // Something else happened
    return error.message || 'An unexpected error occurred'
  }
}

// Server-Sent Events for streaming
export const createEventSource = (url: string, options: {
  onMessage?: (data: any) => void
  onError?: (error: Event) => void
  onOpen?: (event: Event) => void
} = {}) => {
  const token = localStorage.getItem('accessToken')
  const fullUrl = `${API_BASE_URL}${url}`
  
  // For SSE, we need to include auth in the URL or use a different approach
  // Since EventSource doesn't support custom headers, we'll handle auth differently
  const eventSource = new EventSource(fullUrl)

  eventSource.onopen = (event) => {
    // SSE connection opened - using production logging
    options.onOpen?.(event)
  }

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      options.onMessage?.(data)
    } catch (error) {
      console.error('Error parsing SSE message:', error)
    }
  }

  eventSource.onerror = (event) => {
    console.error('SSE error:', event)
    options.onError?.(event)
  }

  return eventSource
}