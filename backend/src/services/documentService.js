import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';
import { aiCoordinator } from './ai/aiCoordinator.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Document Processing Service
 * Handles document upload, processing, chunking, and embedding generation
 */
export class DocumentService {
  constructor() {
    this.uploadDir = path.join(__dirname, '../../uploads/documents');
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.supportedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    
    // Chunking configuration
    this.chunkConfig = {
      maxChunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ']
    };

    this.ensureUploadDir();
    logger.info('Document service initialized');
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
    }
  }

  /**
   * Process uploaded document
   */
  async processDocument(file, userId, filename) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Extract text content based on file type
      const content = await this.extractTextContent(file);
      
      if (!content || content.trim().length === 0) {
        throw new Error('No readable content found in document');
      }

      // Save document to database
      const documentQuery = `
        INSERT INTO documents (user_id, filename, original_filename, content, file_size, file_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at
      `;
      
      const documentResult = await client.query(documentQuery, [
        userId,
        filename,
        file.originalname,
        content,
        file.size,
        file.mimetype
      ]);

      const documentId = documentResult.rows[0].id;
      
      logger.info(`Document saved: ${filename} (${documentId}) for user: ${userId}`);

      // Process document in background (chunking and embedding)
      this.processDocumentAsync(documentId, content, client).catch(error => {
        logger.error('Background document processing failed:', error);
      });

      await client.query('COMMIT');

      return {
        id: documentId,
        filename: filename,
        originalFilename: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        contentLength: content.length,
        created_at: documentResult.rows[0].created_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Document processing error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Extract text content from different file types
   */
  async extractTextContent(file) {
    try {
      switch (file.mimetype) {
        case 'application/pdf':
          return await this.extractPdfText(file.buffer);
        
        case 'text/plain':
        case 'text/markdown':
          return file.buffer.toString('utf-8');
        
        default:
          throw new Error(`Unsupported file type: ${file.mimetype}`);
      }
    } catch (error) {
      logger.error('Text extraction error:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  async extractPdfText(buffer) {
    try {
      // Dynamically import pdf-parse to avoid initialization issues
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF file');
    }
  }

  /**
   * Process document asynchronously (chunking and embedding)
   */
  async processDocumentAsync(documentId, content, client = null) {
    const shouldReleaseClient = !client;
    if (!client) {
      client = await pool.connect();
    }

    try {
      logger.info(`Starting async processing for document: ${documentId}`);

      // Create text chunks
      const chunks = await this.createTextChunks(content);
      logger.info(`Created ${chunks.length} chunks for document: ${documentId}`);

      // Generate embeddings and save chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding for chunk
          const embeddingResult = await aiCoordinator.generateEmbedding(chunk.content);
          
          // Save chunk with embedding
          const chunkQuery = `
            INSERT INTO document_chunks (document_id, content, embedding, metadata, chunk_index)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `;
          
          await client.query(chunkQuery, [
            documentId,
            chunk.content,
            JSON.stringify(embeddingResult.embedding), // Store as JSON for pgvector
            JSON.stringify(chunk.metadata),
            i
          ]);

        } catch (error) {
          logger.error(`Failed to process chunk ${i} for document ${documentId}:`, error);
          // Continue processing other chunks
        }
      }

      // Mark document as processed
      await client.query(
        'UPDATE documents SET is_processed = true WHERE id = $1',
        [documentId]
      );

      logger.info(`Document processing completed: ${documentId}`);

    } catch (error) {
      logger.error('Async document processing error:', error);
      throw error;
    } finally {
      if (shouldReleaseClient) {
        client.release();
      }
    }
  }

  /**
   * Create text chunks from document content
   */
  async createTextChunks(text) {
    const chunks = [];
    const { maxChunkSize, chunkOverlap, separators } = this.chunkConfig;

    // Clean and normalize text
    const cleanText = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (cleanText.length <= maxChunkSize) {
      return [{
        content: cleanText,
        metadata: {
          startIndex: 0,
          endIndex: cleanText.length,
          chunkSize: cleanText.length
        }
      }];
    }

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < cleanText.length) {
      let endIndex = Math.min(startIndex + maxChunkSize, cleanText.length);
      
      // Try to find a good break point
      if (endIndex < cleanText.length) {
        let bestBreak = endIndex;
        
        for (const separator of separators) {
          const lastSeparator = cleanText.lastIndexOf(separator, endIndex);
          if (lastSeparator > startIndex + maxChunkSize * 0.5) {
            bestBreak = lastSeparator + separator.length;
            break;
          }
        }
        
        endIndex = bestBreak;
      }

      const chunkContent = cleanText.slice(startIndex, endIndex).trim();
      
      if (chunkContent.length > 0) {
        chunks.push({
          content: chunkContent,
          metadata: {
            startIndex,
            endIndex,
            chunkSize: chunkContent.length,
            chunkIndex: chunkIndex++
          }
        });
      }

      // Move start index with overlap
      startIndex = endIndex - chunkOverlap;
      if (startIndex < 0) startIndex = 0;
    }

    return chunks;
  }

  /**
   * Get user documents
   */
  async getUserDocuments(userId, options = {}) {
    const client = await pool.connect();
    
    try {
      const { limit = 20, offset = 0, processedOnly = false } = options;
      
      let whereClause = 'WHERE user_id = $1';
      const params = [userId];
      
      if (processedOnly) {
        whereClause += ' AND is_processed = true';
      }

      const query = `
        SELECT 
          d.id,
          d.filename,
          d.original_filename,
          d.file_size,
          d.file_type,
          d.is_processed,
          d.created_at,
          COUNT(dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        ${whereClause}
        GROUP BY d.id, d.filename, d.original_filename, d.file_size, d.file_type, d.is_processed, d.created_at
        ORDER BY d.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      
      params.push(limit, offset);
      const result = await client.query(query, params);
      
      return result.rows.map(row => ({
        ...row,
        chunk_count: parseInt(row.chunk_count)
      }));

    } catch (error) {
      logger.error('Error getting user documents:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId, userId) {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          d.*,
          COUNT(dc.id) as chunk_count
        FROM documents d
        LEFT JOIN document_chunks dc ON d.id = dc.document_id
        WHERE d.id = $1 AND d.user_id = $2
        GROUP BY d.id
      `;
      
      const result = await client.query(query, [documentId, userId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return {
        ...result.rows[0],
        chunk_count: parseInt(result.rows[0].chunk_count)
      };

    } catch (error) {
      logger.error('Error getting document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete document and its chunks
   */
  async deleteDocument(documentId, userId) {
    const client = await pool.connect();
    
    try {
      // Verify ownership
      const ownershipQuery = 'SELECT id FROM documents WHERE id = $1 AND user_id = $2';
      const ownershipResult = await client.query(ownershipQuery, [documentId, userId]);
      
      if (ownershipResult.rows.length === 0) {
        throw new Error('Document not found or access denied');
      }

      // Delete document (chunks will be deleted by CASCADE)
      const deleteQuery = 'DELETE FROM documents WHERE id = $1 AND user_id = $2';
      const deleteResult = await client.query(deleteQuery, [documentId, userId]);
      
      logger.info(`Document deleted: ${documentId} by user: ${userId}`);
      
      return deleteResult.rowCount > 0;

    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search similar document chunks
   */
  async searchSimilarChunks(queryEmbedding, userId, options = {}) {
    const client = await pool.connect();
    
    try {
      const { 
        limit = 5, 
        threshold = 0.7,
        documentIds = null 
      } = options;

      let whereClause = 'd.user_id = $1';
      const params = [userId];
      
      if (documentIds && documentIds.length > 0) {
        whereClause += ` AND d.id = ANY($${params.length + 1})`;
        params.push(documentIds);
      }

      const query = `
        SELECT 
          dc.id,
          dc.document_id,
          dc.content,
          dc.metadata,
          dc.chunk_index,
          d.filename,
          d.original_filename,
          1 - (dc.embedding <=> $${params.length + 1}::vector) AS similarity
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE ${whereClause}
          AND d.is_processed = true
          AND 1 - (dc.embedding <=> $${params.length + 1}::vector) > $${params.length + 2}
        ORDER BY dc.embedding <=> $${params.length + 1}::vector
        LIMIT $${params.length + 3}
      `;
      
      params.push(JSON.stringify(queryEmbedding), threshold, limit);
      
      const result = await client.query(query, params);
      
      return result.rows;

    } catch (error) {
      logger.error('Error searching similar chunks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get processing status
   */
  async getProcessingStatus(userId) {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_documents,
          COUNT(*) FILTER (WHERE is_processed = true) as processed_documents,
          COUNT(*) FILTER (WHERE is_processed = false) as pending_documents
        FROM documents
        WHERE user_id = $1
      `;
      
      const result = await client.query(query, [userId]);
      const stats = result.rows[0];
      
      return {
        total: parseInt(stats.total_documents),
        processed: parseInt(stats.processed_documents),
        pending: parseInt(stats.pending_documents)
      };

    } catch (error) {
      logger.error('Error getting processing status:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Singleton instance
export const documentService = new DocumentService();