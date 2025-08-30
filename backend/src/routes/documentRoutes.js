import express from 'express';
import multer from 'multer';
import { 
  uploadDocument, 
  getDocuments, 
  deleteDocument,
  getDocumentContent,
  searchDocuments,
  getProcessingStatus,
  reprocessDocument,
  getDocumentChunks
} from '../controllers/documentController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// All document routes require authentication
router.use(auth);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, TXT, and MD files are allowed.'), false);
    }
  }
});

// Upload document
router.post('/upload', upload.single('document'), uploadDocument);

// Get user documents
router.get('/', getDocuments);

// Get document content
router.get('/:id', getDocumentContent);

// Get document chunks
router.get('/:id/chunks', getDocumentChunks);

// Delete document
router.delete('/:id', deleteDocument);

// Reprocess document
router.post('/:id/reprocess', reprocessDocument);

// Search documents
router.post('/search', searchDocuments);

// Get processing status
router.get('/status/processing', getProcessingStatus);

export default router;