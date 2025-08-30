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
          {{ $t('auth.register.title') }}
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Join AI Chatbot and start your intelligent conversation journey.
        </p>
      </div>

      <!-- Registration Form -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <form @submit.prevent="handleRegister" class="space-y-6">
          <!-- Name Field -->
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ $t('auth.register.name') }}
            </label>
            <div class="relative">
              <input
                id="name"
                v-model="form.name"
                type="text"
                required
                class="w-full px-4 py-3 pl-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.register.name')"
                :disabled="authStore.isLoading"
              />
              <User class="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
            </div>
            <div v-if="errors.name" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.name }}
            </div>
          </div>

          <!-- Email Field -->
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ $t('auth.register.email') }}
            </label>
            <div class="relative">
              <input
                id="email"
                v-model="form.email"
                type="email"
                required
                class="w-full px-4 py-3 pl-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.register.email')"
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
              {{ $t('auth.register.password') }}
            </label>
            <div class="relative">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                class="w-full px-4 py-3 pl-12 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.register.password')"
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
            <!-- Password strength indicator -->
            <div v-if="form.password" class="mt-2">
              <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">{{ $t('auth.register.passwordStrength') }}:</div>
              <div class="flex space-x-1">
                <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(0)]"></div>
                <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(1)]"></div>
                <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(2)]"></div>
                <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(3)]"></div>
              </div>
            </div>
          </div>

          <!-- Confirm Password Field -->
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {{ $t('auth.register.confirmPassword') }}
            </label>
            <div class="relative">
              <input
                id="confirmPassword"
                v-model="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                required
                class="w-full px-4 py-3 pl-12 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
:placeholder="$t('auth.register.confirmPassword')"
                :disabled="authStore.isLoading"
              />
              <Lock class="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
              <button
                type="button"
                @click="showConfirmPassword = !showConfirmPassword"
                class="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <Eye v-if="showConfirmPassword" class="w-5 h-5" />
                <EyeOff v-else class="w-5 h-5" />
              </button>
            </div>
            <div v-if="errors.confirmPassword" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.confirmPassword }}
            </div>
          </div>

          <!-- Terms and Privacy -->
          <div>
            <div class="flex items-start">
              <input
                id="acceptTerms"
                v-model="form.acceptTerms"
                type="checkbox"
                required
                class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 mt-1"
              />
              <label for="acceptTerms" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                <span v-html="$t('auth.register.agreeToTerms', {
                  termsLink: `<a href='/terms' class='text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300'>${$t('auth.register.termsOfService')}</a>`,
                  privacyLink: `<a href='/privacy' class='text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300'>${$t('auth.register.privacyPolicy')}</a>`
                })" />
              </label>
            </div>
            <div v-if="errors.acceptTerms" class="mt-1 text-sm text-red-600 dark:text-red-400">
              {{ errors.acceptTerms }}
            </div>
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
            {{ authStore.isLoading ? $t('common.loading') : $t('auth.register.createAccount') }}
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
                {{ $t('auth.register.hasAccount') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Login Link -->
        <div class="mt-6 text-center">
          <router-link
            to="/login"
            class="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
          >
            {{ $t('auth.register.signIn') }}
          </router-link>
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
  User,
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Loader2
} from 'lucide-vue-next'

// Stores
const authStore = useAuthStore()
const router = useRouter()

// Form state
const form = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false
})

const showPassword = ref(false)
const showConfirmPassword = ref(false)
const errors = ref<Record<string, string>>({})

// Computed
const isFormValid = computed(() => {
  return form.value.name.trim() && 
         form.value.email && 
         form.value.password && 
         form.value.confirmPassword &&
         form.value.acceptTerms &&
         form.value.email.includes('@') &&
         form.value.password.length >= 8 &&
         form.value.password === form.value.confirmPassword
})

const passwordStrength = computed(() => {
  const password = form.value.password
  let strength = 0
  
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^A-Za-z0-9]/.test(password)) strength++
  
  return strength
})

// Check if already authenticated
onMounted(() => {
  if (authStore.isAuthenticated) {
    router.push('/chat')
  }
  
  // Clear any previous errors
  authStore.clearError()
})

// Get password strength color
function getPasswordStrengthColor(index: number): string {
  const strength = passwordStrength.value
  if (index < strength) {
    if (strength <= 1) return 'bg-red-500'
    if (strength <= 2) return 'bg-yellow-500'
    if (strength <= 3) return 'bg-blue-500'
    return 'bg-green-500'
  }
  return 'bg-gray-200 dark:bg-gray-600'
}

// Validate form
function validateForm() {
  errors.value = {}
  
  if (!form.value.name.trim()) {
    errors.value.name = 'Full name is required'
  } else if (form.value.name.trim().length < 2) {
    errors.value.name = 'Name must be at least 2 characters'
  }
  
  if (!form.value.email) {
    errors.value.email = 'Email is required'
  } else if (!form.value.email.includes('@')) {
    errors.value.email = 'Please enter a valid email address'
  }
  
  if (!form.value.password) {
    errors.value.password = 'Password is required'
  } else if (form.value.password.length < 8) {
    errors.value.password = 'Password must be at least 8 characters'
  } else if (passwordStrength.value < 2) {
    errors.value.password = 'Password is too weak. Include uppercase, numbers, or special characters'
  }
  
  if (!form.value.confirmPassword) {
    errors.value.confirmPassword = 'Please confirm your password'
  } else if (form.value.password !== form.value.confirmPassword) {
    errors.value.confirmPassword = 'Passwords do not match'
  }
  
  if (!form.value.acceptTerms) {
    errors.value.acceptTerms = 'You must accept the terms and privacy policy'
  }
  
  return Object.keys(errors.value).length === 0
}

// Handle registration
async function handleRegister() {
  if (!validateForm()) {
    return
  }
  
  try {
    await authStore.register(
      form.value.name.trim(), 
      form.value.email, 
      form.value.password
    )
    
    // Redirect to chat after successful registration
    router.push('/chat')
    
  } catch (error) {
    console.error('Registration failed:', error)
    // Error is handled by the store
  }
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