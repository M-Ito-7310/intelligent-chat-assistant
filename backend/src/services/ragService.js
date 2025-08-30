import { documentService } from './documentService.js';
import { aiCoordinator } from './ai/aiCoordinator.js';
import logger from '../utils/logger.js';

/**
 * RAG (Retrieval-Augmented Generation) Service
 * Handles document-based context retrieval for chat responses
 */
export class RAGService {
  constructor() {
    this.defaultOptions = {
      maxRelevantChunks: 3,
      similarityThreshold: 0.7,
      maxContextLength: 3000,
      enableRAG: true
    };

    logger.info('RAG service initialized');
  }

  /**
   * Enhanced chat response with RAG
   */
  async generateRAGResponse(messages, userId, options = {}) {
    const ragOptions = { ...this.defaultOptions, ...options };

    try {
      // Get the latest user message for document search
      const userMessages = messages.filter(m => m.role === 'user');
      const latestUserMessage = userMessages[userMessages.length - 1];

      if (!latestUserMessage || !ragOptions.enableRAG) {
        // Fallback to regular chat without RAG
        return await aiCoordinator.generateResponse(messages, options);
      }

      // Search for relevant document chunks
      const relevantContext = await this.retrieveRelevantContext(
        latestUserMessage.content,
        userId,
        ragOptions
      );

      // Enhance messages with document context if found
      const enhancedMessages = await this.enhanceMessagesWithContext(
        messages,
        relevantContext,
        ragOptions
      );

      // Generate AI response with enhanced context
      const response = await aiCoordinator.generateResponse(enhancedMessages, {
        ...options,
        settings: {
          ...options.settings,
          temperature: 0.7 // Slightly more focused for factual responses
        }
      });

      // Add RAG metadata to response
      return {
        ...response,
        ragContext: {
          documentsUsed: relevantContext.length,
          sources: relevantContext.map(chunk => ({
            documentId: chunk.documentId,
            filename: chunk.filename,
            chunkIndex: chunk.chunkIndex,
            similarity: chunk.similarity
          })),
          enhanced: relevantContext.length > 0
        }
      };

    } catch (error) {
      logger.error('RAG response generation error:', error);
      
      // Fallback to regular chat on RAG failure
      logger.info('Falling back to regular chat response');
      const response = await aiCoordinator.generateResponse(messages, options);
      
      return {
        ...response,
        ragContext: {
          documentsUsed: 0,
          sources: [],
          enhanced: false,
          error: 'RAG context retrieval failed'
        }
      };
    }
  }

  /**
   * Stream RAG-enhanced response
   */
  async *streamRAGResponse(messages, userId, options = {}) {
    const ragOptions = { ...this.defaultOptions, ...options };

    try {
      // Get the latest user message for document search
      const userMessages = messages.filter(m => m.role === 'user');
      const latestUserMessage = userMessages[userMessages.length - 1];

      let relevantContext = [];
      let enhancedMessages = messages;

      if (latestUserMessage && ragOptions.enableRAG) {
        // Search for relevant document chunks
        relevantContext = await this.retrieveRelevantContext(
          latestUserMessage.content,
          userId,
          ragOptions
        );

        // Enhance messages with document context
        enhancedMessages = await this.enhanceMessagesWithContext(
          messages,
          relevantContext,
          ragOptions
        );
      }

      // Yield RAG context information first
      yield {
        type: 'rag_context',
        content: null,
        ragContext: {
          documentsUsed: relevantContext.length,
          sources: relevantContext.map(chunk => ({
            documentId: chunk.documentId,
            filename: chunk.filename,
            chunkIndex: chunk.chunkIndex,
            similarity: chunk.similarity
          })),
          enhanced: relevantContext.length > 0
        }
      };

      // Stream the enhanced response
      for await (const chunk of aiCoordinator.streamResponse(enhancedMessages, {
        ...options,
        settings: {
          ...options.settings,
          temperature: 0.7
        }
      })) {
        yield {
          ...chunk,
          type: 'response_chunk'
        };
      }

    } catch (error) {
      logger.error('RAG streaming error:', error);
      
      // Fallback to regular streaming
      yield {
        type: 'rag_context',
        content: null,
        ragContext: {
          documentsUsed: 0,
          sources: [],
          enhanced: false,
          error: 'RAG context retrieval failed'
        }
      };

      for await (const chunk of aiCoordinator.streamResponse(messages, options)) {
        yield {
          ...chunk,
          type: 'response_chunk'
        };
      }
    }
  }

