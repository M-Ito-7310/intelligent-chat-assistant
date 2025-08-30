<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Chat Container -->
    <div class="flex h-screen">
      <!-- Sidebar -->
      <div class="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <!-- Header -->
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Conversations</h2>
            <button @click="createNewConversation" 
                    class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
              <Plus class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Conversations List -->
        <div class="flex-1 overflow-y-auto">
          <div v-for="conversation in validConversations" :key="conversation.id"
               @click="selectConversation(conversation)"
               :class="[
                 'p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors',
                 currentConversationId === conversation.id 
                   ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                   : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
               ]">
            <div class="font-medium truncate">{{ conversation.title || $t('chat.newConversation') }}</div>
            <div class="text-sm text-gray-500 dark:text-gray-400 truncate">
              {{ formatDate(conversation.updated_at) }}
            </div>
          </div>
          
          <div v-if="conversations.length === 0" class="p-4 text-center text-gray-500 dark:text-gray-400">
            {{ $t('chat.noConversations') }}
          </div>
        </div>
      </div>

      <!-- Chat Area -->
      <div class="flex-1 flex flex-col">
        <!-- Chat Header -->
        <div class="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">
              {{ currentConversation?.title || 'AI Chat' }}
            </h1>
            <div class="flex items-center space-x-2">
              <button @click="exportConversation"
                      :disabled="!currentConversation || messages.length === 0"
                      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      :title="$t('chat.actions.export')">
                <Download class="w-5 h-5" />
              </button>
              <button @click="shareConversation"
                      :disabled="!currentConversation || messages.length === 0"
                      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      :title="$t('chat.actions.share')">
                <Share class="w-5 h-5" />
              </button>
              <button @click="clearConversation"
                      :disabled="!currentConversation"
                      class="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      :title="$t('chat.actions.delete')">
                <Trash2 class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Messages Area -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
          <div v-for="message in messages" :key="message.id"
               :class="[
                 'flex',
                 message.role === 'user' ? 'justify-end' : 'justify-start'
               ]">
            <div :class="[
              'max-w-3xl rounded-lg p-4',
              message.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
            ]">
              <div class="flex items-start space-x-3">
                <div :class="[
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                  message.role === 'user' 
                    ? 'bg-blue-700' 
                    : 'bg-gray-200 dark:bg-gray-700'
                ]">
                  <User v-if="message.role === 'user'" class="w-4 h-4" />
                  <Bot v-else class="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
                <div class="flex-1">
                  <div v-if="message.role === 'assistant'" 
                       v-html="formatMarkdown(message.content)"
                       class="prose prose-sm dark:prose-invert max-w-none">
                  </div>
                  <div v-else class="whitespace-pre-wrap">{{ message.content }}</div>
                  
                  <!-- Sources if available -->
                  <div v-if="message.sources && message.sources.length > 0" class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sources:</div>
                    <div class="space-y-1">
                      <div v-for="source in message.sources" :key="source.id"
                           class="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded p-2">
                        📄 {{ source.filename }} (p. {{ source.page || 1 }})
                      </div>
                    </div>
                  </div>
                  
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {{ formatTime(message.created_at) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Typing indicator -->
          <div v-if="isTyping" class="flex justify-start">
            <div class="max-w-3xl rounded-lg p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div class="flex items-center space-x-3">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <Bot class="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </div>
                <div class="flex space-x-1">
                  <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                  <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="messages.length === 0" class="flex items-center justify-center h-64">
            <div class="text-center text-gray-500 dark:text-gray-400">
              <MessageCircle class="w-16 h-16 mx-auto mb-4" />
              <p class="text-lg font-medium">Start a conversation</p>
              <p class="text-sm">{{ $t('chat.sendMessageToStart') }}</p>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div class="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <form @submit.prevent="sendMessage" class="flex items-end space-x-3">
            <div class="flex-1">
              <textarea
                v-model="newMessage"
                @keydown.enter.exact.prevent="sendMessage"
                @keydown.enter.shift.exact="newMessage += '\n'"
:placeholder="$t('chat.placeholders.typeMessage')"
                rows="1"
                class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                :disabled="isTyping"
                ref="messageInput"
              ></textarea>
            </div>
            <button
              type="submit"
              :disabled="!newMessage.trim() || isTyping"
              class="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send class="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useRouter } from 'vue-router'
import { MessageCircle, Plus, User, Bot, Send, Trash2, Download, Share } from 'lucide-vue-next'
import { apiClient } from '../services/api'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

// Stores
const { t } = useI18n()
const authStore = useAuthStore()
const router = useRouter()

// State
const conversations = ref([])
const currentConversationId = ref<string | null>(null)
const currentConversation = ref<any>(null)
const messages = ref([])
const newMessage = ref('')
const isTyping = ref(false)
const messagesContainer = ref<HTMLElement>()
const messageInput = ref<HTMLTextAreaElement>()

// Computed
const validConversations = computed(() => {
  return conversations.value.filter(conv => conv && conv.id)
})

// Markdown processor
const md = new MarkdownIt({
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) {}
    }
    return '';
  }
})

