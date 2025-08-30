import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// Mock Vue I18n
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    useI18n: () => ({
      t: vi.fn((key: string) => key),
      locale: { value: 'en' },
      availableLocales: ['en', 'ja']
    }),
    createI18n: vi.fn(() => ({
      global: {
        t: vi.fn((key: string) => key),
        locale: 'en',
        availableLocales: ['en', 'ja']
      }
    }))
  }
})

// Mock Vue Router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn()
  }),
  useRoute: () => ({
    path: '/',
    params: {},
    query: {}
  }),
  createRouter: vi.fn(),
  createWebHistory: vi.fn()
}))

// Mock Axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }))
  }
}))

// Setup global mocks
const mockT = vi.fn((key: string) => key)
config.global.mocks = {
  $t: mockT,
  $tc: mockT
}

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})

// Mock fetch
global.fetch = vi.fn()

// Mock IntersectionObserver for lazy loading tests
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))