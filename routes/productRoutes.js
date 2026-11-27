import express from 'express';
import {
  getProducts,
  getProductsByCategory,
  getFeaturedProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductPrice,
  updateProductStock,
  updateProductDescription,
  deleteProduct
} from '../controllers/productController.js';
import { protect, adminOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const adminAwareProductList = handler => (req, res, next) => {
  if (req.query.activeOnly !== 'false') return handler(req, res, next);
  return protect(req, res, () =>
    adminOnly(req, res, () => handler(req, res, next))
  );
};

router.get('/', noStore, adminAwareProductList(getProducts));
router.get('/category/:category', noStore, adminAwareProductList(getProductsByCategory));
router.get('/featured', noStore, getFeaturedProducts);
router.get('/:id', noStore, getProductById);

// Admin endpoints
router.post('/', protect, adminOnly, createProduct);
router.put('/:id', protect, adminOnly, updateProduct);
router.patch('/:id/price', protect, adminOnly, updateProductPrice);
router.patch('/:id/stock', protect, adminOnly, updateProductStock);
router.patch('/:id/description', protect, adminOnly, updateProductDescription);
router.delete('/:id', protect, adminOnly, deleteProduct);

export default router;
