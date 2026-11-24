import express from 'express';
import {
  previewCatalogImport,
  confirmCatalogImport
} from '../controllers/catalogController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// Catalog preview & import (Admin protected)
router.get('/preview', protect, adminOnly, previewCatalogImport);
router.post('/preview', protect, adminOnly, previewCatalogImport);
router.post('/confirm-import', protect, adminOnly, confirmCatalogImport);

// AI Image Generation endpoint
export default router;
