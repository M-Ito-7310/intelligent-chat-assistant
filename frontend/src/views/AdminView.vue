<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Admin Header -->
    <div class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between py-4">
          <div class="flex items-center space-x-3">
            <Shield class="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ $t('admin.title') }}
            </h1>
          </div>
          
          <div class="flex items-center space-x-4">
            <div class="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <Activity class="h-4 w-4" />
              <span>Live updates</span>
            </div>
            
            <button
              @click="refreshData"
              :disabled="loading"
              class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              <RefreshCw :class="['h-4 w-4 mr-2', loading ? 'animate-spin' : '']" />
              {{ $t('common.loading') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- System Status Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.activeUsers') }}</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ metrics.active_users || 0 }}</p>
            </div>
            <Users class="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.totalConversations') }}</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ metrics.total_conversations || 0 }}</p>
            </div>
            <MessageCircle class="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.totalMessages') }}</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ metrics.total_messages || 0 }}</p>
            </div>
            <Send class="h-8 w-8 text-purple-600 dark:text-purple-400" />
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.systemUptime') }}</p>
              <p class="text-2xl font-semibold text-gray-900 dark:text-white">{{ formatUptime(metrics.system?.uptime) }}</p>
            </div>
            <Clock class="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
        </div>
      </div>

      <!-- Main Dashboard Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- AI Provider Status -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">AI プロバイダー状況</h3>
          </div>
          <div class="p-6">
            <div class="space-y-4">
              <div v-for="(provider, name) in metrics.ai_providers" :key="name" 
                   class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="flex items-center space-x-3">
                  <div :class="[
                    'h-3 w-3 rounded-full',
                    provider.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'
                  ]"></div>
                  <span class="font-medium text-gray-900 dark:text-white capitalize">{{ name }}</span>
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ $t('admin.metrics.apiRequests') }}: {{ provider.requests_today }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cache Performance -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ $t('admin.cache.title') }}</h3>
          </div>
          <div class="p-6">
            <div v-if="metrics.cache?.enabled" class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400">メモリ使用量</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ metrics.cache.memory_usage }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.cache.cachedKeys') }}</span>
                <span class="text-sm text-gray-900 dark:text-white">{{ metrics.cache.total_keys }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('common.status') }}</span>
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                  {{ $t('admin.status.active') }}
                </span>
              </div>
            </div>
            <div v-else class="text-center py-8">
              <Database class="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p class="text-gray-500 dark:text-gray-400">{{ $t('admin.cache.unavailable') }}</p>
            </div>
          </div>
        </div>

        <!-- System Resources -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ $t('admin.system.resources') }}</h3>
          </div>
          <div class="p-6">
            <div v-if="metrics.system" class="space-y-6">
              <!-- Memory Usage -->
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.memoryUsage') }}</span>
                  <span class="text-sm text-gray-900 dark:text-white">
                    {{ formatBytes(metrics.system.memory_usage?.used) }} / 
                    {{ formatBytes(metrics.system.memory_usage?.total) }}
                  </span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    :style="{ width: `${getMemoryUsagePercent()}%` }"
                  ></div>
                </div>
              </div>

              <!-- CPU Usage -->
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ $t('admin.metrics.cpuUsage') }}</span>
                  <span class="text-sm text-gray-900 dark:text-white">{{ getCPUUsagePercent() }}%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    class="bg-green-600 h-2 rounded-full transition-all duration-300"
                    :style="{ width: `${getCPUUsagePercent()}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ $t('admin.quickActions.title') }}</h3>
          </div>
          <div class="p-6">
            <div class="space-y-3">
              <button
                @click="clearCache"
                :disabled="loading"
                class="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 class="h-4 w-4 mr-2" />
                {{ $t('admin.quickActions.clearCache') }}
              </button>
              
              <button
                @click="cleanupExports"
                :disabled="loading"
                class="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <FolderX class="h-4 w-4 mr-2" />
                {{ $t('admin.quickActions.cleanupExports') }}
              </button>
              
              <button
                @click="downloadSystemLog"
                :disabled="loading"
                class="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <Download class="h-4 w-4 mr-2" />
                {{ $t('admin.quickActions.downloadLogs') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">{{ $t('admin.recentActivity') }}</h3>
        </div>
        <div class="p-6">
          <div class="space-y-4">
            <div v-for="activity in recentActivities" :key="activity.id"
                 class="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div :class="[
                'h-2 w-2 rounded-full',
                activity.type === 'user_login' ? 'bg-green-400' :
                activity.type === 'message_sent' ? 'bg-blue-400' :
                activity.type === 'document_uploaded' ? 'bg-purple-400' :
                'bg-gray-400'
              ]"></div>
              
              <div class="flex-1">
                <p class="text-sm text-gray-900 dark:text-white">{{ activity.description }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatTime(activity.timestamp) }}</p>
              </div>
            </div>
            
            <div v-if="recentActivities.length === 0" class="text-center py-8">
              <BarChart3 class="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p class="text-gray-500 dark:text-gray-400">{{ $t('admin.noRecentActivity') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { apiClient } from '../services/api'
import { 
  Shield, 
  Activity, 
  RefreshCw, 
  Users, 
  MessageCircle, 
  Send, 
  Clock,
  Database,
  Trash2,
  FolderX,
  Download,
  BarChart3
} from 'lucide-vue-next'

// Stores
const authStore = useAuthStore()

// State
const loading = ref(false)
const metrics = ref({
  active_users: 0,
  total_conversations: 0,
  total_messages: 0,
  system: null,
  cache: null,
  ai_providers: {}
})

const recentActivities = ref([
  {
    id: 1,
    type: 'user_login',
    description: 'デモユーザーがログインしました',
    timestamp: new Date().toISOString()
  },
  {
    id: 2, 
    type: 'message_sent',
    description: 'デモ会話でメッセージが送信されました',
    timestamp: new Date(Date.now() - 300000).toISOString()
  },
  {
    id: 3,
    type: 'document_uploaded',
    description: 'デモドキュメントがアップロードされました',
    timestamp: new Date(Date.now() - 600000).toISOString()
  }
])

// Methods
async function loadMetrics() {
  loading.value = true
  try {
    const response = await apiClient.get('/chat/metrics')
    metrics.value = response.data.data
  } catch (error) {
    console.error('Failed to load metrics:', error)
    // Demo fallback data
    metrics.value = {
      active_users: 1,
      total_conversations: 1,
      total_messages: 5,
      system: {
        uptime: 3600,
        memory_usage: {
          used: 50 * 1024 * 1024,
          total: 100 * 1024 * 1024
        }
      },
      cache: {
        enabled: true,
        memory_usage: '2.5MB',
        total_keys: 15
      },
      ai_providers: {
        openai: { status: 'demo', requests_today: 0 },
        huggingface: { status: 'demo', requests_today: 0 }
      }
    }
  } finally {
    loading.value = false
  }
}

async function refreshData() {
  await loadMetrics()
}

async function clearCache() {
  loading.value = true
  try {
    await apiClient.post('/admin/cache/clear')
    await loadMetrics()
  } catch (error) {
    console.error('Failed to clear cache:', error)
  } finally {
    loading.value = false
  }
}

async function cleanupExports() {
  loading.value = true
  try {
    await apiClient.post('/admin/cleanup/exports')
  } catch (error) {
    console.error('Failed to cleanup exports:', error)
  } finally {
    loading.value = false
  }
}

async function downloadSystemLog() {
  try {
    const response = await apiClient.get('/admin/logs/system', {
      responseType: 'blob'
    })
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `system-log-${new Date().toISOString().split('T')[0]}.log`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (error) {
    console.error('Failed to download system log:', error)
  }
}

// Utility functions
function formatUptime(seconds?: number): string {
  if (!seconds) return '0秒'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours}時間${minutes}分`
  }
  return `${minutes}分`
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '1分前'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`
  return date.toLocaleDateString('ja-JP')
}

function getMemoryUsagePercent(): number {
  if (!metrics.value.system?.memory_usage) return 0
  const { used, total } = metrics.value.system.memory_usage
  return Math.round((used / total) * 100)
}

function getCPUUsagePercent(): number {
  // Simplified CPU calculation for demo
  return Math.floor(Math.random() * 30) + 10
}

// Lifecycle
onMounted(() => {
  loadMetrics()
  
  // Auto-refresh every 30 seconds
  const interval = setInterval(loadMetrics, 30000)
  
  // Cleanup on unmount
  return () => clearInterval(interval)
})
</script>