import { describe, it, expect, beforeEach, vi } from 'vitest'
import { geminiApi } from '../geminiApi'

// Mock Google Generative AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      startChat: vi.fn().mockReturnValue({
        sendMessage: vi.fn().mockResolvedValue({
          response: {
            text: vi.fn().mockReturnValue('AI response'),
          },
        }),
      }),
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue('Generated title'),
        },
      }),
    }),
  }),
}))

// Mock environment variables
vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', 'test-api-key')

describe('Gemini API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateResponse', () => {
    it('should generate response from messages', async () => {
      const messages = [
        {
          role: 'user' as const,
          parts: [{ text: 'Hello' }],
        },
        {
          role: 'model' as const,
          parts: [{ text: 'Hi there!' }],
        },
        {
          role: 'user' as const,
          parts: [{ text: 'How are you?' }],
        },
      ]

      const response = await geminiApi.generateResponse(messages)

      expect(response).toBe('AI response')
    })

    it('should handle empty message history', async () => {
      const messages = [
        {
          role: 'user' as const,
          parts: [{ text: 'First message' }],
        },
      ]

      const response = await geminiApi.generateResponse(messages)

      expect(response).toBe('AI response')
    })

    it('should handle API errors gracefully', async () => {
      // Mock to throw error
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: () => ({
            sendMessage: vi.fn().mockRejectedValue(new Error('API Error')),
          }),
          generateContent: vi.fn(),
        }),
      }))

      const messages = [
        {
          role: 'user' as const,
          parts: [{ text: 'Test' }],
        },
      ]

      await expect(geminiApi.generateResponse(messages)).rejects.toThrow('Failed to generate AI response')
    })
  })

  describe('generateSingleResponse', () => {
    it('should generate response from single prompt', async () => {
      const prompt = 'What is the weather like?'
      const response = await geminiApi.generateSingleResponse(prompt)

      expect(response).toBe('Generated title')
    })

    it('should handle API errors', async () => {
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: vi.fn(),
          generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
        }),
      }))

      await expect(geminiApi.generateSingleResponse('test')).rejects.toThrow('Failed to generate AI response')
    })
  })

  describe('generateConversationTitle', () => {
    it('should generate title from first message', async () => {
      const firstMessage = 'Help me write a Python script'
      const title = await geminiApi.generateConversationTitle(firstMessage)

      expect(title).toBe('Generated title')
    })

    it('should handle long titles', async () => {
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: vi.fn(),
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: vi.fn().mockReturnValue('This is a very long title that exceeds the maximum character limit and should be truncated'),
            },
          }),
        }),
      }))

      const title = await geminiApi.generateConversationTitle('Test message')
      
      expect(title.length).toBeLessThanOrEqual(50)
      expect(title).toContain('...')
    })

    it('should handle empty response', async () => {
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: vi.fn(),
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: vi.fn().mockReturnValue(''),
            },
          }),
        }),
      }))

      const title = await geminiApi.generateConversationTitle('Test message')
      
      expect(title).toBe('New Conversation')
    })

    it('should handle API errors gracefully', async () => {
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: vi.fn(),
          generateContent: vi.fn().mockRejectedValue(new Error('API Error')),
        }),
      }))

      const title = await geminiApi.generateConversationTitle('Test message')
      
      expect(title).toBe('New Conversation')
    })

    it('should remove quotes from generated title', async () => {
      const GoogleGenerativeAI = (await import('@google/generative-ai')).GoogleGenerativeAI
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: vi.fn(),
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: vi.fn().mockReturnValue('"Python Script Help"'),
            },
          }),
        }),
      }))

      const title = await geminiApi.generateConversationTitle('Test message')
      
      expect(title).toBe('Python Script Help')
      expect(title).not.toContain('"')
      expect(title).not.toContain("'")
    })
  })

  describe('Environment Variable Handling', () => {
    it('should handle missing API key', async () => {
      // Mock missing env variable
      vi.unstubAllEnvs()
      vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', '')

      // Create new instance without API key
      const { GeminiApiService } = await import('../geminiApi')
      const service = new GeminiApiService()

      await expect(service.generateResponse([
        { role: 'user' as const, parts: [{ text: 'Test' }] }
      ])).rejects.toThrow('Gemini API not configured')

      await expect(service.generateSingleResponse('Test')).rejects.toThrow('Gemini API not configured')

      const title = await service.generateConversationTitle('Test')
      expect(title).toBe('New Conversation')

      // Restore env variable
      vi.stubEnv('VITE_GOOGLE_GEMINI_API_KEY', 'test-api-key')
    })
  })
})