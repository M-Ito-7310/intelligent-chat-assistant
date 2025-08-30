import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  Document, 
  DocumentChunk, 
  ProcessingStatus, 
  SearchResult 
} from '../types/document'
import { documentsApi } from '../services/documentsApi'

export const useDocumentsStore = defineStore('documents', () => {
  // State
  const documents = ref<Document[]>([])
  const processingStatus = ref<ProcessingStatus>({
    total: 0,
    processed: 0,
    pending: 0
  })
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)

  // Computed
  const processedDocuments = computed(() => 
    documents.value.filter(doc => doc.is_processed)
  )

  const pendingDocuments = computed(() => 
    documents.value.filter(doc => !doc.is_processed)
  )

  const isRAGAvailable = computed(() => 
    processingStatus.value.processed > 0
  )

  // Actions
  async function fetchDocuments() {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await documentsApi.getDocuments()
      documents.value = response.data!?.documents || []
      processingStatus.value = response.data!?.processing || { total: 0, processed: 0, pending: 0 }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch documents'
      console.error('Error fetching documents:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function uploadDocument(file: File) {
    isLoading.value = true
    error.value = null

    try {
      const formData = new FormData()
      formData.append('document', file)

      const response = await documentsApi.uploadDocument(formData)
      
      // Add new document to the list
      documents.value.unshift(response.data!.document)
      
      // Update processing status
      processingStatus.value.total += 1
      processingStatus.value.pending += 1

      return response.data!.document
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to upload document'
      console.error('Error uploading document:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deleteDocument(documentId: string) {
    try {
      await documentsApi.deleteDocument(documentId)
      
      // Remove from local state
      const index = documents.value.findIndex(doc => doc.id === documentId)
      if (index > -1) {
        const deletedDoc = documents.value[index]
        documents.value.splice(index, 1)
        
        // Update processing status
        processingStatus.value.total -= 1
        if (deletedDoc.is_processed) {
          processingStatus.value.processed -= 1
        } else {
          processingStatus.value.pending -= 1
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete document'
      console.error('Error deleting document:', err)
      throw err
    }
  }

  async function getDocument(documentId: string) {
    try {
      const response = await documentsApi.getDocument(documentId)
      return response.data!.document
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to get document'
      console.error('Error getting document:', err)
      throw err
    }
  }

  async function getDocumentChunks(documentId: string) {
    try {
      const response = await documentsApi.getDocumentChunks(documentId)
      return response.data!.chunks
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to get document chunks'
      console.error('Error getting document chunks:', err)
      throw err
    }
  }

  async function searchDocuments(query: string, options: {
    limit?: number
    threshold?: number
  } = {}) {
    isSearching.value = true
    error.value = null

    try {
      const response = await documentsApi.searchDocuments(query, options)
      searchResults.value = response.data!.results
      return response.data!.results
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to search documents'
      console.error('Error searching documents:', err)
      throw err
    } finally {
      isSearching.value = false
    }
  }

  async function reprocessDocument(documentId: string) {
    try {
      await documentsApi.reprocessDocument(documentId)
      
      // Update document status in local state
      const document = documents.value.find(doc => doc.id === documentId)
      if (document) {
        document.is_processed = false
        
        // Update processing status
        processingStatus.value.processed -= 1
        processingStatus.value.pending += 1
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to reprocess document'
      console.error('Error reprocessing document:', err)
      throw err
    }
  }

  async function refreshProcessingStatus() {
    try {
      const response = await documentsApi.getProcessingStatus()
      processingStatus.value = response.data!.status
    } catch (err) {
      console.error('Error refreshing processing status:', err)
    }
  }

  function clearError() {
    error.value = null
  }

  function clearSearchResults() {
    searchResults.value = []
  }

  // Periodic status updates
  let statusInterval: number | null = null

  function startStatusUpdates() {
    if (statusInterval) return
    
    statusInterval = window.setInterval(() => {
      if (processingStatus.value.pending > 0) {
        refreshProcessingStatus()
      }
    }, 5000) // Check every 5 seconds
  }

  function stopStatusUpdates() {
    if (statusInterval) {
      clearInterval(statusInterval)
      statusInterval = null
    }
  }

  return {
    // State
    documents,
    processingStatus,
    isLoading,
    error,
    searchResults,
    isSearching,
    
    // Computed
    processedDocuments,
    pendingDocuments,
    isRAGAvailable,
    
    // Actions
    fetchDocuments,
    uploadDocument,
    deleteDocument,
    getDocument,
    getDocumentChunks,
    searchDocuments,
    reprocessDocument,
    refreshProcessingStatus,
    clearError,
    clearSearchResults,
    startStatusUpdates,
    stopStatusUpdates
  }
})