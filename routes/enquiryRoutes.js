import express from 'express';
import {
  submitEnquiry,
  getAdminEnquiries,
  getAdminEnquiryById,
  updateEnquiryStatus,
  updateEnquiryNotes,
  deleteEnquiry
} from '../controllers/enquiryController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public / User route to submit enquiry
router.post('/', submitEnquiry);

// Admin-protected routes
router.get('/admin', protect, adminOnly, getAdminEnquiries);
router.get('/admin/:id', protect, adminOnly, getAdminEnquiryById);
router.patch('/admin/:id/status', protect, adminOnly, updateEnquiryStatus);
router.patch('/admin/:id/notes', protect, adminOnly, updateEnquiryNotes);
router.delete('/admin/:id', protect, adminOnly, deleteEnquiry);

export default router;
