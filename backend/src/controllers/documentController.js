import { v4 as uuidv4 } from 'uuid';
import { documentService } from '../services/documentService.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import logger from '../utils/logger.js';

/**
 * Upload document
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const userId = req.user.id;
  const file = req.file;

  try {
    // Validate file
    if (file.size > 10 * 1024 * 1024) { // 10MB
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
    }

    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, TXT, and MD files are allowed'
      });
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop();
    const filename = `${uuidv4()}.${fileExtension}`;

    // Process document
    logger.info(`Processing document upload: ${file.originalname} for user: ${userId}`);
    
    const document = await documentService.processDocument(file, userId, filename);

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: { document }
    });

  } catch (error) {
    logger.error('Document upload error:', error);
    
    if (error.message.includes('No readable content')) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file contains no readable text content'
      });
    }
    
    if (error.message.includes('Failed to parse PDF')) {
      return res.status(400).json({
        success: false,
        message: 'Unable to parse PDF file. Please ensure it contains text content'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get user documents
 */
export const getDocuments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    limit = 20, 
    offset = 0, 
    processedOnly = false 
  } = req.query;

  try {
    const documents = await documentService.getUserDocuments(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      processedOnly: processedOnly === 'true'
    });

    // Get processing status
    const processingStatus = await documentService.getProcessingStatus(userId);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: documents.length
        },
        processing: processingStatus
      }
    });

  } catch (error) {
    logger.error('Error getting documents:', error);
    throw error;
  }
});

/**
 * Get document content
 */
export const getDocumentContent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const document = await documentService.getDocument(id, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: { document }
    });

  } catch (error) {
    logger.error('Error getting document content:', error);
    throw error;
  }
});

/**
 * Delete document
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const deleted = await documentService.deleteDocument(id, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting document:', error);
    
    if (error.message.includes('not found or access denied')) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    throw error;
  }
});

/**
 * Search documents
 */
export const searchDocuments = asyncHandler(async (req, res) => {
  const { query, limit = 5, threshold = 0.7 } = req.body;
  const userId = req.user.id;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  try {
    // Import AI coordinator here to avoid circular dependency
    const { aiCoordinator } = await import('../services/ai/aiCoordinator.js');
    
    // Generate embedding for search query
    const embeddingResult = await aiCoordinator.generateEmbedding(query);
    
    // Search similar chunks
    const results = await documentService.searchSimilarChunks(
      embeddingResult.embedding,
      userId,
      {
        limit: parseInt(limit),
        threshold: parseFloat(threshold)
      }
    );

    res.json({
      success: true,
      data: {
        query,
        results: results.map(result => ({
          id: result.id,
          documentId: result.document_id,
          filename: result.filename,
          originalFilename: result.original_filename,
          content: result.content,
          metadata: result.metadata,
          chunkIndex: result.chunk_index,
          similarity: parseFloat(result.similarity).toFixed(3)
        })),
        usage: embeddingResult.usage
      }
    });

  } catch (error) {
    logger.error('Document search error:', error);
    throw error;
  }
});

/**
 * Get document processing status
 */
export const getProcessingStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const status = await documentService.getProcessingStatus(userId);

    res.json({
      success: true,
      data: { status }
    });

  } catch (error) {
    logger.error('Error getting processing status:', error);
    throw error;
  }
});

/**
 * Reprocess document
 */
export const reprocessDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Get document
    const document = await documentService.getDocument(id, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Delete existing chunks
    const pool = (await import('../config/database.js')).default;
    const client = await pool.connect();
    
    try {
      await client.query('DELETE FROM document_chunks WHERE document_id = $1', [id]);
      await client.query('UPDATE documents SET is_processed = false WHERE id = $1', [id]);
      
      // Reprocess document
      await documentService.processDocumentAsync(id, document.content, client);
      
      logger.info(`Document reprocessed: ${id} by user: ${userId}`);
      
      res.json({
        success: true,
        message: 'Document reprocessing started'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Document reprocessing error:', error);
    throw error;
  }
});

/**
 * Get document chunks
 */
export const getDocumentChunks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { limit = 10, offset = 0 } = req.query;

  try {
    // Verify document ownership
    const document = await documentService.getDocument(id, userId);

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Get chunks
    const pool = (await import('../config/database.js')).default;
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          id,
          content,
          metadata,
          chunk_index,
          created_at
        FROM document_chunks
        WHERE document_id = $1
        ORDER BY chunk_index
        LIMIT $2 OFFSET $3
      `;
      
      const result = await client.query(query, [id, parseInt(limit), parseInt(offset)]);
      
      res.json({
        success: true,
        data: {
          document: {
            id: document.id,
            filename: document.filename,
            originalFilename: document.original_filename
          },
          chunks: result.rows,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: result.rows.length
          }
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error getting document chunks:', error);
    throw error;
  }
});