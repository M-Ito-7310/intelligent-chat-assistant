<template>
  <div id="app" class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Navigation Header -->
    <nav class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <!-- Logo and Brand -->
          <div class="flex items-center">
            <router-link to="/" class="flex items-center space-x-3">
              <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <MessageSquare class="w-5 h-5 text-white" />
              </div>
              <span class="text-xl font-bold text-gray-900 dark:text-white">AI Chatbot</span>
            </router-link>
          </div>

          <!-- Navigation Links -->
          <div class="flex items-center space-x-4">
            <!-- Authenticated Navigation Links -->
            <template v-if="authStore.isAuthenticated">
              <router-link
                to="/chat"
                class="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                :class="{ 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white': $route.path === '/chat' }"
              >
                <MessageCircle class="w-4 h-4 mr-2" />
                {{ $t('navigation.chat') }}
              </router-link>
              
              <router-link
                to="/documents"
                class="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                :class="{ 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white': $route.path === '/documents' }"
              >
                <FileText class="w-4 h-4 mr-2" />
                {{ $t('navigation.documents') }}
              </router-link>
            </template>

            <!-- Language Switcher -->
            <LanguageSwitcher :compact="true" @language-changed="onLanguageChanged" />

            <!-- Theme Toggle -->
            <button
              @click="toggleTheme"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              :title="isDark ? $t('settings.theme.light') : $t('settings.theme.dark')"
            >
              <Sun v-if="isDark" class="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <Moon v-else class="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>

            <!-- Authenticated User Menu -->
            <div v-if="authStore.isAuthenticated" class="relative">
              <button
                @click="showUserMenu = !showUserMenu"
                class="flex items-center space-x-2 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {{ userInitials }}
                </div>
                <ChevronDown class="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>

              <!-- User Dropdown -->
              <div
                v-if="showUserMenu"
                class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
              >
                <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ authStore.user?.name }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ authStore.user?.email }}</p>
                </div>
                
                <router-link
                  to="/profile"
                  @click="showUserMenu = false"
                  class="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <User class="w-4 h-4 mr-2" />
                  {{ $t('navigation.profile') }}
                </router-link>
                
                <router-link
                  v-if="authStore.user?.role === 'admin'"
                  to="/admin"
                  @click="showUserMenu = false"
                  class="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Shield class="w-4 h-4 mr-2" />
                  {{ $t('navigation.admin') }}
                </router-link>
                
                <div class="border-t border-gray-200 dark:border-gray-700">
                  <button
                    @click="handleLogout"
                    class="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <LogOut class="w-4 h-4 mr-2" />
                    {{ $t('common.logout') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Login Button for Non-authenticated Users -->
            <template v-else>
              <router-link
                to="/login"
                class="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <User class="w-4 h-4 mr-2" />
                {{ $t('common.login') }}
              </router-link>
              
              <router-link
                to="/register"
                class="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {{ $t('common.register') }}
              </router-link>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import LanguageSwitcher from './components/LanguageSwitcher.vue'
import type { LocaleCode } from './i18n'
import { 
  MessageSquare, 
  MessageCircle, 
  FileText,
  Sun,
  Moon, 
  User, 
  ChevronDown,
  LogOut,
  Shield 
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const themeStore = useThemeStore()

// State
const showUserMenu = ref(false)

// Computed
const isDark = computed(() => themeStore.isDark)

const userInitials = computed(() => {
  const name = authStore.user?.name || 'User'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

// Lifecycle
onMounted(async () => {
  // Initialize theme
  themeStore.initTheme()
  
  // Try to restore authentication from stored token
  try {
    await authStore.initializeAuth()
    console.log('Authentication restored')
  } catch (error) {
    console.error('Failed to initialize auth:', error)
  }
  
  // Close user menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('.relative')) {
      showUserMenu.value = false
    }
  })
})

// Methods
function toggleTheme() {
  themeStore.toggleTheme()
}

function onLanguageChanged(locale: LocaleCode) {
  console.log('Language changed to:', locale)
  // You can add additional logic here if needed
  // For example, update user preferences in the backend
}

async function handleLogout() {
  try {
    await authStore.logout()
    router.push('/login')
  } catch (error) {
    console.error('Logout failed:', error)
  } finally {
    showUserMenu.value = false
  }
}
</script>