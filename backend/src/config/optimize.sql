-- Database Query Optimization Script
-- This script adds indexes and optimized views for better performance

-- ====================================
-- 1. Add Missing Indexes
-- ====================================

-- Index for conversation queries (user_id + is_archived + updated_at)
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived_updated 
ON conversations(user_id, is_archived, updated_at DESC);

-- Index for messages queries (conversation_id + created_at)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);

-- Index for messages role filtering
CREATE INDEX IF NOT EXISTS idx_messages_conversation_role 
ON messages(conversation_id, role);

-- Index for document chunks user lookup
CREATE INDEX IF NOT EXISTS idx_document_chunks_user 
ON document_chunks(user_id);

-- Index for documents user lookup with status
CREATE INDEX IF NOT EXISTS idx_documents_user_status 
ON documents(user_id, processing_status);

-- Index for user sessions token lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token 
ON user_sessions(refresh_token) 
WHERE is_valid = true;

-- ====================================
-- 2. Create Materialized Views for Complex Queries
-- ====================================

-- Drop existing views if they exist
DROP MATERIALIZED VIEW IF EXISTS conversation_stats CASCADE;

-- Materialized view for conversation statistics
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
GROUP BY c.id, c.user_id, c.title, c.is_archived, c.created_at, c.updated_at;

-- Create indexes on materialized view
CREATE INDEX idx_conv_stats_user ON conversation_stats(user_id);
CREATE INDEX idx_conv_stats_user_archived ON conversation_stats(user_id, is_archived);
CREATE INDEX idx_conv_stats_updated ON conversation_stats(updated_at DESC);

-- ====================================
-- 3. Optimized Functions
-- ====================================

-- Function to get user conversations with stats (replaces complex JOIN query)
CREATE OR REPLACE FUNCTION get_user_conversations_optimized(
    p_user_id UUID,
    p_is_archived BOOLEAN DEFAULT false,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    title VARCHAR(255),
    is_archived BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    message_count BIGINT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    total_tokens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.conversation_id,
        cs.title,
        cs.is_archived,
        cs.created_at,
        cs.updated_at,
        cs.message_count,
        cs.last_message_at,
        cs.total_tokens
    FROM conversation_stats cs
    WHERE cs.user_id = p_user_id 
        AND cs.is_archived = p_is_archived
    ORDER BY cs.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to check conversation ownership (cached)
CREATE OR REPLACE FUNCTION check_conversation_ownership(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    SELECT user_id INTO v_owner_id
    FROM conversations
    WHERE id = p_conversation_id;
    
    RETURN v_owner_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get conversation with messages efficiently
CREATE OR REPLACE FUNCTION get_conversation_with_messages(
    p_conversation_id UUID,
    p_user_id UUID,
    p_message_limit INT DEFAULT 50
)
RETURNS TABLE(
    conversation_json JSONB,
    messages_json JSONB
) AS $$
BEGIN
    -- Check ownership first
    IF NOT check_conversation_ownership(p_conversation_id, p_user_id) THEN
        RAISE EXCEPTION 'Access denied. Not your conversation';
    END IF;
    
    RETURN QUERY
    WITH conv AS (
        SELECT 
            jsonb_build_object(
                'id', c.id,
                'title', c.title,
                'user_id', c.user_id,
                'is_archived', c.is_archived,
                'created_at', c.created_at,
                'updated_at', c.updated_at
            ) as conversation_data
        FROM conversations c
        WHERE c.id = p_conversation_id
    ),
    msgs AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'id', m.id,
                    'role', m.role,
                    'content', m.content,
                    'metadata', m.metadata,
                    'created_at', m.created_at
                ) ORDER BY m.created_at DESC
            ) as messages_data
        FROM (
            SELECT * FROM messages
            WHERE conversation_id = p_conversation_id
            ORDER BY created_at DESC
            LIMIT p_message_limit
        ) m
    )
    SELECT 
        conv.conversation_data,
        COALESCE(msgs.messages_data, '[]'::jsonb)
    FROM conv
    CROSS JOIN msgs;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- 4. Batch Operations
-- ====================================

-- Function for batch conversation ownership check
CREATE OR REPLACE FUNCTION check_conversations_ownership(
    p_conversation_ids UUID[],
    p_user_id UUID
)
RETURNS TABLE(
    conversation_id UUID,
    is_owner BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.user_id = p_user_id
    FROM conversations c
    WHERE c.id = ANY(p_conversation_ids);
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- 5. Refresh Materialized View Function
-- ====================================

-- Function to refresh conversation stats (call periodically)
CREATE OR REPLACE FUNCTION refresh_conversation_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_stats;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- 6. Query Plan Analysis
-- ====================================

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance(p_query TEXT)
RETURNS TABLE(
    plan_line TEXT
) AS $$
BEGIN
    RETURN QUERY
    EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || p_query;
END;
$$ LANGUAGE plpgsql;

-- ====================================
-- 7. Automatic Statistics Update
-- ====================================

-- Update table statistics for query planner
ANALYZE conversations;
ANALYZE messages;
ANALYZE documents;
ANALYZE document_chunks;
ANALYZE users;

-- ====================================
-- 8. Connection Pool Optimization Settings
-- ====================================

-- These should be set in postgresql.conf or via ALTER SYSTEM
-- Included here for documentation

-- ALTER SYSTEM SET shared_buffers = '256MB';
-- ALTER SYSTEM SET effective_cache_size = '1GB';
-- ALTER SYSTEM SET work_mem = '4MB';
-- ALTER SYSTEM SET maintenance_work_mem = '64MB';
-- ALTER SYSTEM SET random_page_cost = 1.1;  -- For SSD
-- ALTER SYSTEM SET effective_io_concurrency = 200;  -- For SSD
-- ALTER SYSTEM SET max_connections = 100;
-- ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';

-- ====================================
-- 9. Create Refresh Schedule (if pg_cron is available)
-- ====================================

-- If pg_cron extension is available, schedule automatic refresh
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('refresh-conversation-stats', '*/5 * * * *', 'SELECT refresh_conversation_stats();');

COMMENT ON MATERIALIZED VIEW conversation_stats IS 'Optimized view for conversation statistics, refresh every 5 minutes';
COMMENT ON FUNCTION get_user_conversations_optimized IS 'Optimized function to get user conversations with statistics';
COMMENT ON FUNCTION check_conversation_ownership IS 'Cached function to check conversation ownership';
COMMENT ON INDEX idx_conversations_user_archived_updated IS 'Composite index for efficient user conversation queries';