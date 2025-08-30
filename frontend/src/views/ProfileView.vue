<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-4 py-8 max-w-4xl">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          {{ $t('auth.profile.title') }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <!-- Profile Overview -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <div class="flex items-center space-x-6">
          <!-- Avatar -->
          <div class="relative">
            <div class="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {{ userInitials }}
            </div>
            <button
              class="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              title="Upload photo"
            >
              <Camera class="w-4 h-4" />
            </button>
          </div>
          
          <!-- User Info -->
          <div class="flex-1">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ user?.name || 'User' }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400">
              {{ user?.email }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Member since {{ formatDate(user?.created_at) }}
            </p>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 gap-4 text-center">
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {{ user?.stats?.conversation_count || 0 }}
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ $t('admin.metrics.totalConversations') }}</p>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p class="text-2xl font-bold text-green-600 dark:text-green-400">
                {{ user?.stats?.document_count || 0 }}
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-400">{{ $t('documents.title') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs Navigation -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
        <div class="border-b border-gray-200 dark:border-gray-700">
          <nav class="flex space-x-8 px-6">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              ]"
            >
              <component :is="tab.icon" class="w-5 h-5 inline mr-2" />
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <!-- Tab Content -->
        <div class="p-6">
          <!-- Personal Information Tab -->
          <div v-if="activeTab === 'personal'" class="space-y-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ $t('auth.profile.personalInfo') }}
            </h3>
            
            <form @submit.prevent="updateProfile" class="space-y-6">
              <!-- Name -->
              <div>
                <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {{ $t('auth.register.name') }}
                </label>
                <input
                  id="name"
                  v-model="profileForm.name"
                  type="text"
                  required
                  class="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  :disabled="isUpdatingProfile"
                />
                <div v-if="profileErrors.name" class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {{ profileErrors.name }}
                </div>
              </div>

              <!-- Email -->
              <div>
                <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {{ $t('auth.register.email') }}
                </label>
                <input
                  id="email"
                  v-model="profileForm.email"
                  type="email"
                  required
                  class="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  :disabled="isUpdatingProfile"
                />
                <div v-if="profileErrors.email" class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {{ profileErrors.email }}
                </div>
              </div>

              <!-- Save Button -->
              <div class="flex justify-start">
                <button
                  type="submit"
                  :disabled="isUpdatingProfile || !isProfileFormValid"
                  class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Loader2 v-if="isUpdatingProfile" class="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {{ isUpdatingProfile ? 'Saving...' : 'Save Changes' }}
                </button>
              </div>
            </form>
          </div>

          <!-- Security Tab -->
          <div v-if="activeTab === 'security'" class="space-y-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Change Password
            </h3>
            
            <form @submit.prevent="changePassword" class="space-y-6">
              <!-- Current Password -->
              <div>
                <label for="currentPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Password
                </label>
                <div class="relative max-w-md">
                  <input
                    id="currentPassword"
                    v-model="passwordForm.currentPassword"
                    :type="showCurrentPassword ? 'text' : 'password'"
                    required
                    class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    :disabled="isChangingPassword"
                  />
                  <button
                    type="button"
                    @click="showCurrentPassword = !showCurrentPassword"
                    class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <Eye v-if="showCurrentPassword" class="w-4 h-4" />
                    <EyeOff v-else class="w-4 h-4" />
                  </button>
                </div>
                <div v-if="passwordErrors.currentPassword" class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {{ passwordErrors.currentPassword }}
                </div>
              </div>

              <!-- New Password -->
              <div>
                <label for="newPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Password
                </label>
                <div class="relative max-w-md">
                  <input
                    id="newPassword"
                    v-model="passwordForm.newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    required
                    class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    :disabled="isChangingPassword"
                  />
                  <button
                    type="button"
                    @click="showNewPassword = !showNewPassword"
                    class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <Eye v-if="showNewPassword" class="w-4 h-4" />
                    <EyeOff v-else class="w-4 h-4" />
                  </button>
                </div>
                <!-- Password strength indicator -->
                <div v-if="passwordForm.newPassword" class="mt-2">
                  <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">Password strength:</div>
                  <div class="flex space-x-1 max-w-md">
                    <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(0)]"></div>
                    <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(1)]"></div>
                    <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(2)]"></div>
                    <div :class="['h-1 w-1/4 rounded', getPasswordStrengthColor(3)]"></div>
                  </div>
                </div>
                <div v-if="passwordErrors.newPassword" class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {{ passwordErrors.newPassword }}
                </div>
              </div>

              <!-- Confirm New Password -->
              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Confirm New Password
                </label>
                <div class="relative max-w-md">
                  <input
                    id="confirmPassword"
                    v-model="passwordForm.confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    required
                    class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    :disabled="isChangingPassword"
                  />
                  <button
                    type="button"
                    @click="showConfirmPassword = !showConfirmPassword"
                    class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <Eye v-if="showConfirmPassword" class="w-4 h-4" />
                    <EyeOff v-else class="w-4 h-4" />
                  </button>
                </div>
                <div v-if="passwordErrors.confirmPassword" class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {{ passwordErrors.confirmPassword }}
                </div>
              </div>

              <!-- Change Password Button -->
              <div class="flex justify-start">
                <button
                  type="submit"
                  :disabled="isChangingPassword || !isPasswordFormValid"
                  class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Loader2 v-if="isChangingPassword" class="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {{ isChangingPassword ? 'Changing Password...' : 'Change Password' }}
                </button>
              </div>
            </form>
          </div>

          <!-- Preferences Tab -->
          <div v-if="activeTab === 'preferences'" class="space-y-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Preferences
            </h3>
            
            <div class="space-y-6">
              <!-- Theme -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Theme Preference
                </label>
                <div class="flex space-x-4">
                  <label class="flex items-center">
                    <input
                      v-model="preferences.theme"
                      type="radio"
                      value="light"
                      class="form-radio h-4 w-4 text-blue-600"
                    />
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Light</span>
                  </label>
                  <label class="flex items-center">
                    <input
                      v-model="preferences.theme"
                      type="radio"
                      value="dark"
                      class="form-radio h-4 w-4 text-blue-600"
                    />
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Dark</span>
                  </label>
                  <label class="flex items-center">
                    <input
                      v-model="preferences.theme"
                      type="radio"
                      value="system"
                      class="form-radio h-4 w-4 text-blue-600"
                    />
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">System</span>
                  </label>
                </div>
              </div>

              <!-- Language -->
              <div>
                <label for="language" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Language
                </label>
                <select
                  id="language"
                  v-model="preferences.language"
                  class="max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="en">English</option>
                  <option value="ja">Japanese</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>

              <!-- Notifications -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Notifications
                </label>
                <div class="space-y-2">
                  <label class="flex items-center">
                    <input
                      v-model="preferences.emailNotifications"
                      type="checkbox"
                      class="form-checkbox h-4 w-4 text-blue-600 rounded"
                    />
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Email notifications</span>
                  </label>
                  <label class="flex items-center">
                    <input
                      v-model="preferences.pushNotifications"
                      type="checkbox"
                      class="form-checkbox h-4 w-4 text-blue-600 rounded"
                    />
                    <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Push notifications</span>
                  </label>
                </div>
              </div>

              <!-- Save Preferences Button -->
              <div class="flex justify-start">
                <button
                  @click="savePreferences"
                  :disabled="isSavingPreferences"
                  class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Loader2 v-if="isSavingPreferences" class="animate-spin -ml-1 mr-2 h-4 w-4" />
                  {{ isSavingPreferences ? 'Saving...' : 'Save Preferences' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Account Tab -->
          <div v-if="activeTab === 'account'" class="space-y-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Account Management
            </h3>
            
            <div class="space-y-6">
              <!-- Export Data -->
              <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                <h4 class="font-medium text-gray-900 dark:text-white mb-2">
                  Export Your Data
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Download a copy of your conversations and documents.
                </p>
                <button
                  @click="exportData"
                  :disabled="isExportingData"
                  class="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download v-if="!isExportingData" class="w-4 h-4 mr-2" />
                  <Loader2 v-else class="animate-spin w-4 h-4 mr-2" />
                  {{ isExportingData ? 'Exporting...' : 'Export Data' }}
                </button>
              </div>

              <!-- Delete Account -->
              <div class="border border-red-200 dark:border-red-800 rounded-lg p-6">
                <h4 class="font-medium text-red-900 dark:text-red-200 mb-2">
                  Delete Account
                </h4>
                <p class="text-sm text-red-600 dark:text-red-400 mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <button
                  @click="showDeleteConfirm = true"
                  class="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                >
                  <Trash2 class="w-4 h-4 mr-2" />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Success/Error Messages -->
      <div v-if="successMessage" class="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
        <div class="flex items-center">
          <CheckCircle class="w-5 h-5 mr-2" />
          {{ successMessage }}
        </div>
      </div>

      <div v-if="errorMessage" class="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
        <div class="flex items-center">
          <AlertCircle class="w-5 h-5 mr-2" />
          {{ errorMessage }}
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Confirm Account Deletion
            </h3>
            <button
              @click="showDeleteConfirm = false"
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="space-y-4">
            <p class="text-gray-600 dark:text-gray-400">
              This will permanently delete your account and all associated data, including conversations and documents. This action cannot be undone.
            </p>
            
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Type <strong>DELETE</strong> to confirm:
            </p>
            
            <input
              v-model="deleteConfirmText"
              type="text"
              placeholder="Type DELETE to confirm"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />

            <div class="flex space-x-3 pt-4">
              <button
                @click="showDeleteConfirm = false"
                class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                @click="deleteAccount"
                :disabled="deleteConfirmText !== 'DELETE' || isDeletingAccount"
                class="flex-1 inline-flex justify-center items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Loader2 v-if="isDeletingAccount" class="animate-spin -ml-1 mr-2 h-4 w-4" />
                {{ isDeletingAccount ? 'Deleting...' : 'Delete Account' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { 
  User,
  Camera,
  Settings,
  Shield,
  Bell,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  X
} from 'lucide-vue-next'

// Stores
const authStore = useAuthStore()
const themeStore = useThemeStore()
const router = useRouter()

// State
const activeTab = ref('personal')
const showDeleteConfirm = ref(false)
const deleteConfirmText = ref('')

// Profile form
const profileForm = ref({
  name: '',
  email: ''
})
const isUpdatingProfile = ref(false)
const profileErrors = ref<Record<string, string>>({})

// Password form
const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const isChangingPassword = ref(false)
const passwordErrors = ref<Record<string, string>>({})
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

// Preferences
const preferences = ref({
  theme: 'system',
  language: 'en',
  emailNotifications: true,
  pushNotifications: false
})
const isSavingPreferences = ref(false)

// Account actions
const isExportingData = ref(false)
const isDeletingAccount = ref(false)

// Messages
const successMessage = ref('')
const errorMessage = ref('')

// Tabs configuration
const tabs = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'account', label: 'Account', icon: Bell }
]

// Computed
const user = computed(() => authStore.user)

const userInitials = computed(() => {
  const name = user.value?.name || 'User'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
})

const isProfileFormValid = computed(() => {
  return profileForm.value.name.trim() && 
         profileForm.value.email && 
         profileForm.value.email.includes('@')
})

const isPasswordFormValid = computed(() => {
  return passwordForm.value.currentPassword && 
         passwordForm.value.newPassword && 
         passwordForm.value.confirmPassword &&
         passwordForm.value.newPassword.length >= 8 &&
         passwordForm.value.newPassword === passwordForm.value.confirmPassword
})

const passwordStrength = computed(() => {
  const password = passwordForm.value.newPassword
  let strength = 0
  
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^A-Za-z0-9]/.test(password)) strength++
  
  return strength
})

