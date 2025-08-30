import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Context Service
 * Manages conversation context, message history, and token limits
 */
export class ContextService {
  constructor() {
    // Context window limits for different models
    this.contextLimits = {
      'gpt-4': 8192,
      'gpt-4-turbo': 128000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-3.5-turbo': 4096,
      'default': 4096
    };

    // Default system message for the chatbot
    this.defaultSystemMessage = {
      role: 'system',
      content: `You are a helpful AI assistant. You can answer questions, provide information, and help with various tasks. 
      
Key guidelines:
- Be helpful, accurate, and concise
- If you don't know something, say so clearly
- Ask for clarification if questions are ambiguous
- Maintain context throughout the conversation
- Be respectful and professional`
    };

    logger.info('Context service initialized');
  }

  /**
   * Get conversation context with message history
   */
  async getConversationContext(conversationId, options = {}) {
    const client = await pool.connect();
    
    try {
      const limit = options.messageLimit || 50;
      const includeSystem = options.includeSystem !== false;

      // Get conversation info
      const conversationQuery = `
        SELECT c.*, u.name as user_name
        FROM conversations c
        JOIN users u ON c.user_id = u.id
        WHERE c.id = $1
      `;
      const conversationResult = await client.query(conversationQuery, [conversationId]);
      
      if (conversationResult.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      const conversation = conversationResult.rows[0];

      // Get message history
      const messagesQuery = `
        SELECT id, role, content, metadata, token_count, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      const messagesResult = await client.query(messagesQuery, [conversationId, limit]);
      
      // Reverse to get chronological order
      const messages = messagesResult.rows.reverse();

      // Add system message if not present and requested
      if (includeSystem && (messages.length === 0 || messages[0].role !== 'system')) {
        messages.unshift({
          ...this.defaultSystemMessage,
          id: 'system-default',
          created_at: new Date(),
          token_count: this.estimateTokens(this.defaultSystemMessage.content)
        });
      }

      return {
        conversation,
        messages,
        totalMessages: messages.length,
        totalTokens: messages.reduce((sum, msg) => sum + (msg.token_count || 0), 0)
      };

    } catch (error) {
      logger.error('Error getting conversation context:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Build context for AI request with token management
   */
  async buildAIContext(conversationId, newMessage, options = {}) {
    try {
      const model = options.model || 'default';
      const maxTokens = this.contextLimits[model] || this.contextLimits.default;
      const reservedTokens = options.reservedTokens || 1000; // Reserve for response
      const availableTokens = maxTokens - reservedTokens;

      // Get conversation context
      const context = await this.getConversationContext(conversationId, {
        messageLimit: options.messageLimit || 100
      });

      // Add new user message
      const userMessage = {
        role: 'user',
        content: newMessage,
        token_count: this.estimateTokens(newMessage)
      };

      const messages = [...context.messages, userMessage];
      
      // Optimize context to fit within token limits
      const optimizedMessages = this.optimizeContext(messages, availableTokens);

      return {
        messages: optimizedMessages,
        conversation: context.conversation,
        totalTokens: optimizedMessages.reduce((sum, msg) => sum + (msg.token_count || 0), 0),
        truncated: optimizedMessages.length < messages.length
      };

    } catch (error) {
      logger.error('Error building AI context:', error);
      throw error;
    }
  }

  /**
   * Optimize context to fit within token limits
   */
  optimizeContext(messages, maxTokens) {
    if (messages.length === 0) return messages;

    let totalTokens = 0;
    const optimizedMessages = [];
    
    // Always include system message if present
    if (messages[0].role === 'system') {
      optimizedMessages.push(messages[0]);
      totalTokens += messages[0].token_count || 0;
    }

    // Add messages from most recent backwards
    for (let i = messages.length - 1; i >= (messages[0].role === 'system' ? 1 : 0); i--) {
      const message = messages[i];
      const messageTokens = message.token_count || this.estimateTokens(message.content);
      
      if (totalTokens + messageTokens <= maxTokens) {
        optimizedMessages.splice(messages[0].role === 'system' ? 1 : 0, 0, message);
        totalTokens += messageTokens;
      } else {
        // Try to include partial message if it's the user's latest message
        if (i === messages.length - 1 && message.role === 'user') {
          const availableTokens = maxTokens - totalTokens;
          const truncatedContent = this.truncateText(message.content, availableTokens);
          
          if (truncatedContent.length > 0) {
            optimizedMessages.splice(messages[0].role === 'system' ? 1 : 0, 0, {
              ...message,
              content: truncatedContent,
              token_count: availableTokens
            });
          }
        }
        break;
      }
    }

    return optimizedMessages;
  }

  /**
   * Save message to database
   */
  async saveMessage(conversationId, role, content, metadata = {}) {
    const client = await pool.connect();
    
    try {
      const tokenCount = this.estimateTokens(content);
      
      const query = `
        INSERT INTO messages (conversation_id, role, content, metadata, token_count)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at
      `;
      
      const result = await client.query(query, [
        conversationId,
        role,
        content,
        JSON.stringify(metadata),
        tokenCount
      ]);

      // Update conversation timestamp
      await client.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      logger.info(`Message saved: ${role} in conversation ${conversationId}`);
      
      return {
        id: result.rows[0].id,
        created_at: result.rows[0].created_at,
        token_count: tokenCount
      };

    } catch (error) {
      logger.error('Error saving message:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create new conversation
   */
  async createConversation(userId, title = 'New Conversation') {
    const client = await pool.connect();
    
    try {
      const query = `
        INSERT INTO conversations (user_id, title)
        VALUES ($1, $2)
        RETURNING id, created_at
      `;
      
      const result = await client.query(query, [userId, title]);
      
      logger.info(`New conversation created for user ${userId}`);
      
      return {
        id: result.rows[0].id,
        title,
        created_at: result.rows[0].created_at
      };

    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate conversation title from messages
   */
  async generateConversationTitle(conversationId) {
    try {
      const context = await this.getConversationContext(conversationId, {
        messageLimit: 5,
        includeSystem: false
      });

      if (context.messages.length === 0) return 'New Conversation';

      // Use first user message as basis for title
      const firstUserMessage = context.messages.find(m => m.role === 'user');
      if (!firstUserMessage) return 'New Conversation';

      // Extract key words and create title (simple implementation)
      const words = firstUserMessage.content.split(' ').slice(0, 5);
      const title = words.join(' ').substring(0, 50) + (words.length > 5 ? '...' : '');

      return title || 'New Conversation';

    } catch (error) {
      logger.error('Error generating conversation title:', error);
      return 'New Conversation';
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(conversationId, title) {
    const client = await pool.connect();
    
    try {
      const query = `
        UPDATE conversations 
        SET title = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, title
      `;
      
      const result = await client.query(query, [title, conversationId]);
      
      if (result.rows.length === 0) {
        throw new Error('Conversation not found');
      }

      logger.info(`Conversation title updated: ${conversationId}`);
      return result.rows[0];

    } catch (error) {
      logger.error('Error updating conversation title:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate text to fit within token limit
   */
  truncateText(text, maxTokens) {
    const approximateMaxChars = maxTokens * 4;
    if (text.length <= approximateMaxChars) return text;
    
    // Truncate at word boundary
    const truncated = text.substring(0, approximateMaxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  }

  /**
   * Clean up old conversations (optional maintenance)
   */
  async cleanupOldConversations(daysOld = 90) {
    const client = await pool.connect();
    
    try {
      const query = `
        DELETE FROM conversations 
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        AND is_archived = true
      `;
      
      const result = await client.query(query);
      
      logger.info(`Cleaned up ${result.rowCount} old conversations`);
      return result.rowCount;

    } catch (error) {
      logger.error('Error cleaning up old conversations:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Singleton instance
export const contextService = new ContextService();