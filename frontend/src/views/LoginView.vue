<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="max-w-md w-full space-y-8">
      <!-- Header -->
      <div class="text-center">
        <div class="flex justify-center mb-6">
          <div class="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
            <MessageSquare class="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
          {{ $t('auth.login.title') }}
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {{ $t('auth.login.welcomeBack') }}
        </p>
      </div>

      <!-- Login Form -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <form @submit.prevent="handleLogin" class="space-y-6">
          <!-- Email Field -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ $t('auth.login.email') }}
            </label>
            <div class="relative">
              <input
                id="email"
                v-model="form.email"
                type="email"
                required
                class="w-full px-4 py-3 pl-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.login.emailPlaceholder')"
                :disabled="authStore.isLoading"
              />
              <Mail class="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
            </div>
            <div v-if="errors.email" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.email }}
            </div>
          </div>

          <!-- Password Field -->
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ $t('auth.login.password') }}
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                class="w-full px-4 py-3 pl-12 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.login.passwordPlaceholder')"
                :disabled="authStore.isLoading"
              />
              <Lock class="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <Eye v-if="showPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
            <div v-if="errors.password" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.password }}
            </div>
          </div>

          <!-- Remember Me & Forgot Password -->
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <input
                id="remember"
                v-model="form.remember"
                type="checkbox"
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
              <label for="remember" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                {{ $t('auth.login.rememberMe') }}
              </label>
            </div>
            <router-link
              to="/forgot-password"
              class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
            >
              {{ $t('auth.login.forgotPassword') }}
            </router-link>
          </div>

          <!-- Error Message -->
          <div v-if="authStore.error" class="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
            <div class="flex">
              <AlertCircle class="h-5 w-5 text-red-400" />
              <div class="ml-3">
                <p class="text-sm text-red-700 dark:text-red-400">
                  {{ authStore.error }}
                </p>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="authStore.isLoading || !isFormValid"
            class="w-full flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Loader2 v-if="authStore.isLoading" class="animate-spin -ml-1 mr-2 h-4 w-4" />
            {{ authStore.isLoading ? $t('common.loading') : $t('auth.login.signInButton') }}
          </button>
        </form>

        <!-- Divider -->
        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {{ $t('auth.login.noAccount') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Register Link -->
        <div class="mt-6 text-center">
          <router-link
            to="/register"
            class="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
          >
            {{ $t('auth.login.createAccount') }}
          </router-link>
        </div>
      </div>

      <!-- Demo Credentials -->
      <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div class="flex">
          <Info class="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <div class="ml-3">
            <h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              {{ $t('demo.title') }}
            </h3>
            <div class="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>{{ $t('demo.useCredentials') }}</p>
              <div class="mt-2 space-y-3">
              <div>
                <p class="font-medium text-yellow-800 dark:text-yellow-200 mb-1">{{ $t('demo.regularUser') }}:</p>
                <p><strong>{{ $t('auth.login.email') }}:</strong> demo@example.com</p>
                <p><strong>{{ $t('auth.login.password') }}:</strong> demo123456</p>
              </div>
              <div class="border-t border-yellow-300 dark:border-yellow-600 pt-2">
                <p class="font-medium text-yellow-800 dark:text-yellow-200 mb-1">{{ $t('demo.adminUser') }}:</p>
                <p><strong>{{ $t('auth.login.email') }}:</strong> admin@example.com</p>
                <p><strong>{{ $t('auth.login.password') }}:</strong> admin123456</p>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { 
  MessageSquare, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Loader2,
  Info
} from 'lucide-vue-next'

// Stores
const authStore = useAuthStore()
const router = useRouter()

// Form state
const form = ref({
  email: '',
  password: '',
  remember: false
})

const showPassword = ref(false)
const errors = ref<Record<string, string>>({})

// Computed
const isFormValid = computed(() => {
  return form.value.email && 
         form.value.password && 
         form.value.email.includes('@') &&
         form.value.password.length >= 6
})

// Check if already authenticated
onMounted(() => {
  if (authStore.isAuthenticated) {
    router.push('/chat')
  }
  
  // Clear any previous errors
  authStore.clearError()
})

// Validate form
function validateForm() {
  errors.value = {}
  
  if (!form.value.email) {
    errors.value.email = 'Email is required'
  } else if (!form.value.email.includes('@')) {
    errors.value.email = 'Please enter a valid email address'
  }
  
  if (!form.value.password) {
    errors.value.password = 'Password is required'
  } else if (form.value.password.length < 6) {
    errors.value.password = 'Password must be at least 6 characters'
  }
  
  return Object.keys(errors.value).length === 0
}

// Handle login
async function handleLogin() {
  if (!validateForm()) {
    return
  }
  
  try {
    await authStore.login(form.value.email, form.value.password)
    
    // Store remember me preference
    if (form.value.remember) {
      localStorage.setItem('rememberMe', 'true')
    }
    
    // Redirect based on user role and intended page
    const redirectTo = router.currentRoute.value.query.redirect as string
    
    if (redirectTo) {
      router.push(redirectTo)
    } else if (authStore.user?.role === 'admin') {
      router.push('/admin')
    } else {
      router.push('/chat')
    }
    
  } catch (error) {
    console.error('Login failed:', error)
    // Error is handled by the store
  }
}

// Auto-fill demo credentials
function fillDemoCredentials() {
  form.value.email = 'demo@example.com'
  form.value.password = 'demo123456'
}
</script>

<style scoped>
/* Custom focus styles */
input:focus {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Animation for form elements */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>