import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Query Optimizer Service
 * Provides optimized database queries using indexes and materialized views
 */
class QueryOptimizerService {
  constructor() {
    this.useOptimizedQueries = process.env.USE_OPTIMIZED_QUERIES !== 'false';
    this.refreshInterval = null;
  }

  /**
   * Initialize query optimizer
   */
  async initialize() {
    try {
      // Run optimization script if not already applied
      await this.applyOptimizations();
      
      // Start periodic refresh of materialized views
      this.startPeriodicRefresh();
      
      logger.info('Query optimizer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize query optimizer:', error);
      // Don't throw - allow app to run without optimizations
    }
  }

  /**
   * Apply database optimizations
   */
  async applyOptimizations() {
    const client = await pool.connect();
    try {
      // Check if optimizations are already applied
      const checkQuery = `
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'idx_conversations_user_archived_updated'
        ) as optimized
      `;
      
      const result = await client.query(checkQuery);
      
      if (!result.rows[0].optimized) {
        logger.info('Applying database optimizations...');
        
        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_conversations_user_archived_updated 
          ON conversations(user_id, is_archived, updated_at DESC)
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
          ON messages(conversation_id, created_at DESC)
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_role 
          ON messages(conversation_id, role)
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_document_chunks_user 
          ON document_chunks(user_id)
        `);
        
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_documents_user_status 
          ON documents(user_id, processing_status)
        `);
        
        // Create materialized view
        await this.createMaterializedView(client);
        
        // Analyze tables for query planner
        await client.query('ANALYZE conversations');
        await client.query('ANALYZE messages');
        await client.query('ANALYZE documents');
        await client.query('ANALYZE document_chunks');
        
        logger.info('Database optimizations applied successfully');
      } else {
        logger.info('Database optimizations already applied');
      }
    } catch (error) {
      logger.error('Error applying optimizations:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Create materialized view for conversation stats
   */
  async createMaterializedView(client) {
    try {
      // Drop existing view if exists
      await client.query('DROP MATERIALIZED VIEW IF EXISTS conversation_stats CASCADE');
      
      // Create materialized view
      await client.query(`
        CREATE MATERIALIZED VIEW conversation_stats AS
        SELECT 
            c.id as conversation_id,
            c.user_id,
            c.title,
            c.is_archived,
            c.created_at,
            c.updated_at,
            COUNT(m.id) as message_count,
            MAX(m.created_at) as last_message_at,
            SUM(CASE WHEN m.role = 'user' THEN 1 ELSE 0 END) as user_message_count,
            SUM(CASE WHEN m.role = 'assistant' THEN 1 ELSE 0 END) as assistant_message_count,
            SUM(COALESCE((m.metadata->>'total_tokens')::int, 0)) as total_tokens
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        GROUP BY c.id, c.user_id, c.title, c.is_archived, c.created_at, c.updated_at
      `);
      
      // Create indexes on materialized view
      await client.query('CREATE INDEX idx_conv_stats_user ON conversation_stats(user_id)');
      await client.query('CREATE INDEX idx_conv_stats_user_archived ON conversation_stats(user_id, is_archived)');
      await client.query('CREATE INDEX idx_conv_stats_updated ON conversation_stats(updated_at DESC)');
      
      logger.info('Materialized view created successfully');
    } catch (error) {
      logger.error('Error creating materialized view:', error);
    }
  }

  /**
   * Get optimized user conversations query
   */
  async getUserConversations(userId, options = {}) {
    const { limit = 20, offset = 0, archived = false } = options;
    
    const client = await pool.connect();
    try {
      if (this.useOptimizedQueries) {
        // Use materialized view for better performance
        const query = `
          SELECT 
            conversation_id as id,
            title,
            is_archived,
            created_at,
            updated_at,
            message_count,
            last_message_at,
            total_tokens
          FROM conversation_stats
          WHERE user_id = $1 AND is_archived = $2
          ORDER BY updated_at DESC
          LIMIT $3 OFFSET $4
        `;
        
        const result = await client.query(query, [userId, archived, limit, offset]);
        
        // Get total count
        const countQuery = `
          SELECT COUNT(*) as total
          FROM conversation_stats
          WHERE user_id = $1 AND is_archived = $2
        `;
        
        const countResult = await client.query(countQuery, [userId, archived]);
        
        return {
          conversations: result.rows,
          total: parseInt(countResult.rows[0].total)
        };
      } else {
        // Fallback to regular query
        const query = `
          SELECT 
            c.id,
            c.title,
            c.is_archived,
            c.created_at,
            c.updated_at,
            COUNT(m.id) as message_count,
            MAX(m.created_at) as last_message_at
          FROM conversations c
          LEFT JOIN messages m ON c.id = m.conversation_id
          WHERE c.user_id = $1 AND c.is_archived = $2
          GROUP BY c.id
          ORDER BY c.updated_at DESC
          LIMIT $3 OFFSET $4
        `;
        
        const result = await client.query(query, [userId, archived, limit, offset]);
        
        return {
          conversations: result.rows,
          total: result.rows.length
        };
      }
    } finally {
      client.release();
    }
  }

  /**
   * Check conversation ownership efficiently
   */
  async checkOwnership(conversationId, userId) {
    const client = await pool.connect();
    try {
      const query = `
        SELECT user_id = $2 as is_owner
        FROM conversations
        WHERE id = $1
      `;
      
      const result = await client.query(query, [conversationId, userId]);
      
      if (result.rows.length === 0) {
        return { exists: false, isOwner: false };
      }
      
      return {
        exists: true,
        isOwner: result.rows[0].is_owner
      };
    } finally {
      client.release();
    }
  }

  /**
   * Batch check conversation ownership
   */
  async batchCheckOwnership(conversationIds, userId) {
    if (!conversationIds || conversationIds.length === 0) {
      return {};
    }
    
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id,
          user_id = $2 as is_owner
        FROM conversations
        WHERE id = ANY($1::uuid[])
      `;
      
      const result = await client.query(query, [conversationIds, userId]);
      
      return result.rows.reduce((acc, row) => {
        acc[row.id] = row.is_owner;
        return acc;
      }, {});
    } finally {
      client.release();
    }
  }

  /**
   * Get conversation with messages efficiently
   */
  async getConversationWithMessages(conversationId, userId, messageLimit = 50) {
    const client = await pool.connect();
    try {
      // First check ownership
      const ownership = await this.checkOwnership(conversationId, userId);
      
      if (!ownership.exists) {
        throw new Error('Conversation not found');
      }
      
      if (!ownership.isOwner) {
        throw new Error('Access denied. Not your conversation');
      }
      
      // Get conversation and messages in parallel
      const [convResult, msgResult, statsResult] = await Promise.all([
        client.query(
          'SELECT * FROM conversations WHERE id = $1',
          [conversationId]
        ),
        client.query(
          `SELECT * FROM messages 
           WHERE conversation_id = $1 
           ORDER BY created_at DESC 
           LIMIT $2`,
          [conversationId, messageLimit]
        ),
        client.query(
          `SELECT 
             COUNT(*) as total_messages,
             SUM(COALESCE((metadata->>'total_tokens')::int, 0)) as total_tokens
           FROM messages 
           WHERE conversation_id = $1`,
          [conversationId]
        )
      ]);
      
      return {
        conversation: convResult.rows[0],
        messages: msgResult.rows.reverse(), // Reverse to get chronological order
        totalMessages: parseInt(statsResult.rows[0].total_messages),
        totalTokens: parseInt(statsResult.rows[0].total_tokens) || 0
      };
    } finally {
      client.release();
    }
  }

  /**
   * Refresh materialized views
   */
  async refreshMaterializedViews() {
    const client = await pool.connect();
    try {
      // Check if materialized view exists
      const checkQuery = `
        SELECT EXISTS (
          SELECT 1 FROM pg_matviews 
          WHERE matviewname = 'conversation_stats'
        ) as exists
      `;
      
      const result = await client.query(checkQuery);
      
      if (result.rows[0].exists) {
        await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_stats');
        logger.debug('Materialized views refreshed');
      }
    } catch (error) {
      logger.error('Error refreshing materialized views:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Start periodic refresh of materialized views
   */
  startPeriodicRefresh() {
    // Refresh every 5 minutes
    const refreshInterval = 5 * 60 * 1000;
    
    this.refreshInterval = setInterval(() => {
      this.refreshMaterializedViews().catch(error => {
        logger.error('Periodic refresh failed:', error);
      });
    }, refreshInterval);
    
    logger.info('Started periodic refresh of materialized views');
  }

  /**
   * Stop periodic refresh
   */
  stopPeriodicRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      logger.info('Stopped periodic refresh of materialized views');
    }
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(query, params = []) {
    const client = await pool.connect();
    try {
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, params);
      
      return result.rows[0]['QUERY PLAN'];
    } catch (error) {
      logger.error('Error analyzing query:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get query statistics
   */
  async getQueryStats() {
    const client = await pool.connect();
    try {
      // Check if pg_stat_statements is available
      const checkQuery = `
        SELECT EXISTS (
          SELECT 1 FROM pg_extension 
          WHERE extname = 'pg_stat_statements'
        ) as available
      `;
      
      const checkResult = await client.query(checkQuery);
      
      if (!checkResult.rows[0].available) {
        return { available: false };
      }
      
      // Get top slow queries
      const statsQuery = `
        SELECT 
          query,
          calls,
          total_exec_time,
          mean_exec_time,
          stddev_exec_time,
          rows
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `;
      
      const result = await client.query(statsQuery);
      
      return {
        available: true,
        topSlowQueries: result.rows
      };
    } catch (error) {
      logger.error('Error getting query stats:', error);
      return { available: false, error: error.message };
    } finally {
      client.release();
    }
  }
}

// Create singleton instance
const queryOptimizer = new QueryOptimizerService();

export default queryOptimizer;