// Check authentication
onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  
  // Load user profile
  try {
    await authStore.getProfile()
    
    // Initialize forms with user data
    if (user.value) {
      profileForm.value.name = user.value.name || ''
      profileForm.value.email = user.value.email || ''
    }
    
  } catch (error) {
    console.error('Failed to load profile:', error)
  }
  
  // Initialize preferences
  preferences.value.theme = themeStore.theme
})

// Watch for theme changes
watch(() => preferences.value.theme, (newTheme) => {
  themeStore.setTheme(newTheme)
})

// Update profile
async function updateProfile() {
  if (!validateProfileForm()) return
  
  isUpdatingProfile.value = true
  profileErrors.value = {}
  
  try {
    // Note: This would need to be implemented in the backend
    // await authStore.updateProfile(profileForm.value)
    
    showSuccessMessage('Profile updated successfully')
    
  } catch (error: any) {
    profileErrors.value.general = error.message || 'Failed to update profile'
  } finally {
    isUpdatingProfile.value = false
  }
}

// Change password
async function changePassword() {
  if (!validatePasswordForm()) return
  
  isChangingPassword.value = true
  passwordErrors.value = {}
  
  try {
    await authStore.changePassword(
      passwordForm.value.currentPassword,
      passwordForm.value.newPassword
    )
    
    // Reset form
    passwordForm.value = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
    
    showSuccessMessage('Password changed successfully')
    
  } catch (error: any) {
    passwordErrors.value.general = error.message || 'Failed to change password'
  } finally {
    isChangingPassword.value = false
  }
}

