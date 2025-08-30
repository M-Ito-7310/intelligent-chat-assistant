import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Import the route under test
import documentRoutes from '../documentRoutes.js';

// Mock dependencies
vi.mock('../../services/documentService.js', () => ({
  documentService: {
    processDocument: vi.fn().mockResolvedValue({
      id: 'doc-123',
      title: 'Test Document',
      filename: 'test.pdf',
      chunks_created: 5,
      processing_status: 'completed'
    }),
    getDocuments: vi.fn().mockResolvedValue([
      {
        id: 'doc-1',
        title: 'First Document',
        filename: 'doc1.pdf',
        file_size: 1024,
        chunks_count: 3,
        created_at: new Date()
      }
    ]),
    deleteDocument: vi.fn().mockResolvedValue(true),
    getDocumentChunks: vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Sample chunk content',
        chunk_index: 0,
        embedding_vector: null
      }
    ])
  }
}));

vi.mock('../../services/ragService.js', () => ({
  ragService: {
    searchDocuments: vi.fn().mockResolvedValue([
      {
        id: 'doc-1',
        content: 'Relevant content found',
        similarity: 0.85,
        metadata: { source: 'document.pdf', page: 1 }
      }
    ])
  }
}));

vi.mock('../../config/database.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn()
    })
  }
}));

vi.mock('../../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock file system operations
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('PDF content'))
  }
}));

