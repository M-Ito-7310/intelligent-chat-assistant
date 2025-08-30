export interface Document {
  id: string
  filename: string
  original_filename: string
  file_size: number
  file_type: string
  is_processed: boolean
  processing_status?: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  chunk_count: number
  content?: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  content: string
  metadata: {
    startIndex: number
    endIndex: number
    chunkSize: number
    chunkIndex: number
  }
  chunk_index: number
  created_at: string
}

export interface ProcessingStatus {
  total: number
  processed: number
  pending: number
}

export interface SearchResult {
  id: string
  documentId: string
  filename: string
  originalFilename: string
  content: string
  metadata: {
    startIndex: number
    endIndex: number
    chunkSize: number
    chunkIndex: number
  }
  chunkIndex: number
  similarity: string
}

export interface SearchRequest {
  query: string
  limit?: number
  threshold?: number
}

export interface UploadResponse {
  document: Document
}

export interface DocumentsResponse {
  documents: Document[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  processing: ProcessingStatus
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  usage?: {
    total_tokens: number
  }
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  errors?: any[]
}