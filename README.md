# Intelligent Chat Assistant

[![CI/CD Pipeline](https://github.com/M-Ito-7310/intelligent-chat-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/M-Ito-7310/intelligent-chat-assistant/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.9.0-blue.svg)](https://github.com/M-Ito-7310/intelligent-chat-assistant/releases)

An intelligent chatbot service with RAG (Retrieval-Augmented Generation) capabilities that can understand and answer questions based on uploaded documents. Built with modern technologies and ready for production deployment.

## Features

### Core Features
- 💬 **Real-time Chat**: Instant messaging with AI-powered responses
- 📄 **Document Understanding**: Upload and chat about your documents (PDF, TXT)
- 🧠 **RAG Integration**: Context-aware responses using vector search
- 💾 **Conversation History**: Persistent chat history with search
- 🚀 **Streaming Responses**: Real-time response generation

### Advanced Features
- 🔐 **User Authentication**: Secure user accounts with JWT tokens
- 📊 **Usage Analytics**: Track conversation metrics with quota management
- 🎨 **Customizable UI**: Modern, responsive design with dark/light theme
- 🌐 **Multi-language**: Full Japanese and English support with i18n
- 📱 **Mobile Friendly**: Fully responsive design for all devices
- 📤 **Export Conversations**: Export chat history as JSON
- 👨‍💼 **Admin Dashboard**: System monitoring and user management
- ⚡ **Performance Optimized**: Database query optimization and lazy loading
- 🎮 **Demo Mode**: Try the chatbot without API keys

## Technology Stack

### Frontend
- **Framework**: Vue.js 3 with TypeScript and Composition API
- **Styling**: Tailwind CSS with dark/light theme support
- **State Management**: Pinia stores
- **Build Tool**: Vite
- **Internationalization**: Vue I18n with Japanese and English
- **Performance**: Lazy loading and virtual scrolling components

### Backend
- **Runtime**: Node.js with JavaScript
- **Framework**: Express.js
- **Database**: PostgreSQL with pgvector
- **Caching**: Redis for response caching
- **Authentication**: JWT with refresh tokens
- **File Processing**: PDF parsing and text extraction

### AI/ML
- **LLM Provider**: OpenAI API / Hugging Face
- **Embeddings**: OpenAI text-embedding-ada-002
- **Document Processing**: PDF.js, Langchain

## Project Structure

```
ai-chatbot/
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── config/         # Database and environment config
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # Database models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   │   └── ai/         # AI-related services
│   │   └── utils/          # Utility functions
│   └── tests/              # Backend tests
├── frontend/               # Vue.js frontend app
├── docs/                   # Project documentation
├── scripts/                # Development scripts
└── ROADMAP.md             # Development roadmap
```

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- PostgreSQL database
- OpenAI API key or Hugging Face token

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/M-Ito-7310/intelligent-chat-assistant.git
   cd intelligent-chat-assistant
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Configure your environment variables
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/ai_chatbot

# AI Services
OPENAI_API_KEY=your_openai_key
HUGGINGFACE_TOKEN=your_hf_token

# Vector Database
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENVIRONMENT=your_environment

# Application
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh JWT token

### Chat
- `POST /api/chat/message` - Send message with streaming support
- `GET /api/chat/conversations` - Get user conversations
- `GET /api/chat/conversations/:id` - Get conversation history
- `DELETE /api/chat/conversations/:id` - Delete conversation
- `POST /api/chat/export/:id` - Export conversation (PDF/JSON)
- `GET /api/chat/stream` - Server-sent events for real-time responses

### Documents
- `POST /api/documents/upload` - Upload document with chunking
- `GET /api/documents` - Get user documents with metadata
- `DELETE /api/documents/:id` - Delete document and vectors
- `GET /api/documents/:id/chunks` - Get document chunks
- `POST /api/documents/search` - Semantic search across documents

## Development Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed development phases and milestones.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you have any questions or need help, please open an issue on GitHub.

---

**Status**: 🚀 Phase 4 - Advanced Features (90% Complete)

### Development Progress
- ✅ **Phase 1-3**: Core functionality complete (Chat, AI, RAG)
- ✅ **Phase 4**: Advanced features nearly complete (90% complete)
  - ✅ Database query optimization with materialized views
  - ✅ Frontend lazy loading and virtual scrolling
  - ✅ Complete multi-language support (Japanese/English)
  - ✅ Authentication persistence and session management
  - ✅ Admin dashboard with system metrics
  - ✅ Document management with file processing
- ⏳ **Phase 5**: Testing & Deployment (ready to start)

This project is actively being developed. The core features are complete and the application is nearly ready for production deployment.

### Current Implementation Stats
- **Frontend**: 12 Vue components, 24+ TypeScript files
- **Backend**: 22+ JavaScript files with comprehensive API coverage
- **Database**: PostgreSQL with pgvector, materialized views, composite indexes
- **Features**: Complete authentication, RAG pipeline, document processing, i18n
- **Performance**: Query optimization, lazy loading, caching implemented