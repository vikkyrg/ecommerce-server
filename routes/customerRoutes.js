import express from 'express';
import {
  getAdminCustomers,
  getAdminCustomerById
} from '../controllers/customerController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// All customer management endpoints require Admin authentication
router.get('/', protect, adminOnly, getAdminCustomers);
router.get('/:id', protect, adminOnly, getAdminCustomerById);

export default router;
