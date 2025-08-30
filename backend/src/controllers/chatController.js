import { validationResult } from 'express-validator';
import { aiCoordinator } from '../services/ai/aiCoordinator.js';
import { contextService } from '../services/contextService.js';
import { ragService } from '../services/ragService.js';
import { cacheService } from '../services/cacheService.js';
import { exportService } from '../services/exportService.js';
import { quotaService } from '../services/quotaService.js';
import queryOptimizer from '../services/queryOptimizer.js';
import { asyncHandler } from '../middleware/errorMiddleware.js';
import { io } from '../index.js';
import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Send message and get AI response
 */
export const sendMessage = asyncHandler(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { message, conversationId: providedConversationId, provider, model, settings, enableRAG = true } = req.body;
  const userId = req.user.id;

  let conversationId = providedConversationId;

  // Demo mode handling
  if (userId === 'demo-user-id') {
    if (!conversationId) {
      conversationId = `demo-conv-${Date.now()}`;
    }

    const demoResponses = [
      "This is a demo response from the AI chatbot. The system is working correctly in demo mode!",
      "Hello! I'm responding in demo mode. This shows how the chat interface works with real AI responses.",
      "Demo mode is active. In a real deployment, this would connect to OpenAI or other AI services.",
      "The chat system is fully functional. This demo shows the message flow and user interface.",
      "Thanks for trying the demo! The AI chatbot can handle conversations, maintain context, and more."
    ];

    const randomResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const userMessageData = {
      id: `demo-user-msg-${Date.now()}`,
      content: message,
      created_at: new Date().toISOString()
    };

    const assistantMessageData = {
      id: `demo-assistant-msg-${Date.now()}`,
      content: randomResponse,
      created_at: new Date().toISOString()
    };

    logger.info(`Demo message processed for conversation: ${conversationId}`);

    return res.json({
      success: true,
      data: {
        conversationId,
        userMessage: userMessageData,
        assistantMessage: {
          ...assistantMessageData,
          metadata: {
            provider: 'demo',
            model: 'demo-model',
            usage: { total_tokens: 0 }
          }
        }
      }
    });
  }

  try {
    // Create new conversation if not provided
    if (!conversationId) {
      const newConversation = await contextService.createConversation(userId);
      conversationId = newConversation.id;
      
      logger.info(`Created new conversation: ${conversationId} for user: ${userId}`);
    } else {
      // Validate conversation ownership using optimized query
      const ownership = await queryOptimizer.checkOwnership(conversationId, userId);
      
      if (!ownership.exists) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }
      
      if (!ownership.isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Not your conversation'
        });
      }
    }

    // Build AI context
    const aiContext = await contextService.buildAIContext(conversationId, message, {
      model: model || 'gpt-4o-mini'
    });

    // Save user message
    const userMessageData = await contextService.saveMessage(
      conversationId,
      'user',
      message,
      { provider, model }
    );

    // Generate AI response with RAG if enabled
    logger.info(`Generating AI response for conversation: ${conversationId} (RAG: ${enableRAG})`);
    
    const aiResponse = enableRAG 
      ? await ragService.generateRAGResponse(
          aiContext.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          userId,
          {
            provider,
            model,
            settings,
            enableRAG
          }
        )
      : await aiCoordinator.generateResponse(
          aiContext.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            provider,
            model,
            settings
          }
        );

    // Save AI response
    const assistantMessageData = await contextService.saveMessage(
      conversationId,
      'assistant',
      aiResponse.content,
      {
        provider: aiResponse.provider,
        model: aiResponse.model,
        usage: aiResponse.usage,
        finishReason: aiResponse.finishReason,
        ragContext: aiResponse.ragContext
      }
    );

    // Generate conversation title if this is the first exchange
    if (aiContext.messages.length <= 2) {
      const title = await contextService.generateConversationTitle(conversationId);
      await contextService.updateConversationTitle(conversationId, title);
    }

    // Emit to socket if connected
    io.to(conversationId).emit('new_message', {
      id: assistantMessageData.id,
      role: 'assistant',
      content: aiResponse.content,
      created_at: assistantMessageData.created_at,
      metadata: {
        provider: aiResponse.provider,
        model: aiResponse.model,
        usage: aiResponse.usage
      }
    });

    // Return response
    res.json({
      success: true,
      data: {
        conversationId,
        userMessage: {
          id: userMessageData.id,
          content: message,
          created_at: userMessageData.created_at
        },
        assistantMessage: {
          id: assistantMessageData.id,
          content: aiResponse.content,
          created_at: assistantMessageData.created_at,
          metadata: {
            provider: aiResponse.provider,
            model: aiResponse.model,
            usage: aiResponse.usage,
            ragContext: aiResponse.ragContext
          }
        }
      }
    });

  } catch (error) {
    logger.error('Error in sendMessage:', error);
    
    // Try to save error message for debugging
    if (conversationId) {
      try {
        await contextService.saveMessage(
          conversationId,
          'system',
          `Error occurred: ${error.message}`,
          { error: true, originalMessage: message }
        );
      } catch (saveError) {
        logger.error('Failed to save error message:', saveError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Stream message response
 */
export const streamMessage = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { message, conversationId: providedConversationId, provider, model, settings, enableRAG = true } = req.body;
  const userId = req.user.id;

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  let conversationId = providedConversationId;

  try {
    // Create new conversation if not provided
    if (!conversationId) {
      const newConversation = await contextService.createConversation(userId);
      conversationId = newConversation.id;
      
      res.write(`data: ${JSON.stringify({
        type: 'conversation_created',
        conversationId
      })}\n\n`);
    }

    // Build AI context
    const aiContext = await contextService.buildAIContext(conversationId, message, {
      model: model || 'gpt-4o-mini'
    });

    // Save user message
    const userMessageData = await contextService.saveMessage(
      conversationId,
      'user',
      message,
      { provider, model, streaming: true }
    );

    res.write(`data: ${JSON.stringify({
      type: 'user_message_saved',
      messageId: userMessageData.id
    })}\n\n`);

    // Start streaming AI response with RAG
    let fullResponse = '';
    let assistantMessageId = null;
    let ragContext = null;

    res.write(`data: ${JSON.stringify({
      type: 'ai_response_start'
    })}\n\n`);

    const streamIterator = enableRAG
      ? ragService.streamRAGResponse(
          aiContext.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          userId,
          { provider, model, settings, enableRAG }
        )
      : (async function*() {
          for await (const chunk of aiCoordinator.streamResponse(
            aiContext.messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            { provider, model, settings }
          )) {
            yield { ...chunk, type: 'response_chunk' };
          }
        })();

    for await (const chunk of streamIterator) {
      if (chunk.type === 'rag_context') {
        ragContext = chunk.ragContext;
        res.write(`data: ${JSON.stringify({
          type: 'rag_context',
          ragContext: chunk.ragContext
        })}\n\n`);
      } else if (chunk.type === 'response_chunk' && chunk.content) {
        fullResponse += chunk.content;
        
        res.write(`data: ${JSON.stringify({
          type: 'ai_response_chunk',
          content: chunk.content,
          provider: chunk.provider
        })}\n\n`);
      }
    }

    // Save complete AI response
    const assistantMessageData = await contextService.saveMessage(
      conversationId,
      'assistant',
      fullResponse,
      {
        provider,
        model,
        streaming: true,
        ragContext
      }
    );

    assistantMessageId = assistantMessageData.id;

    res.write(`data: ${JSON.stringify({
      type: 'ai_response_complete',
      messageId: assistantMessageId,
      fullContent: fullResponse
    })}\n\n`);

    // Generate title if needed
    if (aiContext.messages.length <= 2) {
      const title = await contextService.generateConversationTitle(conversationId);
      await contextService.updateConversationTitle(conversationId, title);
      
      res.write(`data: ${JSON.stringify({
        type: 'conversation_title_updated',
        title
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      type: 'stream_complete'
    })}\n\n`);

    res.end();

  } catch (error) {
    logger.error('Error in streamMessage:', error);
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error.message
    })}\n\n`);
    
    res.end();
  }
});

/**
 * Get user conversations
 */
export const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit = 20, offset = 0, archived = false } = req.query;

  // Check cache first
  const cacheOptions = { limit, offset, archived };
  const cached = await cacheService.getCachedUserConversations(userId, cacheOptions);
  if (cached) {
    return res.json(cached);
  }

  // Demo mode fallback for when database is not available
  if (userId === 'demo-user-id') {
    const demoConversations = [
      {
        id: 'demo-conv-1',
        title: 'Welcome to AI Chatbot Demo',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 2,
        last_message_at: new Date().toISOString()
      }
    ];

    return res.json({
      success: true,
      data: {
        conversations: demoConversations,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: demoConversations.length
        }
      }
    });
  }

  try {
    // Use optimized query service
    const result = await queryOptimizer.getUserConversations(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      archived
    });
    
    const responseData = {
      success: true,
      data: {
        conversations: result.conversations,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: result.total
        }
      }
    };
    
    // Cache the result
    await cacheService.cacheUserConversations(userId, responseData, cacheOptions);
    
    res.json(responseData);

  } catch (error) {
    logger.error('Error getting conversations:', error);
    
    // Return empty conversations list for database connection errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.json({
        success: true,
        data: {
          conversations: [],
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total: 0
          }
        }
      });
    }
    
    throw error;
  }
});

/**
 * Get specific conversation with messages
 */
export const getConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { messageLimit = 50 } = req.query;

  // Demo mode fallback
  if (userId === 'demo-user-id' && id === 'demo-conv-1') {
    const demoConversation = {
      id: 'demo-conv-1',
      title: 'Welcome to AI Chatbot Demo',
      user_id: 'demo-user-id',
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const demoMessages = [
      {
        id: 'demo-msg-1',
        role: 'assistant',
        content: 'Welcome to the AI Chatbot demo! This is a demonstration of the chat interface with demo AI responses. Try typing a message to see how the AI responds in demo mode.',
        metadata: {
          provider: 'demo',
          model: 'demo-model'
        },
        created_at: new Date().toISOString()
      }
    ];

    return res.json({
      success: true,
      data: {
        conversation: demoConversation,
        messages: demoMessages,
        totalMessages: demoMessages.length,
        totalTokens: 0
      }
    });
  }

  try {
    const context = await contextService.getConversationContext(id, {
      messageLimit: parseInt(messageLimit),
      includeSystem: false
    });

    // Verify ownership
    if (context.conversation.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Not your conversation'
      });
    }

    res.json({
      success: true,
      data: {
        conversation: context.conversation,
        messages: context.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata,
          created_at: msg.created_at
        })),
        totalMessages: context.totalMessages,
        totalTokens: context.totalTokens
      }
    });

  } catch (error) {
    logger.error('Error getting conversation:', error);
    
    if (error.message === 'Conversation not found') {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    throw error;
  }
});

/**
 * Create new conversation
 */
export const createConversation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { title = 'New Conversation' } = req.body;
  const userId = req.user.id;

  // Demo mode fallback
  if (userId === 'demo-user-id') {
    const demoConversation = {
      id: `demo-conv-${Date.now()}`,
      title,
      user_id: userId,
      is_archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    logger.info('Demo conversation created:', demoConversation.id);
    
    return res.status(201).json({
      success: true,
      data: { conversation: demoConversation }
    });
  }

  try {
    const conversation = await contextService.createConversation(userId, title);
    
    // Invalidate user conversations cache
    await cacheService.invalidateUserConversations(userId);
    
    res.status(201).json({
      success: true,
      data: { conversation }
    });

  } catch (error) {
    logger.error('Error creating conversation:', error);
    
    // Fallback for database connection issues
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const demoConversation = {
        id: `demo-conv-${Date.now()}`,
        title,
        user_id: userId,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      logger.info('Database unavailable, created demo conversation:', demoConversation.id);
      
      return res.status(201).json({
        success: true,
        data: { conversation: demoConversation }
      });
    }
    
    throw error;
  }
});

/**
 * Update conversation title
 */
export const updateConversationTitle = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { id } = req.params;
  const { title } = req.body;
  const userId = req.user.id;

  // Verify ownership using optimized query
  const ownership = await queryOptimizer.checkOwnership(id, userId);
  
  if (!ownership.exists) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found'
    });
  }
  
  if (!ownership.isOwner) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Not your conversation'
    });
  }

  try {
    const updatedConversation = await contextService.updateConversationTitle(id, title);
    
    res.json({
      success: true,
      data: { conversation: updatedConversation }
    });

  } catch (error) {
    logger.error('Error updating conversation title:', error);
    throw error;
  }
});

/**
 * Delete conversation
 */
export const deleteConversation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verify ownership using optimized query
    const ownership = await queryOptimizer.checkOwnership(id, userId);
    
    if (!ownership.exists) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    if (!ownership.isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Not your conversation'
      });
    }

    // Delete conversation (messages will be deleted by CASCADE)
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM conversations WHERE id = $1', [id]);
    } finally {
      client.release();
    }
    
    logger.info(`Conversation deleted: ${id} by user: ${userId}`);
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting conversation:', error);
    throw error;
  }
});

/**
 * Get RAG statistics for user
 */
export const getRAGStatistics = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const statistics = await ragService.getRAGStatistics(userId);
    const availability = await ragService.checkRAGAvailability(userId);

    res.json({
      success: true,
      data: {
        statistics,
        availability
      }
    });

  } catch (error) {
    logger.error('Error getting RAG statistics:', error);
    throw error;
  }
});

/**
 * Export conversation to various formats
 */
export const exportConversation = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }

  const { id } = req.params;
  const { format = 'json' } = req.query;
  const userId = req.user.id;

  // Demo mode fallback
  if (userId === 'demo-user-id') {
    const demoExport = {
      conversation: {
        id: id,
        title: 'Demo Conversation',
        created_at: new Date().toISOString(),
        message_count: 2
      },
      messages: [
        {
          role: 'user',
          content: 'Hello, this is a demo conversation',
          created_at: new Date().toISOString()
        },
        {
          role: 'assistant',
          content: 'This is a demo export. In real mode, this would contain actual conversation data.',
          created_at: new Date().toISOString()
        }
      ],
      export_info: {
        exported_at: new Date().toISOString(),
        format: format,
        version: '1.0'
      }
    };

    return res.json({
      success: true,
      data: {
        format: format,
        content: format === 'json' ? JSON.stringify(demoExport, null, 2) : demoExport,
        filename: `demo-conversation-${id}.${format}`
      }
    });
  }

  try {
    let result;

    switch (format.toLowerCase()) {
      case 'pdf':
        result = await exportService.exportConversationToPDF(userId, id);
        break;
      case 'json':
        result = await exportService.exportConversationToJSON(userId, id);
        break;
      case 'csv':
        result = await exportService.exportConversationToCSV(userId, id);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported format. Use pdf, json, or csv'
        });
    }

    res.json({
      success: true,
      data: {
        filename: result.filename,
        format: result.format,
        filesize: result.filesize,
        downloadUrl: `/api/chat/exports/download/${result.filename}`
      }
    });

  } catch (error) {
    logger.error('Export conversation error:', error);
    
    if (error.message === 'Access denied. Not your conversation') {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    
    throw error;
  }
});

/**
 * Get user's export history
 */
export const getExportHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Demo mode
  if (userId === 'demo-user-id') {
    return res.json({
      success: true,
      data: {
        exports: [
          {
            filename: 'demo-conversation-export.json',
            created_at: new Date().toISOString(),
            size: 1024,
            format: 'json'
          }
        ]
      }
    });
  }

  try {
    const exports = await exportService.getUserExports(userId);

    res.json({
      success: true,
      data: { exports }
    });

  } catch (error) {
    logger.error('Get export history error:', error);
    throw error;
  }
});

/**
 * Get user's usage statistics and quota information
 */
export const getUsageStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const stats = await quotaService.getUsageStats(userId);
    const cacheStats = await cacheService.getStats();

    res.json({
      success: true,
      data: {
        usage: stats,
        cache: cacheStats,
        last_updated: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Get usage stats error:', error);
    throw error;
  }
});

/**
 * Get system performance metrics (admin only)
 */
export const getSystemMetrics = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // TODO: Add admin role check
  // For now, allow demo user to see system metrics
  if (userId !== 'demo-user-id') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }

  try {
    const metrics = {
      system: {
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      },
      cache: await cacheService.getStats(),
      active_users: 1, // Demo value
      total_conversations: 1,
      total_messages: 5,
      ai_providers: {
        openai: { status: 'demo', requests_today: 0 },
        huggingface: { status: 'demo', requests_today: 0 }
      }
    };

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    logger.error('Get system metrics error:', error);
    throw error;
  }
});