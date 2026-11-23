import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import { seedCategoriesIfEmpty } from './controllers/categoryController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB().then(() => {
  seedCategoriesIfEmpty();
});

// Middleware - allow generous limit for Base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/auth', adminAuthRoutes);

// Contact endpoint
app.post('/api/contact', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !phone || !message) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }
  res.json({ success: true, message: 'Message received successfully. Our team will contact you shortly.' });
});

// Coupon validation
app.post('/api/coupons/validate', (req, res) => {
  const { code, cartTotal = 0 } = req.body;
  const cleanCode = (code || '').trim().toUpperCase();

  const coupons = {
    'STONE10': { discountPercent: 10, minOrder: 999, maxDiscount: 1000 },
    'WELCOME100': { discountFlat: 100, minOrder: 1499 },
    'PREMIUM15': { discountPercent: 15, minOrder: 4999, maxDiscount: 2500 }
  };

  const coupon = coupons[cleanCode];
  if (!coupon) {
    return res.status(400).json({ valid: false, message: 'Invalid coupon code' });
  }

  if (cartTotal < coupon.minOrder) {
    return res.status(400).json({
      valid: false,
      message: `Minimum order value of ₹${coupon.minOrder.toLocaleString('en-IN')} required for this coupon`
    });
  }

  let discount = 0;
  if (coupon.discountPercent) {
    discount = Math.round((cartTotal * coupon.discountPercent) / 100);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
  } else if (coupon.discountFlat) {
    discount = coupon.discountFlat;
  }

  res.json({
    valid: true,
    code: cleanCode,
    discount,
    message: `Coupon applied! You saved ₹${discount.toLocaleString('en-IN')}`
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NS Stone Chemicals API & Admin Backend', timestamp: new Date() });
});

// Centralized error handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`NS Stone Chemicals Server running on http://localhost:${PORT}`);
});
