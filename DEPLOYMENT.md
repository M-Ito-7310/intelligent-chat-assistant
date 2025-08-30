# AI Chatbot Deployment Guide

This document provides comprehensive instructions for deploying the AI Chatbot application to staging and production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Deployment Process](#deployment-process)
4. [Platform-Specific Instructions](#platform-specific-instructions)
5. [Database Setup](#database-setup)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Required Tools
- **Node.js** (v18+ recommended)
- **npm** or **yarn**
- **Git**
- **Docker** (optional, for local testing)
- **PostgreSQL** client tools (for database operations)

### Accounts & Services
- **Vercel** account (for frontend deployment)
- **Railway**, **Heroku**, or **AWS** account (for backend deployment)
- **Neon** or **Supabase** account (for PostgreSQL database)
- **Redis Cloud** or **AWS ElastiCache** (for caching)
- **OpenAI** API key
- **Domain** with DNS management access

### Access Requirements
- Repository push access
- Deployment platform admin access
- Database admin credentials
- DNS management access

## Environment Setup

### 1. Environment Variables

Copy the appropriate environment template:

```bash
# For staging
cp .env.staging .env

# For production
cp .env.production .env
```

### 2. Required Environment Variables

#### Core Configuration
```env
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# JWT Secrets (generate with: openssl rand -base64 64)
JWT_SECRET=your-secure-jwt-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret

# AI Services
OPENAI_API_KEY=sk-your-openai-api-key

# Redis
REDIS_HOST=your-redis-host
REDIS_PASSWORD=your-redis-password
```

#### Security Configuration
```env
# CORS
CORS_ORIGIN=https://your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,txt,doc,docx
```

## Deployment Process

### Automated Deployment

Use the deployment script for automated deployment:

```bash
# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production

# Deploy with options
./scripts/deploy.sh production --skip-tests --no-backup

# Dry run (see what would be deployed)
./scripts/deploy.sh staging --dry-run
```

### Manual Deployment

#### 1. Pre-deployment Checks
```bash
# Check Git status
git status

# Run tests
cd backend && npm test
cd ../frontend && npm run test:unit

# Build frontend
cd frontend && npm run build
```

#### 2. Deploy Backend
```bash
cd backend

# Install production dependencies
npm ci --only=production

# Run linting
npm run lint

# Deploy (platform-specific)
# See platform-specific instructions below
```

#### 3. Deploy Frontend
```bash
cd frontend

# Install dependencies
npm ci

# Build for production
npm run build

# Deploy to Vercel
vercel --prod
```

## Platform-Specific Instructions

### Vercel (Frontend)

#### Setup
1. Connect your GitHub repository to Vercel
2. Configure build settings:
   - **Framework Preset**: Vue.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

#### Environment Variables
Add these in Vercel dashboard:
```env
VITE_API_BASE_URL=https://your-backend-url.com
VITE_APP_TITLE=AI Chatbot
VITE_ENABLE_ANALYTICS=true
```

#### Custom Domain
1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS settings as instructed

### Railway (Backend)

#### Setup
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Initialize project: `railway init`

#### Deployment
```bash
# Deploy to Railway
railway up

# Set environment variables
railway variables set DATABASE_URL=your-database-url
railway variables set JWT_SECRET=your-jwt-secret
# ... add all required variables
```

#### Custom Domain
```bash
# Generate domain
railway domain

# Use custom domain
railway domain your-api-domain.com
```

### Heroku (Alternative Backend)

#### Setup
```bash
# Install Heroku CLI
# Create app
heroku create your-app-name

# Add PostgreSQL addon
heroku addons:create heroku-postgresql:mini

# Add Redis addon
heroku addons:create heroku-redis:mini
```

#### Deployment
```bash
# Deploy
git push heroku main

# Set environment variables
heroku config:set JWT_SECRET=your-jwt-secret
heroku config:set OPENAI_API_KEY=your-openai-key

# Run migrations
heroku run npm run migrate
```

### AWS (Advanced Deployment)

#### Backend (Elastic Beanstalk)
1. Create Elastic Beanstalk application
2. Configure environment variables
3. Deploy using EB CLI or console

#### Frontend (S3 + CloudFront)
1. Create S3 bucket
2. Enable static website hosting
3. Configure CloudFront distribution
4. Set up custom domain with Route 53

## Database Setup

### PostgreSQL with pgvector

#### Neon Database
1. Create Neon project at [neon.tech](https://neon.tech)
2. Enable pgvector extension
3. Get connection string

#### Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Go to Database → Extensions
3. Enable `vector` extension
4. Get connection string from Settings → Database

#### Self-hosted PostgreSQL
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create database user
CREATE USER ai_chatbot_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ai_chatbot TO ai_chatbot_user;
```

### Database Migrations

Run initial schema setup:
```bash
# Backend directory
cd backend

# Run initialization script
npm run db:init

# Or manually import
psql $DATABASE_URL < database/init.sql
```

### Redis Setup

#### Redis Cloud
1. Create account at [redis.com](https://redis.com)
2. Create database
3. Get connection details

#### Local Redis (Development)
```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:alpine

# Using package manager
# macOS
brew install redis && brew services start redis
# Ubuntu
sudo apt install redis-server && sudo systemctl start redis
```

## Monitoring and Logging

### Application Monitoring

#### Sentry (Error Tracking)
1. Create Sentry project
2. Add DSN to environment variables:
   ```env
   SENTRY_DSN=your-sentry-dsn
   ```

#### DataDog (Performance Monitoring)
```env
DATADOG_API_KEY=your-datadog-api-key
```

### Log Management

#### Structured Logging
```env
LOG_LEVEL=info
LOG_FORMAT=json
```

#### External Log Services
- **Logtail**: For centralized logging
- **CloudWatch**: For AWS deployments
- **Heroku Logs**: For Heroku deployments

### Health Monitoring

Access health endpoints:
- Backend: `https://api.your-domain.com/health`
- Database status, Redis status, AI service status

Set up monitoring alerts for:
- Response time > 2 seconds
- Error rate > 5%
- Memory usage > 80%
- Database connection failures

## Security Considerations

### SSL/TLS Configuration
- Use HTTPS for all endpoints
- Configure HSTS headers
- Use secure cookies

### API Security
- Rate limiting enabled
- CORS properly configured
- Input validation
- SQL injection protection

### Secrets Management
- Use environment variables for secrets
- Never commit secrets to version control
- Rotate API keys regularly
- Use secure key generation

### Database Security
- Use connection pooling
- Enable SSL connections
- Regular security updates
- Backup encryption

## Performance Optimization

### Frontend Optimization
- Code splitting enabled
- Image optimization
- CDN for static assets
- Gzip compression

### Backend Optimization
- Redis caching
- Database query optimization
- Connection pooling
- Horizontal scaling ready

### Database Optimization
- Proper indexing
- Query optimization
- Connection limits
- Read replicas (if needed)

## Backup and Recovery

### Database Backup
```bash
# Automated backup (in production)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup_file.sql
```

### File Backup
- User uploaded documents
- Application logs
- Configuration files

### Disaster Recovery Plan
1. Identify critical components
2. Document recovery procedures
3. Test recovery process regularly
4. Monitor backup success

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1"

# Check connection pool settings
# Increase connection limits if needed
```

#### Redis Connection Issues
```bash
# Test Redis connectivity
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis memory usage
redis-cli info memory
```

#### High Memory Usage
```bash
# Check Node.js memory usage
node --max-old-space-size=2048 src/index.js

# Monitor with PM2
pm2 monit
```

#### Slow API Responses
1. Check database query performance
2. Verify Redis cache hit rates
3. Monitor AI service response times
4. Check network latency

### Debug Mode

Enable debug logging:
```env
DEBUG_MODE=true
LOG_LEVEL=debug
LOG_SQL_QUERIES=true
```

### Performance Profiling
```bash
# Profile Node.js application
node --prof src/index.js

# Generate performance report
node --prof-process isolate-*.log > performance.txt
```

## Rollback Procedures

### Quick Rollback
1. Identify previous working version
2. Revert Git commit:
   ```bash
   git revert HEAD
   git push origin main
   ```
3. Redeploy using deployment script

### Database Rollback
1. Stop application
2. Restore from backup:
   ```bash
   psql $DATABASE_URL < previous_backup.sql
   ```
3. Restart application

### Frontend Rollback
- Vercel: Use deployment history in dashboard
- Manual: Deploy previous build

### Backend Rollback
- Railway: Use previous deployment
- Heroku: `heroku rollback v123`
- Manual: Deploy previous version

## Maintenance

### Regular Tasks
- Monitor application performance
- Update dependencies
- Review security logs
- Database maintenance
- Backup verification

### Scaling Considerations
- Monitor resource usage
- Plan for traffic growth
- Database scaling strategy
- CDN optimization

### Documentation Updates
- Keep deployment docs current
- Update environment configurations
- Document any custom procedures
- Maintain troubleshooting guides

## Support and Contacts

### Emergency Contacts
- DevOps Team: devops@your-company.com
- Database Admin: dba@your-company.com
- Security Team: security@your-company.com

### Monitoring Dashboards
- Application: https://dashboard.your-monitoring.com
- Database: https://db-dashboard.your-monitoring.com
- Infrastructure: https://infra-dashboard.your-monitoring.com

### Documentation Links
- API Documentation: https://docs.your-domain.com
- Architecture Guide: ./ARCHITECTURE.md
- Development Guide: ./README.md

---

For additional help or questions, please contact the development team or create an issue in the repository.