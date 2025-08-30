import express from 'express';
import { body } from 'express-validator';
import { register, login, refreshToken, getProfile } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Register user
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 })
], register);

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists()
], login);

// Refresh JWT token
router.post('/refresh', refreshToken);

// Get user profile (protected)
router.get('/profile', auth, getProfile);

export default router;