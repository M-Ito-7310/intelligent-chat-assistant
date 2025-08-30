#!/bin/bash

# AI Chatbot Status Check Script
# This script checks the status of all services

echo "🤖 AI Chatbot Service Status"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Docker services
echo -e "${BLUE}🐳 Docker Services:${NC}"
if command -v docker-compose &> /dev/null; then
    docker-compose ps
else
    echo -e "${RED}❌ Docker Compose not available${NC}"
fi

echo ""

# Check if backend is running
echo -e "${BLUE}🔧 Backend Service:${NC}"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running on http://localhost:3000${NC}"
    # Get health info
    curl -s http://localhost:3000/health | jq '.' 2>/dev/null || echo "Health endpoint responded"
else
    echo -e "${RED}❌ Backend is not running${NC}"
fi

echo ""

# Check if frontend is accessible
echo -e "${BLUE}🎨 Frontend Service:${NC}"
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is running on http://localhost:5173${NC}"
else
    echo -e "${RED}❌ Frontend is not running${NC}"
fi

echo ""

# Check database connection
echo -e "${BLUE}🗄️  Database Service:${NC}"
if docker-compose exec -T postgres pg_isready -U ai_chatbot_user -d ai_chatbot > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is running and accessible${NC}"
    # Get database info
    echo -e "${YELLOW}📊 Database Info:${NC}"
    docker-compose exec -T postgres psql -U ai_chatbot_user -d ai_chatbot -c "SELECT version();" 2>/dev/null | head -3 | tail -1 || echo "Could not get version"
else
    echo -e "${RED}❌ Database is not accessible${NC}"
fi

echo ""

# Check Redis connection
echo -e "${BLUE}🔴 Redis Service:${NC}"
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running and accessible${NC}"
else
    echo -e "${RED}❌ Redis is not accessible${NC}"
fi

echo ""

# Show logs if there are any errors
echo -e "${BLUE}📋 Recent Logs:${NC}"
echo -e "${YELLOW}Backend logs (last 5 lines):${NC}"
if [ -f "backend/logs/combined.log" ]; then
    tail -5 backend/logs/combined.log 2>/dev/null || echo "No backend logs found"
else
    echo "No log file found yet"
fi

echo ""
echo -e "${GREEN}Status check completed!${NC}"