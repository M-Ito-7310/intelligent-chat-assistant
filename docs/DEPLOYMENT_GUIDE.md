# Deployment Guide - Intelligent Chat Assistant

## Overview

This guide covers deploying the Intelligent Chat Assistant to production environments. The application supports multiple deployment strategies including Docker, cloud platforms, and traditional server deployments.

## Prerequisites

### System Requirements
- **CPU**: 2+ cores recommended
- **Memory**: 4GB+ RAM recommended  
- **Storage**: 10GB+ available space
- **OS**: Linux (Ubuntu 20.04+), macOS, or Windows with Docker

### Required Services
- **Database**: PostgreSQL 15+ with pgvector extension
- **Cache**: Redis 7+ 
- **Node.js**: v18+ (if not using Docker)
- **SSL Certificate**: For production HTTPS

## Environment Configuration

### 1. Environment Variables

Create `.env` files for both frontend and backend:

**Backend (.env)**:
```bash
# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/database
REDIS_URL=redis://host:6379

# Authentication
JWT_SECRET=your-super-secure-jwt-secret
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# AI Services
OPENAI_API_KEY=sk-your-openai-key
HUGGINGFACE_TOKEN=hf_your-huggingface-token

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

**Frontend Environment**:
```bash
VITE_API_BASE_URL=https://api.your-domain.com
VITE_APP_ENV=production
```

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### 1. Build Images
```bash
# Build backend
cd backend
docker build -t intelligent-chat-backend .

# Build frontend
cd ../frontend
docker build -t intelligent-chat-frontend .
```

#### 2. Docker Compose Production
Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg15
    environment:
      POSTGRES_DB: intelligent_chat
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/src/config/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped

  backend:
    image: intelligent-chat-backend
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/intelligent_chat
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - HUGGINGFACE_TOKEN=${HUGGINGFACE_TOKEN}
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    image: intelligent-chat-frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs
      - ./nginx.prod.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

#### 3. Deploy
```bash
# Set environment variables
export DB_USER=your_db_user
export DB_PASSWORD=your_db_password
export REDIS_PASSWORD=your_redis_password
export JWT_SECRET=your_jwt_secret
export OPENAI_API_KEY=your_openai_key
export HUGGINGFACE_TOKEN=your_huggingface_token

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Option 2: Cloud Platform Deployment

#### Vercel + Railway
1. **Frontend (Vercel)**:
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Deploy frontend
   cd frontend
   vercel --prod
   ```

2. **Backend (Railway)**:
   ```bash
   # Install Railway CLI  
   npm i -g @railway/cli
   
   # Login and deploy
   railway login
   railway link
   railway up
   ```

#### AWS ECS/Fargate
1. Push images to ECR
2. Create ECS cluster and task definitions
3. Set up Application Load Balancer
4. Configure RDS (PostgreSQL) and ElastiCache (Redis)

#### Google Cloud Run
```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/intelligent-chat-backend backend/
gcloud builds submit --tag gcr.io/PROJECT_ID/intelligent-chat-frontend frontend/

# Deploy services
gcloud run deploy intelligent-chat-backend --image gcr.io/PROJECT_ID/intelligent-chat-backend
gcloud run deploy intelligent-chat-frontend --image gcr.io/PROJECT_ID/intelligent-chat-frontend
```

### Option 3: Traditional Server Deployment

#### 1. Server Setup (Ubuntu 20.04+)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL with pgvector
sudo apt install postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE EXTENSION vector;"

# Install Redis
sudo apt install redis-server

# Install PM2 for process management
npm install -g pm2

# Install Nginx
sudo apt install nginx certbot python3-certbot-nginx
```

#### 2. Database Setup
```bash
sudo -u postgres createuser --interactive # Create app user
sudo -u postgres createdb intelligent_chat
sudo -u postgres psql intelligent_chat < backend/src/config/init.sql
```

#### 3. Application Deployment
```bash
# Clone repository
git clone https://github.com/M-Ito-7310/intelligent-chat-assistant.git
cd intelligent-chat-assistant

# Backend setup
cd backend
npm ci --production
cp .env.example .env
# Configure .env with production values

# Frontend build
cd ../frontend
npm ci
npm run build

# Start services with PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

#### 4. Nginx Configuration
Create `/etc/nginx/sites-available/intelligent-chat`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # Frontend
    location / {
        root /path/to/intelligent-chat-assistant/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        gzip on;
        gzip_types text/plain text/css application/json application/javascript;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/intelligent-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```

