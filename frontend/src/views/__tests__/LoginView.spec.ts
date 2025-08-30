import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LoginView from '../LoginView.vue'
import { useAuthStore } from '../../stores/auth'

// Mock vue-router
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  currentRoute: {
    value: {
      query: {},
    },
  },
}

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => mockRouter.currentRoute.value,
}))

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: { value: 'en' },
  }),
}))

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should render login form', () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    expect(wrapper.find('h2').text()).toContain('auth.login.title')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('should validate email format', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const emailInput = wrapper.find('input[type="email"]')
    const form = wrapper.find('form')

    // Invalid email
    await emailInput.setValue('invalid-email')
    await form.trigger('submit')

    // Check if form submission was prevented
    const authStore = useAuthStore()
    expect(authStore.login).not.toHaveBeenCalled()
  })

  it('should call login with correct credentials', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    authStore.login = vi.fn().mockResolvedValue(undefined)

    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const form = wrapper.find('form')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('password123')
    await form.trigger('submit')

    expect(authStore.login).toHaveBeenCalledWith('test@example.com', 'password123')
  })

  it('should redirect after successful login', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    authStore.login = vi.fn().mockResolvedValue(undefined)

    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const form = wrapper.find('form')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('password123')
    await form.trigger('submit')

    await wrapper.vm.$nextTick()

    expect(mockRouter.push).toHaveBeenCalledWith('/chat')
  })

  it('should handle login with redirect query', async () => {
    mockRouter.currentRoute.value.query = { redirect: '/documents' }

    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    authStore.login = vi.fn().mockResolvedValue(undefined)

    const form = wrapper.find('form')
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('password123')
    await form.trigger('submit')

    await wrapper.vm.$nextTick()

    expect(mockRouter.push).toHaveBeenCalledWith('/documents')
  })

  it('should display error message on login failure', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    authStore.login = vi.fn().mockRejectedValue(new Error('Invalid credentials'))

    const form = wrapper.find('form')
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('wrong-password')
    await form.trigger('submit')

    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Invalid credentials')
  })

  it('should handle demo login', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    authStore.loginDemo = vi.fn().mockResolvedValue(undefined)

    const demoButton = wrapper.find('button.demo-login')
    await demoButton.trigger('click')

    expect(authStore.loginDemo).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith('/chat')
  })

  it('should show loading state during login', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const authStore = useAuthStore()
    
    // Mock login to take time
    authStore.login = vi.fn().mockImplementation(() => {
      authStore.loading = true
      return new Promise(resolve => setTimeout(resolve, 100))
    })

    const form = wrapper.find('form')
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const submitButton = wrapper.find('button[type="submit"]')

    await emailInput.setValue('test@example.com')
    await passwordInput.setValue('password123')
    
    const loginPromise = form.trigger('submit')
    
    await wrapper.vm.$nextTick()
    
    // Check loading state
    expect(submitButton.attributes('disabled')).toBeDefined()
    
    await loginPromise
  })

  it('should toggle password visibility', async () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const passwordInput = wrapper.find('input[type="password"]')
    const toggleButton = wrapper.find('.password-toggle')

    expect(passwordInput.attributes('type')).toBe('password')

    await toggleButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(passwordInput.attributes('type')).toBe('text')

    await toggleButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(passwordInput.attributes('type')).toBe('password')
  })

  it('should have link to register page', () => {
    const wrapper = mount(LoginView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          RouterLink: true,
        },
      },
    })

    const registerLink = wrapper.find('a[href="/register"]')
    expect(registerLink.exists()).toBe(true)
    expect(registerLink.text()).toContain('auth.login.signUp')
  })
})