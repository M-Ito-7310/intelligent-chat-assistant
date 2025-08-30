<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="container mx-auto px-4 py-8 max-w-6xl">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ $t('documents.title') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-2">
            {{ $t('documents.subtitle') }}
          </p>
        </div>
        <div class="flex items-center space-x-4">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ documents.length }} {{ $t('documents.title').toLowerCase() }}
          </div>
          <button
            @click="showUploadModal = true"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <Plus class="w-5 h-5 mr-2" />
            {{ $t('documents.upload') }}
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
              <FileText class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div class="ml-4">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ documents.length }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('documents.totalDocuments') }}</p>
            </div>
          </div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-green-100 dark:bg-green-900/20 rounded-full">
              <CheckCircle class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div class="ml-4">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ processedCount }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('documents.processed') }}</p>
            </div>
          </div>
        </div>
        
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div class="flex items-center">
            <div class="p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
              <Clock class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div class="ml-4">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ processingCount }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('documents.processing') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Search and Filters -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
        <div class="flex flex-col md:flex-row md:items-center md:space-x-4 space-y-4 md:space-y-0">
          <div class="flex-1">
            <div class="relative">
              <Search class="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                v-model="searchQuery"
                type="text"
:placeholder="$t('documents.search.placeholder')"
                class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div class="flex space-x-2">
            <select
              v-model="statusFilter"
              class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{{ $t('documents.filters.allStatus') }}</option>
              <option value="processing">{{ $t('documents.processing') }}</option>
              <option value="completed">{{ $t('documents.processed') }}</option>
              <option value="failed">{{ $t('documents.failed') }}</option>
            </select>
            <button
              @click="loadDocuments"
              class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RotateCcw class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <!-- Documents Grid -->
      <div v-if="filteredDocuments.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="document in filteredDocuments"
          :key="document.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow"
        >
          <!-- Document Header -->
          <div class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="font-semibold text-gray-900 dark:text-white truncate" :title="document.filename">
                  {{ document.filename }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ formatFileSize(document.file_size) }} • {{ formatDate(document.created_at) }}
                </p>
              </div>
              <div class="relative">
                <button
                  @click="toggleDocumentMenu(document.id)"
                  class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MoreVertical class="w-5 h-5" />
                </button>
                
                <!-- Dropdown Menu -->
                <div
                  v-if="activeDocumentMenu === document.id"
                  class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10"
                >
                  <button
                    @click="viewDocument(document)"
                    class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                  >
                    <Eye class="w-4 h-4 mr-2" />
                    {{ $t('documents.actions.view') }}
                  </button>
                  <button
                    @click="reprocessDocument(document.id)"
                    :disabled="document.processing_status === 'processing'"
                    class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center disabled:opacity-50"
                  >
                    <RefreshCw class="w-4 h-4 mr-2" />
                    {{ $t('documents.actions.reprocess') }}
                  </button>
                  <button
                    @click="deleteDocument(document.id)"
                    class="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                  >
                    <Trash2 class="w-4 h-4 mr-2" />
                    {{ $t('documents.actions.delete') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Status Badge -->
            <div class="mb-4">
              <span :class="getStatusBadgeClass(document.processing_status)" class="px-2 py-1 text-xs font-medium rounded-full">
                {{ getStatusText(document.processing_status) }}
              </span>
            </div>

            <!-- Processing Progress -->
            <div v-if="document.processing_status === 'processing'" class="mb-4">
              <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                <span>{{ $t('documents.processing') }}...</span>
                <span>{{ document.chunks_count || 0 }} {{ $t('documents.details.chunks') }}</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${getProcessingProgress(document)}%` }"
                ></div>
              </div>
            </div>

            <!-- Document Stats -->
            <div v-else-if="document.processing_status === 'completed'" class="text-sm text-gray-600 dark:text-gray-400">
              <div class="flex justify-between">
                <span>{{ $t('documents.details.chunks') }}:</span>
                <span>{{ document.chunks_count || 0 }}</span>
              </div>
            </div>

            <!-- Error Message -->
            <div v-else-if="document.processing_status === 'failed'" class="text-sm text-red-600 dark:text-red-400">
              <p>{{ $t('documents.errors.processingFailed') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
        <FileText class="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {{ $t('documents.search.noResults') }}
        </h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">
          {{ searchQuery || statusFilter ? $t('documents.search.noResults') : $t('documents.uploadInstructions') }}
        </p>
        <button
          v-if="!searchQuery && !statusFilter"
          @click="showUploadModal = true"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <Plus class="w-5 h-5 mr-2" />
          {{ $t('documents.uploadFirst') }}
        </button>
      </div>

      <!-- Upload Modal -->
      <div v-if="showUploadModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ $t('documents.upload') }}
            </h3>
            <button
              @click="showUploadModal = false"
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="space-y-4">
            <!-- File Upload Area -->
            <div
              @drop="handleDrop"
              @dragover.prevent
              @dragenter.prevent
              class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              :class="{ 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20': isDragOver }"
            >
              <Upload class="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p class="text-gray-600 dark:text-gray-400 mb-2">
                {{ $t('documents.dragAndDrop') }}
              </p>
              <input
                ref="fileInput"
                type="file"
                accept=".pdf,.txt,.docx,.md"
                @change="handleFileSelect"
                class="hidden"
              />
              <button
                @click="$refs.fileInput.click()"
                class="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                {{ $t('common.browse') }}
              </button>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {{ $t('documents.supportedFormats') }}
              </p>
            </div>

            <!-- Selected File -->
            <div v-if="selectedFile" class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div class="flex items-center">
                <FileText class="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
                <div class="flex-1">
                  <p class="font-medium text-gray-900 dark:text-white">{{ selectedFile.name }}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ formatFileSize(selectedFile.size) }}</p>
                </div>
                <button
                  @click="selectedFile = null"
                  class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Upload Progress -->
            <div v-if="uploadProgress > 0" class="space-y-2">
              <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>{{ $t('documents.uploading') }}...</span>
                <span>{{ uploadProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${uploadProgress}%` }"
                ></div>
              </div>
            </div>

            <!-- Error Message -->
            <div v-if="uploadError" class="rounded-lg bg-red-50 dark:bg-red-900/20 p-4">
              <div class="flex">
                <AlertCircle class="h-5 w-5 text-red-400 flex-shrink-0" />
                <div class="ml-3">
                  <p class="text-sm text-red-700 dark:text-red-400">
                    {{ uploadError }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Upload Button -->
            <button
              @click="uploadDocument"
              :disabled="!selectedFile || isUploading"
              class="w-full flex justify-center items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Loader2 v-if="isUploading" class="animate-spin -ml-1 mr-2 h-4 w-4" />
              {{ isUploading ? $t('documents.uploading') + '...' : $t('documents.upload') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Document Detail Modal -->
      <div v-if="selectedDocument" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ $t('documents.details.title') }}
            </h3>
            <button
              @click="selectedDocument = null"
              class="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="space-y-6">
            <!-- Basic Info -->
            <div>
              <h4 class="font-medium text-gray-900 dark:text-white mb-3">{{ $t('documents.details.basicInfo') }}</h4>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.fileName') }}:</span>
                  <p class="font-medium text-gray-900 dark:text-white">{{ selectedDocument.filename }}</p>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.fileSize') }}:</span>
                  <p class="font-medium text-gray-900 dark:text-white">{{ formatFileSize(selectedDocument.file_size) }}</p>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.uploadDate') }}:</span>
                  <p class="font-medium text-gray-900 dark:text-white">{{ formatDate(selectedDocument.created_at) }}</p>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.processingStatus') }}:</span>
                  <span :class="getStatusBadgeClass(selectedDocument.processing_status)" class="px-2 py-1 text-xs font-medium rounded-full">
                    {{ getStatusText(selectedDocument.processing_status) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Processing Info -->
            <div v-if="selectedDocument.processing_status === 'completed'">
              <h4 class="font-medium text-gray-900 dark:text-white mb-3">{{ $t('documents.details.processingResults') }}</h4>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.chunksCreated') }}:</span>
                  <p class="font-medium text-gray-900 dark:text-white">{{ selectedDocument.chunks_count || 0 }}</p>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">{{ $t('documents.details.processedAt') }}:</span>
                  <p class="font-medium text-gray-900 dark:text-white">{{ formatDate(selectedDocument.processed_at) }}</p>
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
import { useDocumentsStore } from '../stores/documents'
import { 
  FileText, 
  Plus, 
  Search, 
  Upload, 
  X, 
  MoreVertical,
  Eye,
  Trash2,
  RefreshCw,
  RotateCcw,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-vue-next'

// Stores
const authStore = useAuthStore()
const documentsStore = useDocumentsStore()
const router = useRouter()

// State
const showUploadModal = ref(false)
const selectedFile = ref<File | null>(null)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadError = ref('')
const isDragOver = ref(false)
const searchQuery = ref('')
const statusFilter = ref('')
const activeDocumentMenu = ref<string | null>(null)
const selectedDocument = ref<any>(null)

// Computed
const documents = computed(() => documentsStore.documents)
const processedCount = computed(() => documents.value.filter(d => d.processing_status === 'completed').length)
const processingCount = computed(() => documents.value.filter(d => d.processing_status === 'processing').length)

const filteredDocuments = computed(() => {
  let filtered = documents.value

  if (searchQuery.value) {
    filtered = filtered.filter(doc => 
      doc.filename.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }

  if (statusFilter.value) {
    filtered = filtered.filter(doc => doc.processing_status === statusFilter.value)
  }

  return filtered
})

// Check authentication
onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  
  await loadDocuments()
})

// Load documents
async function loadDocuments() {
  try {
    await documentsStore.loadDocuments()
  } catch (error) {
    console.error('Failed to load documents:', error)
  }
}

// Handle file selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
  }
}

// Handle drag and drop
function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  
  if (event.dataTransfer && event.dataTransfer.files.length > 0) {
    selectedFile.value = event.dataTransfer.files[0]
  }
}

// Upload document
async function uploadDocument() {
  if (!selectedFile.value) return
  
  isUploading.value = true
  uploadError.value = ''
  uploadProgress.value = 0
  
  try {
    await documentsStore.uploadDocument(selectedFile.value, (progress) => {
      uploadProgress.value = progress
    })
    
    // Reset form
    selectedFile.value = null
    showUploadModal.value = false
    uploadProgress.value = 0
    
    // Reload documents
    await loadDocuments()
    
  } catch (error: any) {
    uploadError.value = error.message || 'Upload failed'
  } finally {
    isUploading.value = false
  }
}

// Document actions
function toggleDocumentMenu(documentId: string) {
  activeDocumentMenu.value = activeDocumentMenu.value === documentId ? null : documentId
}

function viewDocument(document: any) {
  selectedDocument.value = document
  activeDocumentMenu.value = null
}

async function reprocessDocument(documentId: string) {
  try {
    await documentsStore.reprocessDocument(documentId)
    activeDocumentMenu.value = null
    await loadDocuments()
  } catch (error) {
    console.error('Failed to reprocess document:', error)
  }
}

async function deleteDocument(documentId: string) {
  if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
    return
  }
  
  try {
    await documentsStore.deleteDocument(documentId)
    activeDocumentMenu.value = null
    await loadDocuments()
  } catch (error) {
    console.error('Failed to delete document:', error)
  }
}

// Utility functions
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'processing': 'Processing',
    'completed': 'Completed',
    'failed': 'Failed',
    'pending': 'Pending'
  }
  return statusMap[status] || status
}

function getStatusBadgeClass(status: string): string {
  const classMap: Record<string, string> = {
    'processing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    'completed': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    'failed': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    'pending': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
  }
  return classMap[status] || classMap.pending
}

function getProcessingProgress(document: any): number {
  // Simulated progress - in real app, this would come from the backend
  return document.chunks_count ? Math.min(100, (document.chunks_count * 10)) : 25
}

// Close menus when clicking outside
onMounted(() => {
  document.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('[data-dropdown]')) {
      activeDocumentMenu.value = null
    }
  })
})
</script>

<style scoped>
/* Custom scrollbar for modal */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4a5568;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: #2d3748;
}
</style>