  /**
   * Retrieve relevant context from documents
   */
  async retrieveRelevantContext(query, userId, options) {
    try {
      // Generate embedding for the query
      const embeddingResult = await aiCoordinator.generateEmbedding(query);
      
      // Search for similar document chunks
      const similarChunks = await documentService.searchSimilarChunks(
        embeddingResult.embedding,
        userId,
        {
          limit: options.maxRelevantChunks * 2, // Get more to filter better
          threshold: options.similarityThreshold
        }
      );

      if (similarChunks.length === 0) {
        logger.info(`No relevant document chunks found for query: "${query.substring(0, 50)}..."`);
        return [];
      }

      // Filter and rank chunks
      const relevantChunks = this.filterAndRankChunks(
        similarChunks,
        query,
        options
      );

      logger.info(`Found ${relevantChunks.length} relevant document chunks for RAG`);
      
      return relevantChunks;

    } catch (error) {
      logger.error('Context retrieval error:', error);
      return [];
    }
  }

  /**
   * Filter and rank document chunks
   */
  filterAndRankChunks(chunks, query, options) {
    // Sort by similarity
    const sortedChunks = chunks.sort((a, b) => b.similarity - a.similarity);
    
    // Take top chunks within context length limit
    let totalLength = 0;
    const selectedChunks = [];
    
    for (const chunk of sortedChunks) {
      const chunkLength = chunk.content.length;
      
      if (totalLength + chunkLength <= options.maxContextLength && 
          selectedChunks.length < options.maxRelevantChunks) {
        selectedChunks.push(chunk);
        totalLength += chunkLength;
      }
    }

    return selectedChunks;
  }

  /**
   * Enhance messages with document context
   */
  async enhanceMessagesWithContext(messages, relevantChunks, options) {
    if (relevantChunks.length === 0) {
      return messages;
    }

    // Create context from relevant chunks
    const contextText = this.buildContextText(relevantChunks);
    
    // Find or create system message
    const systemMessageIndex = messages.findIndex(m => m.role === 'system');
    
    const contextInstruction = `
Use the following document excerpts to help answer the user's question. If the documents contain relevant information, incorporate it into your response and mention the source. If the documents don't contain relevant information, respond based on your general knowledge but mention that you don't have specific document information about this topic.

Document Context:
${contextText}

Important: Always be honest about what information comes from the provided documents versus your general knowledge.`;

    if (systemMessageIndex >= 0) {
      // Enhance existing system message
      const enhancedMessages = [...messages];
      enhancedMessages[systemMessageIndex] = {
        ...enhancedMessages[systemMessageIndex],
        content: enhancedMessages[systemMessageIndex].content + '\n\n' + contextInstruction
      };
      return enhancedMessages;
    } else {
      // Add new system message at the beginning
      return [
        {
          role: 'system',
          content: contextInstruction
        },
        ...messages
      ];
    }
  }

  /**
   * Build context text from relevant chunks
   */
  buildContextText(chunks) {
    return chunks.map((chunk, index) => {
      return `Document ${index + 1} (${chunk.filename}):
${chunk.content}

---`;
    }).join('\n\n');
  }

  /**
   * Check if user has documents for RAG
   */
  async checkRAGAvailability(userId) {
    try {
      const status = await documentService.getProcessingStatus(userId);
      return {
        available: status.processed > 0,
        documentCount: status.processed,
        pendingCount: status.pending
      };
    } catch (error) {
      logger.error('Error checking RAG availability:', error);
      return {
        available: false,
        documentCount: 0,
        pendingCount: 0
      };
    }
  }

  /**
   * Get RAG statistics for user
   */
  async getRAGStatistics(userId) {
    try {
      const documents = await documentService.getUserDocuments(userId, { processedOnly: true });
      const status = await documentService.getProcessingStatus(userId);
      
      const totalChunks = documents.reduce((sum, doc) => sum + doc.chunk_count, 0);
      
      return {
        documents: status.processed,
        pendingDocuments: status.pending,
        totalChunks,
        averageChunksPerDocument: status.processed > 0 ? Math.round(totalChunks / status.processed) : 0,
        ragEnabled: status.processed > 0
      };
      
    } catch (error) {
      logger.error('Error getting RAG statistics:', error);
      return {
        documents: 0,
        pendingDocuments: 0,
        totalChunks: 0,
        averageChunksPerDocument: 0,
        ragEnabled: false
      };
    }
  }
}

// Singleton instance
export const ragService = new RAGService();