// Check authentication
onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }
  
  await loadConversations()
  
  // Auto-resize textarea
  if (messageInput.value) {
    messageInput.value.addEventListener('input', autoResize)
  }
})

// Auto-resize textarea function
function autoResize() {
  if (messageInput.value) {
    messageInput.value.style.height = 'auto'
    messageInput.value.style.height = messageInput.value.scrollHeight + 'px'
  }
}

// Watch for message changes to scroll to bottom
watch(messages, () => {
  nextTick(() => {
    scrollToBottom()
  })
}, { deep: true })

// Load conversations
async function loadConversations() {
  try {
    const response = await apiClient.get('/chat/conversations')
    conversations.value = response.data.data?.conversations || []
    
    // Select first conversation if exists
    if (conversations.value.length > 0 && !currentConversationId.value) {
      await selectConversation(conversations.value[0])
    }
  } catch (error) {
    console.error('Failed to load conversations:', error)
  }
}

// Select conversation
async function selectConversation(conversation: any) {
  currentConversationId.value = conversation.id
  currentConversation.value = conversation
  await loadMessages(conversation.id)
}

// Load messages for conversation
async function loadMessages(conversationId: string) {
  try {
    const response = await apiClient.get(`/chat/conversations/${conversationId}`)
    messages.value = response.data.data?.messages || []
  } catch (error) {
    console.error('Failed to load messages:', error)
    messages.value = []
  }
}

// Create new conversation
async function createNewConversation() {
  try {
    const response = await apiClient.post('/chat/conversations', {
      title: t('chat.newConversation')
    })
    
    const newConv = response.data.data?.conversation
    if (newConv) {
      conversations.value.unshift(newConv)
      await selectConversation(newConv)
    }
  } catch (error) {
    console.error('Failed to create conversation:', error)
  }
}

