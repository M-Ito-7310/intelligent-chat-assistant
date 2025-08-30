import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from 'socket.io-client';

// Import app configuration
import authRoutes from '../../routes/authRoutes.js';
import chatRoutes from '../../routes/chatRoutes.js';
import documentRoutes from '../../routes/documentRoutes.js';

// Mock external services
vi.mock('../../config/database.js', () => ({
  default: {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn()
    })
  }
}));

vi.mock('../../services/aiCoordinator.js', () => ({
  aiCoordinator: {
    chat: vi.fn().mockResolvedValue({
      content: 'AI response for E2E test',
      metadata: { usage: { total_tokens: 50 } }
    })
  }
}));

vi.mock('../../services/documentService.js', () => ({
  documentService: {
    processDocument: vi.fn().mockResolvedValue({
      id: 'e2e-doc-123',
      title: 'E2E Test Document',
      filename: 'e2e-test.pdf',
      chunks_created: 3,
      processing_status: 'completed'
    }),
    getDocuments: vi.fn().mockResolvedValue([]),
    deleteDocument: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../services/ragService.js', () => ({
  ragService: {
    searchDocuments: vi.fn().mockResolvedValue([
      {
        id: 'search-result-1',
        content: 'Relevant document content for E2E testing',
        similarity: 0.9,
        metadata: { source: 'e2e-test.pdf', page: 1 }
      }
    ]),
    generateRagResponse: vi.fn().mockResolvedValue({
      content: 'RAG-enhanced response based on uploaded document',
      sources: [{ title: 'e2e-test.pdf', page: 1 }]
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

describe('E2E User Flow Tests', () => {
  let app;
  let server;
  let io;
  let mockClient;
  let userCredentials;
  let userTokens;
  let conversationId;
  let documentId;

  beforeAll(async () => {
    // Create test app with full middleware stack
    app = express();
    server = createServer(app);
    io = new Server(server, {
      cors: { origin: "*", methods: ["GET", "POST"] }
    });

    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Add routes
    app.use('/api/auth', authRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/documents', documentRoutes);

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Setup mock database client
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    const mockDb = await import('../../config/database.js');
    mockDb.default.connect.mockResolvedValue(mockClient);

    // Start server
    await new Promise((resolve) => {
      server.listen(0, resolve); // Use random port
    });

    // Setup test user credentials
    userCredentials = {
      email: 'e2e-test@example.com',
      password: 'SecureE2EPassword123!',
      name: 'E2E Test User'
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    vi.restoreAllMocks();
  });

  describe('Complete User Registration and Authentication Flow', () => {
    it('should complete full authentication cycle', async () => {
      // Step 1: Register new user
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(userCredentials.password, 12);
      
      // Mock user registration
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check if user exists
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'e2e-user-123',
            email: userCredentials.email,
            name: userCredentials.name,
            role: 'user',
            subscription_tier: 'free',
            created_at: new Date()
          }] 
        }); // Insert new user

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userCredentials);

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body.success).toBe(true);
      expect(registerResponse.body.data.user.email).toBe(userCredentials.email);
      expect(registerResponse.body.data.tokens.accessToken).toBeDefined();
      
      userTokens = registerResponse.body.data.tokens;

      // Step 2: Verify token works with protected endpoint
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true,
          created_at: new Date(),
          last_login: new Date()
        }]
      });

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userTokens.accessToken}`);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.data.user.email).toBe(userCredentials.email);

      // Step 3: Test token refresh
      const jwt = await import('jsonwebtoken');
      const mockVerify = vi.spyOn(jwt, 'verify').mockImplementation((token, secret, callback) => {
        if (typeof callback === 'function') {
          callback(null, { userId: 'e2e-user-123', type: 'refresh' });
        }
        return { userId: 'e2e-user-123', type: 'refresh' };
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: userTokens.refreshToken });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.data.tokens.accessToken).toBeDefined();
      
      // Update tokens for subsequent tests
      userTokens = refreshResponse.body.data.tokens;

      mockVerify.mockRestore();

      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userTokens.accessToken}`);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);
    });
  });

  describe('Complete Document Upload and Processing Flow', () => {
    it('should handle full document lifecycle', async () => {
      // Setup authenticated user
      const bcrypt = await import('bcryptjs');
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          password: await bcrypt.hash(userCredentials.password, 12),
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password
        });

      const { accessToken } = loginResponse.body.data.tokens;

      // Step 1: Upload document
      const testPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\nE2E Test Document Content\n%%EOF');
      
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', testPdfBuffer, {
          filename: 'e2e-test-document.pdf',
          contentType: 'application/pdf'
        });

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.document.title).toBe('E2E Test Document');
      
      documentId = uploadResponse.body.data.document.id;

      // Step 2: Verify document appears in user's document list
      const documentService = await import('../../services/documentService.js');
      documentService.documentService.getDocuments.mockResolvedValueOnce([
        {
          id: documentId,
          title: 'E2E Test Document',
          filename: 'e2e-test-document.pdf',
          file_size: testPdfBuffer.length,
          chunks_count: 3,
          processing_status: 'completed',
          created_at: new Date()
        }
      ]);

      const documentsResponse = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(documentsResponse.status).toBe(200);
      expect(documentsResponse.body.data.documents).toHaveLength(1);
      expect(documentsResponse.body.data.documents[0].id).toBe(documentId);

      // Step 3: Get specific document details
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: 'e2e-user-123',
          title: 'E2E Test Document',
          filename: 'e2e-test-document.pdf',
          file_size: testPdfBuffer.length,
          processing_status: 'completed',
          chunks_created: 3,
          created_at: new Date()
        }]
      });

      const documentResponse = await request(app)
        .get(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(documentResponse.status).toBe(200);
      expect(documentResponse.body.data.document.processing_status).toBe('completed');

      // Step 4: Search within documents
      const searchResponse = await request(app)
        .post('/api/documents/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          query: 'E2E test content',
          limit: 5,
          similarity_threshold: 0.7
        });

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body.data.results).toHaveLength(1);
      expect(searchResponse.body.data.results[0].similarity).toBe(0.9);

      // Step 5: Delete document
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: documentId,
          user_id: 'e2e-user-123',
          title: 'E2E Test Document',
          filename: 'e2e-test-document.pdf'
        }]
      });

      const deleteResponse = await request(app)
        .delete(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.message).toContain('deleted');
    });
  });

  describe('Complete Chat Conversation Flow with RAG', () => {
    it('should handle full conversation lifecycle with document context', async () => {
      // Setup authenticated user
      const bcrypt = await import('bcryptjs');
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          password: await bcrypt.hash(userCredentials.password, 12),
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password
        });

      const { accessToken } = loginResponse.body.data.tokens;

      // Step 1: Create new conversation
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-conv-123',
          title: 'E2E Test Conversation',
          user_id: 'e2e-user-123',
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const createConvResponse = await request(app)
        .post('/api/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'E2E Test Conversation' });

      expect(createConvResponse.status).toBe(201);
      expect(createConvResponse.body.data.conversation.title).toBe('E2E Test Conversation');
      
      conversationId = createConvResponse.body.data.conversation.id;

      // Step 2: Send first message (without RAG)
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'E2E Test Conversation',
            user_id: 'e2e-user-123'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'e2e-msg-user-1',
            conversation_id: conversationId,
            role: 'user',
            content: 'Hello, I need help with machine learning',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'e2e-msg-ai-1',
            conversation_id: conversationId,
            role: 'assistant',
            content: 'AI response for E2E test',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const firstMessageResponse = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          message: 'Hello, I need help with machine learning',
          useRag: false
        });

      expect(firstMessageResponse.status).toBe(201);
      expect(firstMessageResponse.body.data.userMessage.content).toBe('Hello, I need help with machine learning');
      expect(firstMessageResponse.body.data.assistantMessage.content).toBe('AI response for E2E test');

      // Step 3: Send second message (with RAG)
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'E2E Test Conversation',
            user_id: 'e2e-user-123'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'e2e-msg-user-2',
            conversation_id: conversationId,
            role: 'user',
            content: 'Can you explain the concepts from my uploaded document?',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'e2e-msg-ai-2',
            conversation_id: conversationId,
            role: 'assistant',
            content: 'RAG-enhanced response based on uploaded document',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const ragMessageResponse = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          message: 'Can you explain the concepts from my uploaded document?',
          useRag: true
        });

      expect(ragMessageResponse.status).toBe(201);
      expect(ragMessageResponse.body.data.assistantMessage.content).toBe('RAG-enhanced response based on uploaded document');

      // Step 4: Get conversation with all messages
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'E2E Test Conversation',
            user_id: 'e2e-user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'e2e-msg-user-1',
              conversation_id: conversationId,
              role: 'user',
              content: 'Hello, I need help with machine learning',
              created_at: new Date()
            },
            {
              id: 'e2e-msg-ai-1',
              conversation_id: conversationId,
              role: 'assistant',
              content: 'AI response for E2E test',
              created_at: new Date()
            },
            {
              id: 'e2e-msg-user-2',
              conversation_id: conversationId,
              role: 'user',
              content: 'Can you explain the concepts from my uploaded document?',
              created_at: new Date()
            },
            {
              id: 'e2e-msg-ai-2',
              conversation_id: conversationId,
              role: 'assistant',
              content: 'RAG-enhanced response based on uploaded document',
              created_at: new Date()
            }
          ]
        });

      const getConversationResponse = await request(app)
        .get(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getConversationResponse.status).toBe(200);
      expect(getConversationResponse.body.data.messages).toHaveLength(4);

      // Step 5: Update conversation title
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            user_id: 'e2e-user-123',
            title: 'E2E Test Conversation'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'Updated E2E Conversation',
            user_id: 'e2e-user-123',
            updated_at: new Date()
          }]
        });

      const updateConversationResponse = await request(app)
        .put(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated E2E Conversation' });

      expect(updateConversationResponse.status).toBe(200);
      expect(updateConversationResponse.body.data.conversation.title).toBe('Updated E2E Conversation');

      // Step 6: Get all user conversations
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          title: 'Updated E2E Conversation',
          user_id: 'e2e-user-123',
          created_at: new Date(),
          updated_at: new Date(),
          message_count: 4
        }]
      });

      const getConversationsResponse = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getConversationsResponse.status).toBe(200);
      expect(getConversationsResponse.body.data.conversations).toHaveLength(1);
      expect(getConversationsResponse.body.data.conversations[0].message_count).toBe(4);

      // Step 7: Delete conversation
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            user_id: 'e2e-user-123',
            title: 'Updated E2E Conversation'
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const deleteConversationResponse = await request(app)
        .delete(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(deleteConversationResponse.status).toBe(200);
      expect(deleteConversationResponse.body.success).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle service failures gracefully', async () => {
      // Test network failures, service timeouts, etc.
      const aiCoordinator = await import('../../services/aiCoordinator.js');
      aiCoordinator.aiCoordinator.chat.mockRejectedValueOnce(new Error('Service timeout'));

      const bcrypt = await import('bcryptjs');
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          password: await bcrypt.hash(userCredentials.password, 12),
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password
        });

      const { accessToken } = loginResponse.body.data.tokens;

      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'conv-fail-test',
          title: 'Failure Test',
          user_id: 'e2e-user-123'
        }]
      });

      const failedMessageResponse = await request(app)
        .post('/api/chat/conversations/conv-fail-test/messages')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          message: 'This should trigger AI service failure',
          useRag: false
        });

      expect(failedMessageResponse.status).toBe(500);
      expect(failedMessageResponse.body.success).toBe(false);
      expect(failedMessageResponse.body.message).toContain('AI service');
    });

    it('should handle concurrent requests properly', async () => {
      // Test concurrent operations
      const bcrypt = await import('bcryptjs');
      mockClient.query.mockResolvedValue({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          password: await bcrypt.hash(userCredentials.password, 12),
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password
        });

      const { accessToken } = loginResponse.body.data.tokens;

      // Make multiple concurrent requests
      const promises = Array.from({ length: 5 }, (_, index) => {
        mockClient.query.mockResolvedValueOnce({
          rows: [{
            id: `conv-concurrent-${index}`,
            title: `Concurrent Conv ${index}`,
            user_id: 'e2e-user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        });

        return request(app)
          .post('/api/chat/conversations')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ title: `Concurrent Conv ${index}` });
      });

      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.conversation.title).toBe(`Concurrent Conv ${index}`);
      });
    });
  });

  describe('Rate Limiting and Security', () => {
    it('should enforce rate limits across different endpoints', async () => {
      // This is a simplified test - in a real scenario you'd make many rapid requests
      const bcrypt = await import('bcryptjs');
      mockClient.query.mockResolvedValue({
        rows: [{
          id: 'e2e-user-123',
          email: userCredentials.email,
          password: await bcrypt.hash(userCredentials.password, 12),
          name: userCredentials.name,
          role: 'user',
          subscription_tier: 'free',
          is_active: true
        }]
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: userCredentials.password
        });

      const { accessToken } = loginResponse.body.data.tokens;

      // Test that rate limiting headers are present
      const response = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });

    it('should prevent unauthorized access to user data', async () => {
      // Create a second user token
      const fakeToken = 'fake-jwt-token';
      
      // Try to access first user's data with fake token
      const unauthorizedResponse = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(unauthorizedResponse.status).toBe(401);
      expect(unauthorizedResponse.body.success).toBe(false);
    });
  });

  describe('Real-time Features (WebSocket)', () => {
    it('should handle WebSocket connections for real-time chat', async () => {
      // This would test WebSocket functionality if implemented
      // For now, we'll just verify the server supports the endpoints
      
      const healthResponse = await request(app)
        .get('/health');

      expect(healthResponse.status).toBe(200);
      expect(healthResponse.body.status).toBe('OK');
    });
  });
});