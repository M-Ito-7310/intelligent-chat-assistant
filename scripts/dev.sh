#!/bin/bash

# AI Chatbot Development Script
# This script starts the development environment

set -e

echo "🤖 Starting AI Chatbot development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ .env file not found. Please run setup.sh first.${NC}"
    exit 1
fi

# Start Docker services if they're not running
echo -e "${BLUE}🐳 Starting Docker services...${NC}"
docker-compose up -d postgres redis

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 5

# Check if services are healthy
echo -e "${GREEN}🏥 Checking service health...${NC}"
docker-compose ps

# Start development servers
echo -e "${GREEN}🚀 Starting development servers...${NC}"
echo -e "${YELLOW}📝 Backend will be available at: http://localhost:3000${NC}"
echo -e "${YELLOW}📝 Frontend will be available at: http://localhost:5173${NC}"
echo -e "${YELLOW}📝 Database is running on port: 5433${NC}"
echo -e "${YELLOW}📝 Redis is running on port: 6380${NC}"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop all services${NC}"
echo ""

# Run the development servers
npm run dev