// Send message
async function sendMessage() {
  const message = newMessage.value.trim()
  if (!message || isTyping.value) return
  
  // Create conversation if none selected
  if (!currentConversationId.value) {
    await createNewConversation()
  }
  
  if (!currentConversationId.value) return
  
  // Add user message to UI immediately
  const userMessage = {
    id: Date.now().toString(),
    content: message,
    role: 'user',
    created_at: new Date().toISOString()
  }
  
  messages.value.push(userMessage)
  newMessage.value = ''
  isTyping.value = true
  
  // Reset textarea height
  if (messageInput.value) {
    messageInput.value.style.height = 'auto'
  }
  
  try {
    const response = await apiClient.post('/chat/message', {
      message,
      conversationId: currentConversationId.value
    })
    
    // Add AI response
    const assistantMessage = response.data.data?.assistantMessage
    if (assistantMessage) {
      const aiMessage = {
        id: assistantMessage.id,
        content: assistantMessage.content,
        role: 'assistant',
        created_at: assistantMessage.created_at,
        sources: assistantMessage.sources || []
      }
      
      messages.value.push(aiMessage)
    }
    
    // Update conversation title if it's new
    if (currentConversation.value && (!currentConversation.value.title || currentConversation.value.title === 'New Conversation')) {
      const newTitle = response.data.data?.conversationTitle || message.substring(0, 50) + '...'
      currentConversation.value.title = newTitle
      
      // Update in conversations list
      const convIndex = conversations.value.findIndex(c => c.id === currentConversationId.value)
      if (convIndex !== -1) {
        conversations.value[convIndex].title = currentConversation.value.title
      }
    }
    
  } catch (error) {
    console.error('Failed to send message:', error)
    
    // Add error message
    messages.value.push({
      id: Date.now().toString(),
      content: 'Sorry, I encountered an error processing your message. Please try again.',
      role: 'assistant',
      created_at: new Date().toISOString()
    })
  } finally {
    isTyping.value = false
  }
}

// Clear conversation
async function clearConversation() {
  if (!currentConversationId.value) return
  
  if (!confirm('Are you sure you want to delete this conversation?')) return
  
  try {
    await apiClient.delete(`/chat/conversations/${currentConversationId.value}`)
    
    // Remove from list
    conversations.value = conversations.value.filter(c => c.id !== currentConversationId.value)
    
    // Clear current conversation
    currentConversationId.value = null
    currentConversation.value = null
    messages.value = []
    
    // Select first available conversation
    if (conversations.value.length > 0) {
      await selectConversation(conversations.value[0])
    }
    
  } catch (error) {
    console.error('Failed to delete conversation:', error)
  }
}

// Utility functions
function formatMarkdown(content: string) {
  return md.render(content)
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString()
  }
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Export conversation
async function exportConversation() {
  if (!currentConversation.value || messages.value.length === 0) return
  
  try {
    const exportData = {
      title: currentConversation.value.title,
      created_at: currentConversation.value.created_at,
      updated_at: currentConversation.value.updated_at,
      messages: messages.value.map(msg => ({
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
        sources: msg.sources || []
      }))
    }
    
    // Create and download JSON file
    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    
    const url = window.URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `conversation-${currentConversation.value.title?.replace(/[^a-z0-9]/gi, '-') || 'export'}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    
  } catch (error) {
    console.error('Failed to export conversation:', error)
  }
}

// Share conversation
async function shareConversation() {
  if (!currentConversation.value || messages.value.length === 0) return
  
  try {
    // Generate shareable text
    let shareText = `${currentConversation.value.title}\n\n`
    
    messages.value.forEach(msg => {
      const role = msg.role === 'user' ? 'You' : 'AI'
      shareText += `${role}: ${msg.content}\n\n`
      
      if (msg.sources && msg.sources.length > 0) {
        shareText += 'Sources:\n'
        msg.sources.forEach(source => {
          shareText += `- ${source.filename} (page ${source.page || 1})\n`
        })
        shareText += '\n'
      }
    })
    
    shareText += `Exported from AI Chatbot on ${new Date().toLocaleDateString()}`
    
    // Use Web Share API if available, otherwise copy to clipboard
    if (navigator.share) {
      await navigator.share({
        title: currentConversation.value.title,
        text: shareText
      })
    } else {
      await navigator.clipboard.writeText(shareText)
      
      // Show temporary notification
      const notification = document.createElement('div')
      notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50'
      notification.textContent = 'Conversation copied to clipboard!'
      document.body.appendChild(notification)
      
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 3000)
    }
    
  } catch (error) {
    console.error('Failed to share conversation:', error)
  }
}
</script>

<style scoped>
/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}

.dark ::-webkit-scrollbar-thumb {
  background: #4a5568;
}

.dark ::-webkit-scrollbar-thumb:hover {
  background: #2d3748;
}
</style>