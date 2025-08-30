# Production Testing Guide

## Pre-Production Checklist

Before deploying to production, complete this comprehensive testing checklist to ensure system reliability and performance.

### 1. API Key Configuration

#### OpenAI API Testing
```bash
# Test OpenAI API connection
curl -X POST "https://api.openai.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello, test message"}],
    "max_tokens": 10
  }'
```

Expected response: Valid JSON with `choices` array.

#### Hugging Face API Testing  
```bash
# Test Hugging Face API connection
curl -X POST "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium" \
  -H "Authorization: Bearer YOUR_HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "Hello, test message"}'
```

### 2. Database Configuration Testing

#### Connection Test
```sql
-- Test database connection and pgvector extension
SELECT version();
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test table structure
\dt
\d users
\d conversations
\d messages
\d documents
\d document_chunks
```

#### Performance Test
```sql
-- Test vector search performance
EXPLAIN ANALYZE 
SELECT * FROM document_chunks 
WHERE embedding <-> '[0.1,0.2,0.3]'::vector 
ORDER BY embedding <-> '[0.1,0.2,0.3]'::vector 
LIMIT 5;
```

### 3. Functional Testing

#### Authentication Flow
1. **Register Test**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test User",
       "email": "test@example.com", 
       "password": "testpassword123"
     }'
   ```

2. **Login Test**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "testpassword123"
     }'
   ```

3. **Token Refresh Test**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/refresh \
     -H "Content-Type: application/json" \
     -d '{"refreshToken": "YOUR_REFRESH_TOKEN"}'
   ```

#### Document Management
1. **Upload Test**:
   ```bash
   curl -X POST http://localhost:3000/api/documents/upload \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -F "document=@test-document.pdf"
   ```

2. **Processing Verification**: Wait for processing to complete, then check:
   ```bash
   curl -X GET http://localhost:3000/api/documents \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```

3. **Search Test**:
   ```bash
   curl -X POST http://localhost:3000/api/documents/search \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query": "test search query", "limit": 5}'
   ```

#### Chat Functionality
1. **RAG-Enabled Chat**:
   ```bash
   curl -X POST http://localhost:3000/api/chat/message \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "message": "What information is in the uploaded document?",
       "enableRAG": true,
       "temperature": 0.7
     }'
   ```

2. **Regular Chat**:
   ```bash
   curl -X POST http://localhost:3000/api/chat/message \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Hello, how are you?",
       "enableRAG": false
     }'
   ```

### 4. Performance Testing

#### Load Testing with Artillery
Create `load-test.yml`:
```yaml
config:
  target: http://localhost:3000
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120  
      arrivalRate: 20
  payload:
    path: "./test-tokens.csv"
    fields:
      - "token"

scenarios:
  - name: "Chat API Load Test"
    weight: 70
    flow:
      - post:
          url: "/api/chat/message"
          headers:
            Authorization: "Bearer {{ token }}"
            Content-Type: "application/json"
          json:
            message: "Test message {{ $randomInt(1, 100) }}"
            enableRAG: false

  - name: "Document Search Load Test"
    weight: 30
    flow:
      - post:
          url: "/api/documents/search"
          headers:
            Authorization: "Bearer {{ token }}"
            Content-Type: "application/json"
          json:
            query: "search query {{ $randomInt(1, 50) }}"
            limit: 5
```

Run load test:
```bash
artillery run load-test.yml
```

#### Memory and CPU Monitoring
```bash
# Monitor during load test
top -p $(pgrep -f "node.*index.js")
free -m
iostat 1
```

### 5. Security Testing

#### SQL Injection Testing
Test with malicious inputs:
```bash
# Test chat message endpoint
curl -X POST http://localhost:3000/api/chat/message \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "test'; DROP TABLE users; --"
  }'
```

#### XSS Testing
```bash
# Test with script injection
curl -X POST http://localhost:3000/api/chat/message \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "<script>alert(\"xss\")</script>"
  }'
```

#### File Upload Security
```bash
# Test malicious file upload
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "document=@malicious.exe"
```

### 6. Integration Testing

#### Frontend-Backend Integration
1. Start both services
2. Navigate to application in browser
3. Complete user journey:
   - Register/Login
   - Upload document
   - Wait for processing
   - Start chat conversation
   - Ask question about document
   - Verify RAG response with sources
   - Test language switching
   - Test dark/light theme

#### Database Integration
```bash
# Test database queries under load
pgbench -c 10 -T 60 -U username -d intelligent_chat
```

### 7. Internationalization Testing

