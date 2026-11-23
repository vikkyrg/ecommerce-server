import express from 'express';
import {
  createOrder,
  getOrderById,
  getMyOrders,
  trackOrder,
  getAllOrders,
  updateOrderStatus
} from '../controllers/orderController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', createOrder);
router.post('/track', trackOrder);
router.get('/myorders', protect, getMyOrders);
router.get('/:id', getOrderById);

// Admin routes
router.get('/', protect, adminOnly, getAllOrders);
router.put('/:id/status', protect, adminOnly, updateOrderStatus);

export default router;