## Database Migrations

### Initial Setup
```bash
cd backend
npm run migrate:init
```

### Running Migrations
```bash
# Development
npm run migrate:dev

# Production  
npm run migrate:prod
```

### Creating New Migrations
```bash
npm run migrate:create migration_name
```

## Performance Optimization

### Database Optimization
1. **Indexes**: Run `backend/src/config/optimize.sql`
2. **Connection Pooling**: Configure in `backend/src/config/database.js`
3. **Query Analysis**: Use `EXPLAIN ANALYZE` for slow queries

### Caching Strategy
1. **Redis Configuration**:
   ```bash
   # Redis production config
   maxmemory 256mb
   maxmemory-policy allkeys-lru
   save 900 1
   ```

2. **Application Caching**:
   - API responses: 5-60 minutes
   - User sessions: 7 days
   - Document embeddings: No expiration

### Frontend Optimization
1. **Build Optimization**:
   ```bash
   npm run build -- --mode production
   ```

2. **CDN Configuration**: Use CloudFront or similar for static assets

## Monitoring and Logging

### Application Monitoring
```bash
# Install monitoring tools
npm install -g pm2-logrotate

# Configure log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
```

### Health Checks
The application provides health check endpoints:
- **Backend**: `GET /api/health`
- **Database**: `GET /api/health/db`
- **Cache**: `GET /api/health/cache`

### Log Management
Logs are structured JSON format:
```json
{
  "timestamp": "2024-08-30T10:00:00Z",
  "level": "info",
  "message": "User authenticated",
  "userId": "uuid",
  "ip": "192.168.1.1"
}
```

## Security Considerations

### Production Checklist
- [ ] Strong JWT secret (32+ characters)
- [ ] HTTPS enabled with valid certificate
- [ ] Environment variables secured
- [ ] Database credentials rotated
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] File upload restrictions enforced
- [ ] Security headers configured
- [ ] Regular dependency updates
- [ ] Backup strategy implemented

### Firewall Configuration
```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

## Backup and Recovery

### Database Backup
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump intelligent_chat > /backups/intelligent_chat_$DATE.sql
find /backups -name "intelligent_chat_*.sql" -mtime +7 -delete
```

### File Backup
```bash
# Backup uploaded files
rsync -av /path/to/uploads/ /backups/uploads/
```

### Automated Backups
Add to crontab:
```bash
# Daily database backup at 2 AM
0 2 * * * /path/to/backup-script.sh

# Weekly file backup
0 3 * * 0 /path/to/file-backup.sh
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Check connection
   psql -h localhost -U username -d intelligent_chat
   ```

2. **Redis Connection Failed**
   ```bash
   # Check Redis status
   sudo systemctl status redis
   
   # Test connection
   redis-cli ping
   ```

3. **High Memory Usage**
   ```bash
   # Check memory usage
   free -h
   
   # Restart services
   pm2 restart all
   ```

4. **SSL Certificate Issues**
   ```bash
   # Renew certificate
   sudo certbot renew --nginx
   
   # Check certificate status
   sudo certbot certificates
   ```

### Log Analysis
```bash
# View application logs
pm2 logs

# Search for errors
grep -i error /var/log/nginx/error.log

# Monitor real-time logs
tail -f /path/to/app/logs/app.log
```

## Scaling Considerations

### Horizontal Scaling
1. **Load Balancer**: Nginx or cloud load balancer
2. **Database Replica**: Read replicas for scaling reads
3. **Redis Cluster**: For high availability caching
4. **Container Orchestration**: Kubernetes for large deployments

### Vertical Scaling
1. **CPU**: Monitor and increase based on load
2. **Memory**: Ensure sufficient RAM for Redis and Node.js
3. **Storage**: Use SSD for database and file storage

## Support and Maintenance

- **Updates**: Monitor GitHub releases
- **Security Patches**: Apply promptly
- **Performance Monitoring**: Use APM tools
- **User Feedback**: Monitor issues and feature requests

For additional support, consult the [API Reference](./API_REFERENCE.md) or submit issues on [GitHub](https://github.com/M-Ito-7310/intelligent-chat-assistant/issues).