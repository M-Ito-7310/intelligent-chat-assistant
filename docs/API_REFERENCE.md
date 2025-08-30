# API Reference - Intelligent Chat Assistant

## Overview

The Intelligent Chat Assistant API provides endpoints for AI-powered conversations with RAG (Retrieval-Augmented Generation) capabilities. This RESTful API supports document management, chat interactions, user authentication, and system administration.

**Base URL**: `https://your-api-domain.com/api`
**Version**: v1.0.0
**Authentication**: JWT Bearer Token

## Authentication

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "user",
      "created_at": "2024-08-30T10:00:00Z"
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token"
    }
  }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

### Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

### Demo Accounts
For testing purposes, the following demo accounts are available:

- **Regular User**: `demo@example.com` / `demo123456`
- **Admin User**: `admin@example.com` / `admin123456`

## Chat API

### Send Message
```http
POST /chat/message
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "message": "What is machine learning?",
  "conversationId": "uuid",
  "enableRAG": true,
  "temperature": 0.7,
  "maxTokens": 2000
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "uuid",
      "content": "What is machine learning?",
      "role": "user",
      "created_at": "2024-08-30T10:00:00Z"
    },
    "assistantMessage": {
      "id": "uuid",
      "content": "Machine learning is a subset of artificial intelligence...",
      "role": "assistant",
      "created_at": "2024-08-30T10:00:05Z",
      "sources": [
        {
          "id": "doc-uuid",
          "filename": "ml-guide.pdf",
          "page": 1,
          "content": "Machine learning definition..."
        }
      ]
    },
    "conversationTitle": "Machine Learning Discussion",
    "usage": {
      "prompt_tokens": 150,
      "completion_tokens": 300,
      "total_tokens": 450
    }
  }
}
```

### Get Conversations
```http
GET /chat/conversations
Authorization: Bearer {access_token}
```

### Get Conversation History
```http
GET /chat/conversations/{conversationId}
Authorization: Bearer {access_token}
```

### Delete Conversation
```http
DELETE /chat/conversations/{conversationId}
Authorization: Bearer {access_token}
```

## Document Management

### Upload Document
```http
POST /documents/upload
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

document: [file] (PDF, TXT, DOCX, MD up to 10MB)
```

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "uuid",
      "filename": "document.pdf",
      "original_filename": "My Document.pdf",
      "file_size": 1024000,
      "file_type": "application/pdf",
      "is_processed": false,
      "processing_status": "pending",
      "created_at": "2024-08-30T10:00:00Z",
      "chunk_count": 0
    }
  }
}
```

### Get Documents
```http
GET /documents
Authorization: Bearer {access_token}
```

**Query Parameters**:
- `status` (optional): `all`, `processed`, `pending`, `failed`
- `limit` (optional): Number of documents to return (default: 50)
- `offset` (optional): Number of documents to skip (default: 0)

### Get Document Details
```http
GET /documents/{documentId}
Authorization: Bearer {access_token}
```

### Delete Document
```http
DELETE /documents/{documentId}
Authorization: Bearer {access_token}
```

### Search Documents
```http
POST /documents/search
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "query": "machine learning algorithms",
  "limit": 10,
  "threshold": 0.7
}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "chunk-uuid",
        "document_id": "doc-uuid",
        "filename": "ml-guide.pdf",
        "content": "Machine learning algorithms can be categorized...",
        "similarity": 0.89,
        "page": 2
      }
    ],
    "total": 15
  }
}
```

## Admin API

### Get System Metrics
```http
GET /admin/metrics
Authorization: Bearer {admin_access_token}
```

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "system": {
      "uptime": 864000,
      "memory_usage": {
        "used": 512000000,
        "total": 1024000000
      },
      "cpu_usage": 25.5,
      "disk_usage": {
        "used": 10000000000,
        "total": 50000000000
      }
    },
    "database": {
      "status": "healthy",
      "connections": 10,
      "query_time_avg": 50
    },
    "cache": {
      "enabled": true,
      "memory_usage": "256MB",
      "hit_rate": 0.85,
      "total_keys": 1000
    },
    "api": {
      "requests_today": 5000,
      "avg_response_time": 120,
      "error_rate": 0.02
    }
  }
}
```

### Get User Analytics
```http
GET /admin/users
Authorization: Bearer {admin_access_token}
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation error details"
  }
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `413` - Payload Too Large
- `429` - Too Many Requests
- `500` - Internal Server Error

### Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `AUTH_TOKEN_EXPIRED` - Access token has expired
- `AUTH_TOKEN_INVALID` - Invalid or malformed token
- `USER_NOT_FOUND` - User does not exist
- `DOCUMENT_NOT_FOUND` - Document does not exist
- `PROCESSING_FAILED` - Document processing failed
- `QUOTA_EXCEEDED` - User quota limit reached
- `RATE_LIMITED` - Too many requests

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Standard Users**: 100 requests per 15 minutes
- **Admin Users**: 1000 requests per 15 minutes
- **File Uploads**: 10 uploads per hour

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Window reset time (Unix timestamp)

## Webhooks

### Document Processing Events
Configure webhooks to receive notifications about document processing status:

```http
POST /webhooks/documents
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "url": "https://your-app.com/webhook",
  "events": ["document.processed", "document.failed"]
}
```

Event payload example:
```json
{
  "event": "document.processed",
  "data": {
    "document_id": "uuid",
    "filename": "document.pdf",
    "chunk_count": 25,
    "processed_at": "2024-08-30T10:05:00Z"
  },
  "timestamp": "2024-08-30T10:05:00Z"
}
```

## SDKs and Libraries

Official SDKs are available for:
- JavaScript/TypeScript (npm: `@intelligent-chat/js-sdk`)
- Python (pip: `intelligent-chat-python`)
- PHP (composer: `intelligent-chat/php-sdk`)

## Support

- **Documentation**: https://docs.intelligent-chat-assistant.com
- **GitHub Issues**: https://github.com/M-Ito-7310/intelligent-chat-assistant/issues
- **Email**: support@intelligent-chat-assistant.com