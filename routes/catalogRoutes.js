import express from 'express';
import {
  previewCatalogImport,
  confirmCatalogImport,
  generateAIProductImage
} from '../controllers/catalogController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Catalog preview & import (Admin protected)
router.post('/preview', protect, adminOnly, previewCatalogImport);
router.post('/confirm-import', protect, adminOnly, confirmCatalogImport);

// AI Image Generation endpoint
router.post('/ai-generate-image', protect, adminOnly, generateAIProductImage);

export default router;
