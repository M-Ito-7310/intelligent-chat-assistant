import { jest } from '@jest/globals'
import request from 'supertest'
import express from 'express'
import chatController from '../../src/controllers/chatController.js'

// Mock dependencies
jest.mock('../../src/services/ai/aiCoordinator.js', () => ({
  generateResponse: jest.fn()
}))

jest.mock('../../src/services/contextService.js', () => ({
  addMessage: jest.fn(),
  getConversationContext: jest.fn(),
  createConversation: jest.fn(),
  updateConversationTitle: jest.fn()
}))

jest.mock('../../src/services/ragService.js', () => ({
  searchDocuments: jest.fn()
}))

jest.mock('../../src/config/database.js', () => ({
  query: jest.fn()
}))

const app = express()
app.use(express.json())
app.use((req, res, next) => {
  req.user = { id: 'test-user-id', email: 'test@example.com' }
  next()
})

app.post('/chat/message', chatController.sendMessage)
app.get('/chat/conversations', chatController.getConversations)
app.get('/chat/conversations/:id', chatController.getConversation)
app.delete('/chat/conversations/:id', chatController.deleteConversation)

describe('Chat Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /chat/message', () => {
    it('should send message and get AI response', async () => {
      const mockConversation = { id: 'conv-1', title: 'Test Conversation' }
      const mockResponse = { content: 'AI response', usage: { tokens: 100 } }
      
      const contextService = await import('../../src/services/contextService.js')
      const aiCoordinator = await import('../../src/services/ai/aiCoordinator.js')
      
      contextService.createConversation.mockResolvedValue(mockConversation)
      contextService.addMessage.mockResolvedValue({ id: 'msg-1' })
      aiCoordinator.generateResponse.mockResolvedValue(mockResponse)

      const response = await request(app)
        .post('/chat/message')
        .send({
          message: 'Hello AI',
          conversationId: 'conv-1'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.assistantMessage.content).toBe('AI response')
      expect(contextService.addMessage).toHaveBeenCalledTimes(2) // User and AI message
    })

    it('should handle RAG-enabled queries', async () => {
      const mockSources = [
        { id: 'doc-1', filename: 'test.pdf', content: 'relevant content' }
      ]
      const mockResponse = { 
        content: 'AI response with context', 
        usage: { tokens: 150 },
        sources: mockSources
      }
      
      const ragService = await import('../../src/services/ragService.js')
      const aiCoordinator = await import('../../src/services/ai/aiCoordinator.js')
      
      ragService.searchDocuments.mockResolvedValue(mockSources)
      aiCoordinator.generateResponse.mockResolvedValue(mockResponse)

      const response = await request(app)
        .post('/chat/message')
        .send({
          message: 'What does the document say?',
          conversationId: 'conv-1',
          enableRAG: true
        })

      expect(response.status).toBe(200)
      expect(response.body.data.assistantMessage.sources).toEqual(mockSources)
      expect(ragService.searchDocuments).toHaveBeenCalled()
    })

    it('should return 400 for missing message', async () => {
      const response = await request(app)
        .post('/chat/message')
        .send({
          conversationId: 'conv-1'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  describe('GET /chat/conversations', () => {
    it('should return user conversations', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Test 1', created_at: new Date() },
        { id: 'conv-2', title: 'Test 2', created_at: new Date() }
      ]

      global.mockPool.query.mockResolvedValue({ rows: mockConversations })

      const response = await request(app).get('/chat/conversations')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.conversations).toHaveLength(2)
    })

    it('should handle empty conversations', async () => {
      global.mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app).get('/chat/conversations')

      expect(response.status).toBe(200)
      expect(response.body.data.conversations).toEqual([])
    })
  })

  describe('GET /chat/conversations/:id', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = {
        id: 'conv-1',
        title: 'Test Conversation',
        messages: [
          { id: 'msg-1', content: 'Hello', role: 'user' },
          { id: 'msg-2', content: 'Hi there!', role: 'assistant' }
        ]
      }

      const contextService = await import('../../src/services/contextService.js')
      contextService.getConversationContext.mockResolvedValue(mockConversation)

      const response = await request(app).get('/chat/conversations/conv-1')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.messages).toHaveLength(2)
    })

    it('should return 404 for non-existent conversation', async () => {
      const contextService = await import('../../src/services/contextService.js')
      contextService.getConversationContext.mockResolvedValue(null)

      const response = await request(app).get('/chat/conversations/invalid-id')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })

  describe('DELETE /chat/conversations/:id', () => {
    it('should delete conversation successfully', async () => {
      global.mockPool.query.mockResolvedValue({ rows: [{ id: 'conv-1' }] })

      const response = await request(app).delete('/chat/conversations/conv-1')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    it('should return 404 for non-existent conversation', async () => {
      global.mockPool.query.mockResolvedValue({ rows: [] })

      const response = await request(app).delete('/chat/conversations/invalid-id')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })
})