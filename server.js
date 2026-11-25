import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import brandRoutes from './routes/brandRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import authRoutes from './routes/authRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import enquiryRoutes from './routes/enquiryRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import { seedAdmin } from './controllers/authController.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const app = express();
const PORT = process.env.PORT || 5000;

// ── Request Logger (dev) ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    const dbState = mongoose.connection.readyState;
    const dbLabel = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}  db:${dbLabel}`);
    next();
  });
}

// Connect to MongoDB
connectDB().then(() => {
  seedAdmin();
});

// Middleware - allow generous limit for Base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/admin/enquiries', enquiryRoutes); // Alias for direct admin access
app.use('/api/admin/customers', customerRoutes);

// Contact endpoint - saves to Enquiry model as well
app.post('/api/contact', async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !phone || !message) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }
    // Forward internally to submitEnquiry logic
    req.body.customerName = name;
    const { submitEnquiry } = await import('./controllers/enquiryController.js');
    return submitEnquiry(req, res, next);
  } catch (err) {
    next(err);
  }
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
  const readyState = mongoose.connection.readyState;
  const isMongoConnected = readyState === 1;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState] || 'unknown';

  const payload = {
    success: isMongoConnected,
    status: isMongoConnected ? 'healthy' : 'degraded',
    service: 'NS Stone Chemicals API & Admin Backend',
    database: dbStatus,
    timestamp: new Date().toISOString()
  };

  // Return 503 when MongoDB is not connected so load-balancers/health checks
  // correctly detect the backend as unavailable
  return res.status(isMongoConnected ? 200 : 503).json(payload);
});

// Centralized error handling
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  console.error(`[ERROR] ${req.method} ${req.url} → ${status}: ${err.message}`);
  if (isDev && err.stack) console.error(err.stack);

  res.status(status).json({
    success: false,
    message: isDev ? err.message : (status < 500 ? err.message : 'Internal Server Error')
  });
});

const server = app.listen(PORT, () => {
  console.log(`NS Stone Chemicals Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use by another process.`);
    console.error(`To fix this on Windows PowerShell, run:\nGet-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
    process.exit(1);
  } else {
    console.error('Server Listen Error:', err);
  }
});
