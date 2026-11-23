import express from 'express';
import User from '../models/User.js';
import { generateToken, protect, adminOnly } from '../middleware/authMiddleware.js';
import { comparePassword } from '../utils/tokenUtil.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../data/users.json');

const router = express.Router();

// Admin login - directly checks credentials & verifies role === 'admin'
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check MongoDB if connected
    if (User.db?.readyState === 1) {
      const user = await User.findOne({ email: cleanEmail });
      if (user && (await user.matchPassword(password))) {
        if (user.role !== 'admin') {
          return res.status(403).json({ message: 'Access denied: Administrator privileges required.' });
        }
        return res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          token: generateToken(user._id, user.role)
        });
      }
      return res.status(401).json({ message: 'Invalid admin email or password' });
    }

    // 2. Check Local File Fallback
    if (fs.existsSync(usersFilePath)) {
      const users = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      const user = users.find(u => u.email === cleanEmail);
      if (user && comparePassword(password, user.password)) {
        if (user.role !== 'admin') {
          return res.status(403).json({ message: 'Access denied: Administrator privileges required.' });
        }
        return res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          token: generateToken(user._id, user.role)
        });
      }
    }

    return res.status(401).json({ message: 'Invalid admin email or password' });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ message: err.message || 'Server error during admin login' });
  }
});

// Admin verification / me
router.get('/me', protect, adminOnly, async (req, res) => {
  res.json({
    user: req.user,
    message: 'Admin authorization valid'
  });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  res.json({ message: 'Admin logged out successfully' });
});

export default router;