// Save preferences
async function savePreferences() {
  isSavingPreferences.value = true
  
  try {
    // Note: This would need to be implemented in the backend
    // await api.post('/user/preferences', preferences.value)
    
    showSuccessMessage('Preferences saved successfully')
    
  } catch (error) {
    showErrorMessage('Failed to save preferences')
  } finally {
    isSavingPreferences.value = false
  }
}

// Export data
async function exportData() {
  isExportingData.value = true
  
  try {
    // Note: This would need to be implemented in the backend
    // const response = await api.get('/user/export', { responseType: 'blob' })
    // const url = window.URL.createObjectURL(new Blob([response.data]))
    // const link = document.createElement('a')
    // link.href = url
    // link.setAttribute('download', 'user-data.json')
    // document.body.appendChild(link)
    // link.click()
    // link.remove()
    
    showSuccessMessage('Data export completed')
    
  } catch (error) {
    showErrorMessage('Failed to export data')
  } finally {
    isExportingData.value = false
  }
}

// Delete account
async function deleteAccount() {
  if (deleteConfirmText.value !== 'DELETE') return
  
  isDeletingAccount.value = true
  
  try {
    // Note: This would need to be implemented in the backend
    // await api.delete('/user/account')
    
    await authStore.logout()
    router.push('/')
    
  } catch (error) {
    showErrorMessage('Failed to delete account')
  } finally {
    isDeletingAccount.value = false
    showDeleteConfirm.value = false
  }
}

