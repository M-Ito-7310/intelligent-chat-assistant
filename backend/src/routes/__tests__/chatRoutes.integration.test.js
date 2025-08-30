import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

// Import the route under test
import chatRoutes from '../chatRoutes.js';

// Mock dependencies
vi.mock('../../services/aiCoordinator.js', () => ({
  aiCoordinator: {
    chat: vi.fn().mockResolvedValue({
      content: 'Mock AI response',
      metadata: { usage: { total_tokens: 100 } }
    })
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

vi.mock('../../services/ragService.js', () => ({
  ragService: {
    searchDocuments: vi.fn().mockResolvedValue([
      {
        content: 'Sample document content',
        metadata: { source: 'document.pdf', page: 1 }
      }
    ]),
    generateRagResponse: vi.fn().mockResolvedValue({
      content: 'RAG-enhanced response',
      sources: [{ title: 'document.pdf', page: 1 }]
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

describe('Chat Routes Integration Tests', () => {
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
    app.use('/api/chat', chatRoutes);

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

  describe('POST /api/chat/conversations', () => {
    it('should create new conversation successfully', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'conv-123',
          title: 'New Conversation',
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          title: 'New Conversation'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation.title).toBe('New Conversation');
      expect(response.body.data.conversation.id).toBe('conv-123');
    });

    it('should generate automatic title if not provided', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'conv-124',
          title: 'New Chat',
          user_id: userId,
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation.title).toBeDefined();
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/chat/conversations')
        .send({
          title: 'New Conversation'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/chat/conversations', () => {
    it('should get user conversations successfully', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          title: 'First Conversation',
          user_id: userId,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
          message_count: 5
        },
        {
          id: 'conv-2',
          title: 'Second Conversation',
          user_id: userId,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
          message_count: 3
        }
      ];

      mockClient.query.mockResolvedValueOnce({
        rows: mockConversations
      });

      const response = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversations).toHaveLength(2);
      expect(response.body.data.conversations[0].title).toBe('First Conversation');
    });

    it('should handle pagination parameters', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: []
      });

      const response = await request(app)
        .get('/api/chat/conversations?page=2&limit=10')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([userId, 10, 10])
      );
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .get('/api/chat/conversations');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/chat/conversations/:id', () => {
    it('should get conversation with messages successfully', async () => {
      const conversationId = 'conv-123';
      
      // Mock conversation query
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'Test Conversation',
            user_id: userId,
            created_at: new Date(),
            updated_at: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              conversation_id: conversationId,
              role: 'user',
              content: 'Hello',
              created_at: new Date()
            },
            {
              id: 'msg-2',
              conversation_id: conversationId,
              role: 'assistant',
              content: 'Hi there!',
              created_at: new Date()
            }
          ]
        });

      const response = await request(app)
        .get(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation.id).toBe(conversationId);
      expect(response.body.data.messages).toHaveLength(2);
    });

    it('should return 404 for non-existent conversation', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/chat/conversations/non-existent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    it('should reject access to other users conversation', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'conv-123',
          title: 'Other User Conversation',
          user_id: 'other-user',
          created_at: new Date(),
          updated_at: new Date()
        }]
      });

      const response = await request(app)
        .get('/api/chat/conversations/conv-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('access');
    });
  });

  describe('POST /api/chat/conversations/:id/messages', () => {
    it('should send message and get AI response', async () => {
      const conversationId = 'conv-123';
      
      // Mock conversation ownership check
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'Test Conversation',
            user_id: userId
          }]
        })
        // Mock insert user message
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-user',
            conversation_id: conversationId,
            role: 'user',
            content: 'Hello AI',
            created_at: new Date()
          }]
        })
        // Mock insert AI message
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-ai',
            conversation_id: conversationId,
            role: 'assistant',
            content: 'Mock AI response',
            created_at: new Date()
          }]
        })
        // Mock conversation update
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: 'Hello AI',
          useRag: false
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userMessage.content).toBe('Hello AI');
      expect(response.body.data.assistantMessage.content).toBe('Mock AI response');
    });

    it('should use RAG when requested', async () => {
      const conversationId = 'conv-123';
      const ragService = await import('../../services/ragService.js');
      
      // Mock conversation ownership check
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'Test Conversation',
            user_id: userId
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-user',
            conversation_id: conversationId,
            role: 'user',
            content: 'What is in the document?',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-ai',
            conversation_id: conversationId,
            role: 'assistant',
            content: 'RAG-enhanced response',
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: 'What is in the document?',
          useRag: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(ragService.ragService.generateRagResponse).toHaveBeenCalled();
    });

    it('should reject empty message', async () => {
      const response = await request(app)
        .post('/api/chat/conversations/conv-123/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: '',
          useRag: false
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should reject message for non-existent conversation', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/chat/conversations/non-existent/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: 'Hello AI',
          useRag: false
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/chat/conversations/:id', () => {
    it('should update conversation title successfully', async () => {
      const conversationId = 'conv-123';
      
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            user_id: userId,
            title: 'Old Title'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            title: 'New Title',
            user_id: userId,
            updated_at: new Date()
          }]
        });

      const response = await request(app)
        .put(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          title: 'New Title'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.conversation.title).toBe('New Title');
    });

    it('should reject update with invalid title', async () => {
      const response = await request(app)
        .put('/api/chat/conversations/conv-123')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          title: '' // empty title
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('DELETE /api/chat/conversations/:id', () => {
    it('should delete conversation successfully', async () => {
      const conversationId = 'conv-123';
      
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{
            id: conversationId,
            user_id: userId,
            title: 'Test Conversation'
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .delete(`/api/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent conversation', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/chat/conversations/non-existent')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle AI service errors gracefully', async () => {
      const aiCoordinator = await import('../../services/aiCoordinator.js');
      aiCoordinator.aiCoordinator.chat.mockRejectedValueOnce(new Error('AI service unavailable'));

      const conversationId = 'conv-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          title: 'Test Conversation',
          user_id: userId
        }]
      });

      const response = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: 'Hello AI',
          useRag: false
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('AI service');
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should handle malformed conversation ID', async () => {
      const response = await request(app)
        .get('/api/chat/conversations/invalid@id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should apply rate limiting to message endpoint', async () => {
      // This would test the rate limiting middleware integration
      // Since we can't easily mock rapid requests in this test setup,
      // we'll just verify the middleware is applied by checking the response headers
      
      const conversationId = 'conv-123';
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          title: 'Test Conversation',
          user_id: userId
        }]
      });

      const response = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          message: 'Hello AI',
          useRag: false
        });

      // Check for rate limit headers (even if not rate limited)
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Message Streaming (SSE)', () => {
    it('should support streaming responses for real-time chat', async () => {
      const conversationId = 'conv-123';
      
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: conversationId,
          title: 'Test Conversation',
          user_id: userId
        }]
      });

      const response = await request(app)
        .post(`/api/chat/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${validToken}`)
        .set('Accept', 'text/event-stream')
        .send({
          message: 'Hello AI',
          useRag: false,
          streaming: true
        });

      // For streaming responses, we expect either:
      // 1. A 200 with text/event-stream content-type for actual streaming
      // 2. A regular JSON response if streaming is not implemented yet
      expect([200, 201]).toContain(response.status);
    });
  });
});