describe('Document Routes Integration Tests', () => {
  let app;
  let mockDb;
  let mockClient;
  let validToken;
  let userId;

  beforeAll(async () => {
    // Create test app
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api/documents', documentRoutes);

    // Setup test user and token
    userId = 'test-user-123';
    validToken = jwt.sign(
      { userId, type: 'access' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    // Setup mock database client
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    mockDb = await import('../../config/database.js');
    mockDb.default.connect.mockResolvedValue(mockClient);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe('POST /api/documents/upload', () => {
    it('should upload and process document successfully', async () => {
      const documentService = await import('../../services/documentService.js');
      
      // Create a test PDF buffer
      const testPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n%%EOF');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', testPdfBuffer, {
          filename: 'test-document.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.document.title).toBe('Test Document');
      expect(documentService.documentService.processDocument).toHaveBeenCalled();
    });

    it('should reject non-PDF files', async () => {
      const testTextBuffer = Buffer.from('This is a text file');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', testTextBuffer, {
          filename: 'test.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('PDF');
    });

    it('should reject files that are too large', async () => {
      // Create a large buffer (simulate file size check)
      const largePdfBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', largePdfBuffer, {
          filename: 'large-document.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(413);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('File too large');
    });

    it('should require authentication', async () => {
      const testPdfBuffer = Buffer.from('%PDF-1.4\n%%EOF');

      const response = await request(app)
        .post('/api/documents/upload')
        .attach('file', testPdfBuffer, {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should require file upload', async () => {
      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('file');
    });

    it('should handle processing errors gracefully', async () => {
      const documentService = await import('../../services/documentService.js');
      documentService.documentService.processDocument.mockRejectedValueOnce(
        new Error('Document processing failed')
      );

      const testPdfBuffer = Buffer.from('%PDF-1.4\n%%EOF');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', testPdfBuffer, {
          filename: 'problematic.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('processing');
    });
  });

  describe('POST /api/documents/bulk-upload', () => {
    it('should handle multiple file uploads', async () => {
      const documentService = await import('../../services/documentService.js');
      
      const testPdf1 = Buffer.from('%PDF-1.4\n1 0 obj\nDoc1\n%%EOF');
      const testPdf2 = Buffer.from('%PDF-1.4\n1 0 obj\nDoc2\n%%EOF');

      const response = await request(app)
        .post('/api/documents/bulk-upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('files', testPdf1, {
          filename: 'doc1.pdf',
          contentType: 'application/pdf'
        })
        .attach('files', testPdf2, {
          filename: 'doc2.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(documentService.documentService.processDocument).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures in bulk upload', async () => {
      const documentService = await import('../../services/documentService.js');
      
      // Mock first call to succeed, second to fail
      documentService.documentService.processDocument
        .mockResolvedValueOnce({
          id: 'doc-1',
          title: 'Success Document',
          processing_status: 'completed'
        })
        .mockRejectedValueOnce(new Error('Processing failed'));

      const testPdf1 = Buffer.from('%PDF-1.4\nSuccess\n%%EOF');
      const testPdf2 = Buffer.from('%PDF-1.4\nFail\n%%EOF');

      const response = await request(app)
        .post('/api/documents/bulk-upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('files', testPdf1, { filename: 'success.pdf', contentType: 'application/pdf' })
        .attach('files', testPdf2, { filename: 'fail.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(207); // Multi-status
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.results[0].success).toBe(true);
      expect(response.body.data.results[1].success).toBe(false);
    });

    it('should enforce file count limits', async () => {
      const response = await request(app)
        .post('/api/documents/bulk-upload')
        .set('Authorization', `Bearer ${validToken}`)
        .send({}); // No files

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('files');
    });
  });

  describe('GET /api/documents', () => {
    it('should get user documents successfully', async () => {
      const documentService = await import('../../services/documentService.js');
      
      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.documents).toHaveLength(1);
      expect(response.body.data.documents[0].title).toBe('First Document');
      expect(documentService.documentService.getDocuments).toHaveBeenCalledWith(userId);
    });

    it('should handle pagination parameters', async () => {
      const documentService = await import('../../services/documentService.js');

      const response = await request(app)
        .get('/api/documents?page=2&limit=5&sort=created_at&order=desc')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(documentService.documentService.getDocuments).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 2,
          limit: 5,
          sort: 'created_at',
          order: 'desc'
        })
      );
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/documents');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors', async () => {
      const documentService = await import('../../services/documentService.js');
      documentService.documentService.getDocuments.mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/documents/:id', () => {
    it('should get specific document successfully', async () => {
      const documentId = 'doc-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: userId,
          title: 'Test Document',
          filename: 'test.pdf',
          file_size: 2048,
          processing_status: 'completed',
          chunks_created: 5,
          created_at: new Date()
        }]
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.document.title).toBe('Test Document');
    });

    it('should return 404 for non-existent document', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/documents/non-existent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    it('should reject access to other users document', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'doc-123',
          user_id: 'other-user',
          title: 'Other User Document'
        }]
      });

      const response = await request(app)
        .get('/api/documents/doc-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('access');
    });
  });

  describe('GET /api/documents/:id/chunks', () => {
    it('should get document chunks successfully', async () => {
      const documentId = 'doc-123';
      const documentService = await import('../../services/documentService.js');

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: userId,
          title: 'Test Document'
        }]
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}/chunks`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.chunks).toHaveLength(1);
      expect(documentService.documentService.getDocumentChunks).toHaveBeenCalledWith(documentId);
    });

    it('should handle pagination for chunks', async () => {
      const documentId = 'doc-123';
      const documentService = await import('../../services/documentService.js');

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: userId,
          title: 'Test Document'
        }]
      });

      const response = await request(app)
        .get(`/api/documents/${documentId}/chunks?page=2&limit=10`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(documentService.documentService.getDocumentChunks).toHaveBeenCalledWith(
        documentId,
        expect.objectContaining({ page: 2, limit: 10 })
      );
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should delete document successfully', async () => {
      const documentId = 'doc-123';
      const documentService = await import('../../services/documentService.js');

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: userId,
          title: 'Test Document',
          filename: 'test.pdf'
        }]
      });

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
      expect(documentService.documentService.deleteDocument).toHaveBeenCalledWith(documentId, userId);
    });

    it('should return 404 for non-existent document', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/documents/non-existent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should handle deletion errors', async () => {
      const documentId = 'doc-123';
      const documentService = await import('../../services/documentService.js');
      
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: userId,
          title: 'Test Document'
        }]
      });

      documentService.documentService.deleteDocument.mockResolvedValueOnce(false);

      const response = await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed to delete');
    });
  });

  describe('POST /api/documents/search', () => {
    it('should search documents successfully', async () => {
      const ragService = await import('../../services/ragService.js');

      const response = await request(app)
        .post('/api/documents/search')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          query: 'machine learning algorithms',
          limit: 5,
          similarity_threshold: 0.7
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].similarity).toBe(0.85);
      expect(ragService.ragService.searchDocuments).toHaveBeenCalledWith(
        'machine learning algorithms',
        userId,
        expect.objectContaining({
          limit: 5,
          similarityThreshold: 0.7
        })
      );
    });

    it('should validate search query', async () => {
      const response = await request(app)
        .post('/api/documents/search')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          query: '', // Empty query
          limit: 5
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should handle search service errors', async () => {
      const ragService = await import('../../services/ragService.js');
      ragService.ragService.searchDocuments.mockRejectedValueOnce(
        new Error('Search service unavailable')
      );

      const response = await request(app)
        .post('/api/documents/search')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          query: 'test query',
          limit: 5
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Search failed');
    });

    it('should apply default parameters when not provided', async () => {
      const ragService = await import('../../services/ragService.js');

      const response = await request(app)
        .post('/api/documents/search')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          query: 'simple query'
        });

      expect(response.status).toBe(200);
      expect(ragService.ragService.searchDocuments).toHaveBeenCalledWith(
        'simple query',
        userId,
        expect.objectContaining({
          limit: 10, // Default limit
          similarityThreshold: 0.5 // Default threshold
        })
      );
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should apply rate limiting to upload endpoint', async () => {
      // Test that rate limiting headers are present
      const testPdfBuffer = Buffer.from('%PDF-1.4\n%%EOF');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', testPdfBuffer, {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        });

      // Should have rate limit headers (even if not rate limited)
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });

    it('should have stricter limits for bulk upload', async () => {
      const testPdfBuffer = Buffer.from('%PDF-1.4\n%%EOF');

      const response = await request(app)
        .post('/api/documents/bulk-upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('files', testPdfBuffer, {
          filename: 'test.pdf',
          contentType: 'application/pdf'
        });

      // Bulk upload should have lower rate limits
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('File Validation', () => {
    it('should validate file MIME type', async () => {
      const fakeImageBuffer = Buffer.from('fake image data');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', fakeImageBuffer, {
          filename: 'image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('PDF');
    });

    it('should validate file extension', async () => {
      const testBuffer = Buffer.from('%PDF-1.4\n%%EOF');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', testBuffer, {
          filename: 'document.txt', // Wrong extension
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should detect malicious files', async () => {
      const maliciousBuffer = Buffer.from('<script>alert("xss")</script>');

      const response = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${validToken}`)
        .attach('file', maliciousBuffer, {
          filename: 'malicious.pdf',
          contentType: 'application/pdf'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });
  });
});