import OpenAI from 'openai';
import logger from '../../utils/logger.js';

/**
 * OpenAI Service
 * Handles communication with OpenAI API for chat completions and embeddings
 */
export class OpenAIService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Default models
    this.models = {
      chat: 'gpt-4o-mini',
      embedding: 'text-embedding-3-small'
    };

    // Default settings
    this.defaultSettings = {
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0
    };

    logger.info('OpenAI service initialized');
  }

  /**
   * Generate chat completion
   */
  async generateResponse(messages, options = {}) {
    try {
      const model = options.model || this.models.chat;
      const settings = { ...this.defaultSettings, ...options.settings };

      logger.info(`Generating response with model: ${model}`);

      const response = await this.client.chat.completions.create({
        model: model,
        messages: this.formatMessages(messages),
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        top_p: settings.topP,
        frequency_penalty: settings.frequencyPenalty,
        presence_penalty: settings.presencePenalty,
        stream: false
      });

      const choice = response.choices[0];
      
      return {
        content: choice.message.content,
        usage: response.usage,
        model: response.model,
        finishReason: choice.finish_reason,
        created: response.created
      };

    } catch (error) {
      logger.error('OpenAI generateResponse error:', error);
      this.handleError(error);
    }
  }

  /**
   * Stream chat completion
   */
  async *streamResponse(messages, options = {}) {
    try {
      const model = options.model || this.models.chat;
      const settings = { ...this.defaultSettings, ...options.settings };

      logger.info(`Starting stream response with model: ${model}`);

      const stream = await this.client.chat.completions.create({
        model: model,
        messages: this.formatMessages(messages),
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        top_p: settings.topP,
        frequency_penalty: settings.frequencyPenalty,
        presence_penalty: settings.presencePenalty,
        stream: true
      });

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        
        if (choice?.delta?.content) {
          yield {
            content: choice.delta.content,
            finishReason: choice.finish_reason,
            model: chunk.model
          };
        }
      }

    } catch (error) {
      logger.error('OpenAI streamResponse error:', error);
      this.handleError(error);
    }
  }

  /**
   * Generate embeddings
   */
  async generateEmbedding(text, options = {}) {
    try {
      const model = options.model || this.models.embedding;

      logger.info(`Generating embedding with model: ${model}`);

      const response = await this.client.embeddings.create({
        model: model,
        input: text,
        encoding_format: 'float'
      });

      return {
        data: response.data[0].embedding,
        usage: response.usage,
        model: response.model
      };

    } catch (error) {
      logger.error('OpenAI generateEmbedding error:', error);
      this.handleError(error);
    }
  }

  /**
   * Generate multiple embeddings
   */
  async generateEmbeddings(texts, options = {}) {
    try {
      const model = options.model || this.models.embedding;
      
      logger.info(`Generating ${texts.length} embeddings with model: ${model}`);

      const response = await this.client.embeddings.create({
        model: model,
        input: texts,
        encoding_format: 'float'
      });

      return {
        data: response.data.map(item => item.embedding),
        usage: response.usage,
        model: response.model
      };

    } catch (error) {
      logger.error('OpenAI generateEmbeddings error:', error);
      this.handleError(error);
    }
  }

  /**
   * Format messages for OpenAI API
   */
  formatMessages(messages) {
    return messages.map(message => ({
      role: message.role,
      content: message.content
    }));
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return {
      chat: [
        'gpt-4o',
        'gpt-4o-mini', 
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo'
      ],
      embedding: [
        'text-embedding-3-large',
        'text-embedding-3-small',
        'text-embedding-ada-002'
      ]
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.client.models.list();
      return { status: 'healthy', models: response.data.length };
    } catch (error) {
      logger.error('OpenAI health check failed:', error);
      throw error;
    }
  }

  /**
   * Handle API errors
   */
  handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          throw new Error('Invalid OpenAI API key');
        case 429:
          throw new Error('OpenAI API rate limit exceeded');
        case 503:
          throw new Error('OpenAI service temporarily unavailable');
        default:
          throw new Error(`OpenAI API error: ${data?.error?.message || 'Unknown error'}`);
      }
    } else if (error.code) {
      switch (error.code) {
        case 'insufficient_quota':
          throw new Error('OpenAI API quota exceeded');
        case 'model_not_found':
          throw new Error('Requested OpenAI model not found');
        default:
          throw new Error(`OpenAI error: ${error.message}`);
      }
    } else {
      throw new Error(`OpenAI service error: ${error.message}`);
    }
  }

  /**
   * Calculate token count (approximation)
   */
  estimateTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Validate message format
   */
  validateMessages(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }

    for (const message of messages) {
      if (!message.role || !message.content) {
        throw new Error('Each message must have role and content');
      }
      
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new Error('Invalid message role');
      }
    }

    return true;
  }
}