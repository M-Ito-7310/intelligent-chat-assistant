import logger from '../../utils/logger.js';
import { OpenAIService } from './openaiService.js';
import { HuggingFaceService } from './huggingfaceService.js';
import { cacheService } from '../cacheService.js';

// Demo AI Service for development without API keys
class DemoAIService {
  async generateResponse(messages, options = {}) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
    
    const lastMessage = messages[messages.length - 1];
    const demoResponses = [
      "Hello! This is a demo response. Please configure your OpenAI API key or Hugging Face token to use real AI services.",
      "I'm running in demo mode since no valid AI API keys were found. You can still test the interface!",
      `I see you said: "${lastMessage?.content}". This is a simulated AI response for demonstration purposes.`,
      "To enable real AI responses, please add your OPENAI_API_KEY to the .env file in the backend directory.",
      "Demo mode is active. The chat interface is working correctly - just add your API keys for actual AI responses!"
    ];
    
    const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
    
    return {
      content: randomResponse,
      usage: { total_tokens: 0 },
      model: 'demo-model',
      finishReason: 'stop'
    };
  }

  async generateEmbedding(text, options = {}) {
    // Return a dummy embedding vector for demo purposes
    const dummyEmbedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
    
    return {
      data: dummyEmbedding,
      usage: { total_tokens: 0 },
      model: 'demo-embedding'
    };
  }

  async *streamResponse(messages, options = {}) {
    const response = await this.generateResponse(messages, options);
    const words = response.content.split(' ');
    
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      yield {
        content: words.slice(0, i + 1).join(' '),
        finished: i === words.length - 1
      };
    }
  }

  async healthCheck() {
    return { status: 'healthy', mode: 'demo' };
  }

  getAvailableModels() {
    return ['demo-model'];
  }
}

/**
 * AI Coordinator Service
 * Manages multiple AI providers and handles fallback mechanisms
 */
export class AICoordinator {
  constructor() {
    this.providers = new Map();
    this.defaultProvider = 'openai';
    this.initializeProviders();
  }

  /**
   * Initialize AI service providers
   */
  initializeProviders() {
    try {
      let providersInitialized = 0;

      // Initialize OpenAI service
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'demo_key_please_replace_with_actual_key') {
        try {
          this.providers.set('openai', new OpenAIService());
          logger.info('OpenAI service initialized');
          providersInitialized++;
        } catch (error) {
          logger.warn('OpenAI service initialization failed:', error.message);
        }
      }

      // Initialize Hugging Face service
      if (process.env.HUGGINGFACE_TOKEN && process.env.HUGGINGFACE_TOKEN !== 'your_huggingface_token_here') {
        try {
          this.providers.set('huggingface', new HuggingFaceService());
          logger.info('Hugging Face service initialized');
          providersInitialized++;
        } catch (error) {
          logger.warn('Hugging Face service initialization failed:', error.message);
        }
      }

      // Initialize demo service if no real providers available
      if (providersInitialized === 0) {
        logger.warn('No valid AI API keys found - initializing demo mode');
        this.providers.set('demo', new DemoAIService());
        this.defaultProvider = 'demo';
        logger.info('Demo AI service initialized');
      } else {
        // Set default provider based on available services
        if (this.providers.has('openai')) {
          this.defaultProvider = 'openai';
        } else if (this.providers.has('huggingface')) {
          this.defaultProvider = 'huggingface';
        }
      }

      logger.info(`AI Coordinator initialized with ${this.providers.size} providers (default: ${this.defaultProvider})`);
    } catch (error) {
      logger.error('Failed to initialize AI providers:', error);
      throw error;
    }
  }

  /**
   * Generate chat completion
   */
  async generateResponse(messages, options = {}) {
    const provider = options.provider || this.defaultProvider;
    const maxRetries = options.maxRetries || 2;
    
    // Check cache first (skip for demo mode)
    if (provider !== 'demo' && options.enableCaching !== false) {
      const cached = await cacheService.getCachedResponse(messages, { provider, ...options });
      if (cached) {
        return {
          ...cached,
          provider,
          fromCache: true
        };
      }
    }
    
    logger.info(`Generating response using ${provider} provider`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const service = this.providers.get(provider);
        if (!service) {
          throw new Error(`Provider ${provider} not available`);
        }

        const response = await service.generateResponse(messages, options);
        
        const result = {
          content: response.content,
          usage: response.usage,
          provider: provider,
          model: response.model,
          finishReason: response.finishReason
        };
        
        // Cache the response (skip for demo mode)
        if (provider !== 'demo' && options.enableCaching !== false) {
          await cacheService.cacheResponse(messages, result, { 
            provider, 
            cacheTTL: options.cacheTTL 
          });
        }
        
        logger.info(`Response generated successfully using ${provider}`);
        return result;

      } catch (error) {
        logger.error(`Attempt ${attempt + 1} failed for provider ${provider}:`, error);
        
        if (attempt < maxRetries - 1) {
          // Try fallback provider
          const fallbackProvider = this.getFallbackProvider(provider);
          if (fallbackProvider) {
            logger.info(`Falling back to ${fallbackProvider}`);
            provider = fallbackProvider;
            continue;
          }
        }
        
        throw error;
      }
    }
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text, options = {}) {
    const provider = options.provider || this.defaultProvider;
    
    try {
      const service = this.providers.get(provider);
      if (!service) {
        throw new Error(`Provider ${provider} not available`);
      }

      const embedding = await service.generateEmbedding(text, options);
      
      logger.info(`Embedding generated successfully using ${provider}`);
      return {
        embedding: embedding.data,
        usage: embedding.usage,
        provider: provider,
        model: embedding.model
      };

    } catch (error) {
      logger.error(`Failed to generate embedding using ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Stream chat completion
   */
  async *streamResponse(messages, options = {}) {
    const provider = options.provider || this.defaultProvider;
    
    try {
      const service = this.providers.get(provider);
      if (!service) {
        throw new Error(`Provider ${provider} not available`);
      }

      if (!service.streamResponse) {
        throw new Error(`Provider ${provider} does not support streaming`);
      }

      logger.info(`Starting stream response using ${provider}`);
      
      for await (const chunk of service.streamResponse(messages, options)) {
        yield {
          ...chunk,
          provider: provider
        };
      }

    } catch (error) {
      logger.error(`Stream failed for provider ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider capabilities
   */
  getProviderCapabilities(provider) {
    const service = this.providers.get(provider);
    if (!service) {
      return null;
    }

    return {
      chat: typeof service.generateResponse === 'function',
      streaming: typeof service.streamResponse === 'function',
      embeddings: typeof service.generateEmbedding === 'function',
      models: service.getAvailableModels ? service.getAvailableModels() : []
    };
  }

  /**
   * Get fallback provider
   */
  getFallbackProvider(currentProvider) {
    const providers = this.getAvailableProviders();
    return providers.find(p => p !== currentProvider);
  }

  /**
   * Health check for all providers
   */
  async healthCheck() {
    const results = {};
    
    for (const [name, service] of this.providers) {
      try {
        if (service.healthCheck) {
          await service.healthCheck();
          results[name] = { status: 'healthy' };
        } else {
          results[name] = { status: 'unknown' };
        }
      } catch (error) {
        results[name] = { 
          status: 'unhealthy', 
          error: error.message 
        };
      }
    }

    return results;
  }
}

// Singleton instance
export const aiCoordinator = new AICoordinator();