import { HfInference } from '@huggingface/inference';
import logger from '../../utils/logger.js';

/**
 * Hugging Face Service
 * Handles communication with Hugging Face Inference API
 */
export class HuggingFaceService {
  constructor() {
    if (!process.env.HUGGINGFACE_TOKEN) {
      throw new Error('HUGGINGFACE_TOKEN environment variable is required');
    }

    this.client = new HfInference(process.env.HUGGINGFACE_TOKEN);

    // Default models
    this.models = {
      chat: 'microsoft/DialoGPT-large',
      textGeneration: 'microsoft/DialoGPT-large',
      embedding: 'sentence-transformers/all-MiniLM-L6-v2',
      summarization: 'facebook/bart-large-cnn',
      classification: 'cardiffnlp/twitter-roberta-base-sentiment-latest'
    };

    // Default settings
    this.defaultSettings = {
      temperature: 0.7,
      maxTokens: 150,
      topP: 0.9,
      repetitionPenalty: 1.1
    };

    logger.info('Hugging Face service initialized');
  }

  /**
   * Generate chat response using text generation
   */
  async generateResponse(messages, options = {}) {
    try {
      const model = options.model || this.models.textGeneration;
      const settings = { ...this.defaultSettings, ...options.settings };

      // Convert conversation to single prompt
      const prompt = this.formatMessagesForHF(messages);

      logger.info(`Generating response with Hugging Face model: ${model}`);

      const response = await this.client.textGeneration({
        model: model,
        inputs: prompt,
        parameters: {
          temperature: settings.temperature,
          max_new_tokens: settings.maxTokens,
          top_p: settings.topP,
          repetition_penalty: settings.repetitionPenalty,
          return_full_text: false
        }
      });

      return {
        content: response.generated_text.trim(),
        usage: {
          prompt_tokens: this.estimateTokens(prompt),
          completion_tokens: this.estimateTokens(response.generated_text),
          total_tokens: this.estimateTokens(prompt + response.generated_text)
        },
        model: model,
        finishReason: 'stop'
      };

    } catch (error) {
      logger.error('Hugging Face generateResponse error:', error);
      this.handleError(error);
    }
  }

  /**
   * Generate embeddings using sentence transformers
   */
  async generateEmbedding(text, options = {}) {
    try {
      const model = options.model || this.models.embedding;

      logger.info(`Generating embedding with Hugging Face model: ${model}`);

      const response = await this.client.featureExtraction({
        model: model,
        inputs: text
      });

      // Handle different response formats
      let embedding;
      if (Array.isArray(response) && Array.isArray(response[0])) {
        // If response is 2D array, take the first row
        embedding = response[0];
      } else if (Array.isArray(response)) {
        // If response is 1D array, use as is
        embedding = response;
      } else {
        throw new Error('Unexpected embedding response format');
      }

      return {
        data: embedding,
        usage: {
          total_tokens: this.estimateTokens(text)
        },
        model: model
      };

    } catch (error) {
      logger.error('Hugging Face generateEmbedding error:', error);
      this.handleError(error);
    }
  }

  /**
   * Summarize text
   */
  async summarizeText(text, options = {}) {
    try {
      const model = options.model || this.models.summarization;
      const maxLength = options.maxLength || 150;
      const minLength = options.minLength || 50;

      logger.info(`Summarizing text with model: ${model}`);

      const response = await this.client.summarization({
        model: model,
        inputs: text,
        parameters: {
          max_length: maxLength,
          min_length: minLength
        }
      });

      return {
        summary: response.summary_text,
        model: model,
        usage: {
          input_tokens: this.estimateTokens(text),
          output_tokens: this.estimateTokens(response.summary_text)
        }
      };

    } catch (error) {
      logger.error('Hugging Face summarizeText error:', error);
      this.handleError(error);
    }
  }

  /**
   * Classify text sentiment
   */
  async classifyText(text, options = {}) {
    try {
      const model = options.model || this.models.classification;

      logger.info(`Classifying text with model: ${model}`);

      const response = await this.client.textClassification({
        model: model,
        inputs: text
      });

      return {
        classifications: response,
        model: model,
        usage: {
          tokens: this.estimateTokens(text)
        }
      };

    } catch (error) {
      logger.error('Hugging Face classifyText error:', error);
      this.handleError(error);
    }
  }

  /**
   * Format messages for Hugging Face text generation
   */
  formatMessagesForHF(messages) {
    // Convert conversation to a single prompt
    let prompt = '';
    
    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `System: ${message.content}\n`;
      } else if (message.role === 'user') {
        prompt += `Human: ${message.content}\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n`;
      }
    }
    
    prompt += 'Assistant: ';
    return prompt;
  }

  /**
   * Get available models by category
   */
  getAvailableModels() {
    return {
      chat: [
        'microsoft/DialoGPT-large',
        'microsoft/DialoGPT-medium',
        'facebook/blenderbot-400M-distill'
      ],
      textGeneration: [
        'gpt2',
        'gpt2-medium',
        'microsoft/DialoGPT-large',
        'EleutherAI/gpt-neo-2.7B'
      ],
      embedding: [
        'sentence-transformers/all-MiniLM-L6-v2',
        'sentence-transformers/all-mpnet-base-v2',
        'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
      ],
      summarization: [
        'facebook/bart-large-cnn',
        't5-small',
        't5-base'
      ],
      classification: [
        'cardiffnlp/twitter-roberta-base-sentiment-latest',
        'distilbert-base-uncased-finetuned-sst-2-english'
      ]
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Simple test with a small model
      await this.client.textGeneration({
        model: 'gpt2',
        inputs: 'Hello',
        parameters: {
          max_new_tokens: 5
        }
      });
      
      return { status: 'healthy' };
    } catch (error) {
      logger.error('Hugging Face health check failed:', error);
      throw error;
    }
  }

  /**
   * Handle API errors
   */
  handleError(error) {
    if (error.response) {
      const { status } = error.response;
      
      switch (status) {
        case 401:
          throw new Error('Invalid Hugging Face token');
        case 429:
          throw new Error('Hugging Face API rate limit exceeded');
        case 503:
          throw new Error('Hugging Face model is loading, please retry');
        default:
          throw new Error(`Hugging Face API error: ${error.message}`);
      }
    } else if (error.message?.includes('Model')) {
      throw new Error('Hugging Face model not found or unavailable');
    } else {
      throw new Error(`Hugging Face service error: ${error.message}`);
    }
  }

  /**
   * Estimate token count (approximation)
   */
  estimateTokens(text) {
    // Rough approximation for Hugging Face models
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if model supports streaming (Hugging Face Inference API doesn't support streaming)
   */
  supportsStreaming() {
    return false;
  }

  /**
   * Get model information
   */
  async getModelInfo(modelId) {
    try {
      // Note: This would require additional API calls to get model info
      // For now, return basic info
      return {
        id: modelId,
        type: this.getModelType(modelId),
        provider: 'huggingface'
      };
    } catch (error) {
      logger.error('Failed to get model info:', error);
      return null;
    }
  }

  /**
   * Determine model type based on model ID
   */
  getModelType(modelId) {
    if (modelId.includes('DialoGPT') || modelId.includes('blenderbot')) {
      return 'chat';
    } else if (modelId.includes('sentence-transformers')) {
      return 'embedding';
    } else if (modelId.includes('bart') && modelId.includes('cnn')) {
      return 'summarization';
    } else if (modelId.includes('sentiment') || modelId.includes('classification')) {
      return 'classification';
    } else {
      return 'text-generation';
    }
  }
}