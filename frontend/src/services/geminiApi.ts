import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = 'AIzaSyCBHbNzmwYtEsG049uGc_lbjeOo0igTNxc'

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(API_KEY)

// Get Gemini model
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

export interface GeminiMessage {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export class GeminiApiService {
  async generateResponse(messages: GeminiMessage[]): Promise<string> {
    try {
      // Create chat session with history
      const chat = model.startChat({
        history: messages.slice(0, -1), // All messages except the last one
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      })

      // Send the latest message
      const lastMessage = messages[messages.length - 1]
      const result = await chat.sendMessage(lastMessage.parts[0].text)
      const response = await result.response
      
      return response.text()
    } catch (error) {
      console.error('Gemini API error:', error)
      throw new Error('Failed to generate AI response')
    }
  }

  async generateSingleResponse(prompt: string): Promise<string> {
    try {
      const result = await model.generateContent(prompt)
      const response = await result.response
      return response.text()
    } catch (error) {
      console.error('Gemini API error:', error)
      throw new Error('Failed to generate AI response')
    }
  }

  // Generate a conversation title based on the first message
  async generateConversationTitle(firstMessage: string): Promise<string> {
    try {
      const prompt = `Based on this user message, generate a short, descriptive title for the conversation (max 5 words): "${firstMessage}"`
      const result = await model.generateContent(prompt)
      const response = await result.response
      let title = response.text().replace(/['"]/g, '').trim()
      
      // Ensure title is not too long
      if (title.length > 50) {
        title = title.substring(0, 47) + '...'
      }
      
      return title || 'New Conversation'
    } catch (error) {
      console.error('Failed to generate title:', error)
      return 'New Conversation'
    }
  }
}

export const geminiApi = new GeminiApiService()