#### Language Switching
1. Test Japanese interface:
   ```javascript
   // Browser console
   localStorage.setItem('locale', 'ja');
   location.reload();
   ```

2. Test English interface:
   ```javascript
   localStorage.setItem('locale', 'en'); 
   location.reload();
   ```

3. Verify all UI elements are translated

### 8. Error Handling Testing

#### API Error Responses
```bash
# Test invalid token
curl -X GET http://localhost:3000/api/documents \
  -H "Authorization: Bearer invalid_token"

# Test rate limiting (send 100+ requests rapidly)
for i in {1..150}; do
  curl -X GET http://localhost:3000/api/health &
done
```

#### Network Failure Simulation
1. Disconnect network during file upload
2. Interrupt database connection
3. Stop Redis server during chat
4. Verify graceful error handling

### 9. Browser Compatibility Testing

Test on multiple browsers and devices:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Android Chrome)

### 10. Accessibility Testing

```bash
# Install accessibility testing tools
npm install -g @axe-core/cli

# Run accessibility audit
axe --include "#main-content" http://localhost:5173
```

## Automated Testing Scripts

### Environment Validation Script
```bash
#!/bin/bash
# validate-environment.sh

echo "🔍 Validating Production Environment..."

# Check required environment variables
required_vars=("DATABASE_URL" "REDIS_URL" "JWT_SECRET" "OPENAI_API_KEY")
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required environment variable: $var"
    exit 1
  fi
done

# Test database connection
echo "📊 Testing database connection..."
if psql $DATABASE_URL -c "SELECT 1;" > /dev/null 2>&1; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  exit 1
fi

# Test Redis connection  
echo "🔄 Testing Redis connection..."
if redis-cli -u $REDIS_URL ping > /dev/null 2>&1; then
  echo "✅ Redis connection successful"
else
  echo "❌ Redis connection failed"
  exit 1
fi

# Test API endpoints
echo "🌐 Testing API endpoints..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "$response" = "200" ]; then
  echo "✅ API health check passed"
else
  echo "❌ API health check failed (HTTP $response)"
  exit 1
fi

echo "🎉 All environment validations passed!"
```

### Pre-Deployment Test Suite
```bash
#!/bin/bash
# pre-deploy-tests.sh

set -e

echo "🚀 Running Pre-Deployment Test Suite..."

# Run backend tests
echo "🧪 Running backend tests..."
cd backend && npm test

# Run frontend tests  
echo "🧪 Running frontend tests..."
cd ../frontend && npm run test:run

# Build frontend
echo "🏗️ Building frontend..."
npm run build

# Security audit
echo "🔒 Running security audit..."
cd ../backend && npm audit --audit-level moderate
cd ../frontend && npm audit --audit-level moderate

# Environment validation
echo "🔍 Validating environment..."
./scripts/validate-environment.sh

echo "✅ All pre-deployment tests passed!"
echo "🚢 Ready for production deployment!"
```

## Production Monitoring Checklist

### Post-Deployment Verification
- [ ] Health endpoints responding (200 OK)
- [ ] Database queries executing successfully
- [ ] Redis cache functioning
- [ ] AI API responses working
- [ ] File uploads processing
- [ ] User registration/login working
- [ ] Chat functionality operational
- [ ] Document search returning results
- [ ] Admin dashboard accessible
- [ ] SSL certificate valid
- [ ] CORS policies configured correctly
- [ ] Rate limiting active
- [ ] Error logging functional

### Performance Metrics to Monitor
- **Response Time**: < 2 seconds average
- **Throughput**: > 100 requests/second
- **Error Rate**: < 1%
- **CPU Usage**: < 70% average
- **Memory Usage**: < 80% of available
- **Database Connections**: < 80% of pool
- **Cache Hit Rate**: > 80%
- **Disk Usage**: < 85%

### Alerting Setup
Configure alerts for:
- High error rates (> 5%)
- Slow response times (> 5 seconds)  
- High resource usage (> 90%)
- Service downtime
- Failed file processing
- Authentication failures spike

## Rollback Procedures

### Emergency Rollback Steps
1. **Immediate**: Revert load balancer to previous version
2. **Database**: Restore from latest backup if schema changed
3. **Files**: Restore uploaded files if corrupted
4. **Cache**: Flush Redis if data inconsistent
5. **Monitoring**: Update alerts for reverted version
6. **Communication**: Notify stakeholders of rollback

### Rollback Testing
Regularly test rollback procedures in staging environment to ensure they work when needed.

---

**Important**: Never test with real user data or production API keys in development/staging environments. Always use test accounts and separate API keys for testing.