import type { 
  ApiResponse,
  Document,
  DocumentsResponse,
  UploadResponse,
  ProcessingStatus,
  SearchResponse,
  SearchRequest,
  DocumentChunk
} from '../types/document'
import { apiClient } from './api'

export const documentsApi = {
  async getDocuments(): Promise<ApiResponse<DocumentsResponse>> {
    const response = await apiClient.get<ApiResponse<DocumentsResponse>>('/documents')
    return response.data
  },

  async uploadDocument(formData: FormData): Promise<ApiResponse<UploadResponse>> {
    const response = await apiClient.post<ApiResponse<UploadResponse>>('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  async getDocument(documentId: string): Promise<ApiResponse<{ document: Document }>> {
    const response = await apiClient.get<ApiResponse<{ document: Document }>>(`/documents/${documentId}`)
    return response.data
  },

  async deleteDocument(documentId: string): Promise<ApiResponse<void>> {
    const response = await apiClient.delete<ApiResponse<void>>(`/documents/${documentId}`)
    return response.data
  },

  async getDocumentChunks(documentId: string): Promise<ApiResponse<{ 
    document: { 
      id: string
      filename: string
      originalFilename: string 
    },
    chunks: DocumentChunk[]
    pagination: {
      limit: number
      offset: number
      total: number
    }
  }>> {
    const response = await apiClient.get(`/documents/${documentId}/chunks`)
    return response.data
  },

  async searchDocuments(query: string, options: {
    limit?: number
    threshold?: number
  } = {}): Promise<ApiResponse<SearchResponse>> {
    const response = await apiClient.post<ApiResponse<SearchResponse>>('/documents/search', {
      query,
      ...options
    })
    return response.data
  },

  async getProcessingStatus(): Promise<ApiResponse<{ status: ProcessingStatus }>> {
    const response = await apiClient.get<ApiResponse<{ status: ProcessingStatus }>>('/documents/status/processing')
    return response.data
  },

  async reprocessDocument(documentId: string): Promise<ApiResponse<void>> {
    const response = await apiClient.post<ApiResponse<void>>(`/documents/${documentId}/reprocess`)
    return response.data
  }
}