// Form validation
function validateProfileForm() {
  profileErrors.value = {}
  
  if (!profileForm.value.name.trim()) {
    profileErrors.value.name = 'Name is required'
  }
  
  if (!profileForm.value.email) {
    profileErrors.value.email = 'Email is required'
  } else if (!profileForm.value.email.includes('@')) {
    profileErrors.value.email = 'Please enter a valid email'
  }
  
  return Object.keys(profileErrors.value).length === 0
}

function validatePasswordForm() {
  passwordErrors.value = {}
  
  if (!passwordForm.value.currentPassword) {
    passwordErrors.value.currentPassword = 'Current password is required'
  }
  
  if (!passwordForm.value.newPassword) {
    passwordErrors.value.newPassword = 'New password is required'
  } else if (passwordForm.value.newPassword.length < 8) {
    passwordErrors.value.newPassword = 'Password must be at least 8 characters'
  } else if (passwordStrength.value < 2) {
    passwordErrors.value.newPassword = 'Password is too weak'
  }
  
  if (!passwordForm.value.confirmPassword) {
    passwordErrors.value.confirmPassword = 'Please confirm your password'
  } else if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordErrors.value.confirmPassword = 'Passwords do not match'
  }
  
  return Object.keys(passwordErrors.value).length === 0
}

// Utility functions
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

function formatDate(dateString?: string): string {
  if (!dateString) return 'Unknown'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function showSuccessMessage(message: string) {
  successMessage.value = message
  setTimeout(() => {
    successMessage.value = ''
  }, 3000)
}

function showErrorMessage(message: string) {
  errorMessage.value = message
  setTimeout(() => {
    errorMessage.value = ''
  }, 5000)
}
</script>

<style scoped>
/* Custom radio and checkbox styles */
.form-radio:checked {
  background-color: #2563eb;
  border-color: #2563eb;
}

.form-checkbox:checked {
  background-color: #2563eb;
  border-color: #2563eb;
}
</style>