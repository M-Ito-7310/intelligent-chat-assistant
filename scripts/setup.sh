#!/bin/bash

# AI Chatbot Setup Script
# This script sets up the development environment for the AI Chatbot project

set -e

echo "🤖 Setting up AI Chatbot development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Create .env file from example if it doesn't exist
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}📝 Creating .env file from example...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${YELLOW}⚠️  Please update the .env file with your actual API keys and configuration${NC}"
fi

# Install root dependencies
echo -e "${GREEN}📦 Installing root dependencies...${NC}"
npm install

# Install backend dependencies
echo -e "${GREEN}📦 Installing backend dependencies...${NC}"
cd backend
npm install
cd ..

# Install frontend dependencies
echo -e "${GREEN}📦 Installing frontend dependencies...${NC}"
cd frontend
npm install
cd ..

# Start Docker services
echo -e "${GREEN}🐳 Starting Docker services...${NC}"
docker-compose up -d postgres redis

# Wait for database to be ready
echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
sleep 10

# Check database connection
echo -e "${GREEN}🗄️  Checking database connection...${NC}"
docker-compose exec -T postgres pg_isready -U ai_chatbot_user -d ai_chatbot

echo -e "${GREEN}✅ Setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "  1. Update backend/.env with your API keys"
echo -e "  2. Run 'npm run dev' to start the development servers"
echo -e "  3. Visit http://localhost:5173 for the frontend"
echo -e "  4. API will be available at http://localhost:3000"
echo ""
echo -e "${GREEN}🚀 Happy coding!${NC}"