import express from 'express';
import { body } from 'express-validator';
import { 
  sendMessage,
  streamMessage,
  getConversations, 
  getConversation, 
  createConversation,
  deleteConversation,
  updateConversationTitle,
  getRAGStatistics
} from '../controllers/chatController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// All chat routes require authentication
router.use(auth);

// Send message
router.post('/message', [
  body('message').trim().isLength({ min: 1 }),
  body('conversationId').optional().isUUID()
], sendMessage);

// Stream message (Server-Sent Events)
router.post('/stream', [
  body('message').trim().isLength({ min: 1 }),
  body('conversationId').optional().isUUID()
], streamMessage);

// Create new conversation
router.post('/conversations', [
  body('title').optional().trim().isLength({ min: 1, max: 255 })
], createConversation);

// Get user conversations
router.get('/conversations', getConversations);

// Get specific conversation
router.get('/conversations/:id', getConversation);

// Update conversation title
router.patch('/conversations/:id/title', [
  body('title').trim().isLength({ min: 1, max: 255 })
], updateConversationTitle);

// Delete conversation
router.delete('/conversations/:id', deleteConversation);

// Get RAG statistics
router.get('/rag/statistics', getRAGStatistics);

export default router;