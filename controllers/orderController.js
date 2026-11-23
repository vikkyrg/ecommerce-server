import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../models/Order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ordersFilePath = path.join(__dirname, '../data/orders.json');

const getLocalOrders = () => {
  try {
    if (fs.existsSync(ordersFilePath)) {
      return JSON.parse(fs.readFileSync(ordersFilePath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const saveLocalOrders = orders => {
  try {
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), 'utf8');
  } catch (e) {}
};

// Generate order number like NSC-2025-10492
const generateOrderNumber = () => {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `NSC-${new Date().getFullYear()}-${rand}`;
};

// @desc    Create new order
// @route   POST /api/orders
export const createOrder = async (req, res) => {
  try {
    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      customerName,
      phone,
      guestEmail,
      itemsPrice,
      shippingPrice = 0,
      discountAmount = 0,
      totalPrice
    } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items specified' });
    }

    if (!shippingAddress || !customerName || !phone) {
      return res.status(400).json({ message: 'Missing required shipping or customer details' });
    }

    const orderNumber = generateOrderNumber();
    const userId = req.user ? req.user.id : null;

    // Server-side authoritative validation
    const computedItemsPrice = orderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const finalShipping = computedItemsPrice > 1999 ? 0 : shippingPrice;
    const computedTotal = Math.max(0, computedItemsPrice + finalShipping - discountAmount);

    const newOrderData = {
      orderNumber,
      user: userId,
      guestEmail: guestEmail || (req.user ? req.user.email : ''),
      customerName,
      phone,
      orderItems,
      shippingAddress,
      paymentMethod: paymentMethod || 'UPI',
      paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Completed',
      itemsPrice: computedItemsPrice,
      shippingPrice: finalShipping,
      discountAmount,
      totalPrice: computedTotal,
      orderStatus: 'Order Placed',
      trackingNumber: `TRK-${Date.now().toString().slice(-8)}`
    };

    if (Order.db?.readyState === 1) {
      const order = await Order.create(newOrderData);
      return res.status(201).json(order);
    }

    // Local in-memory fallback
    const orders = getLocalOrders();
    const localOrder = {
      _id: `ord-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...newOrderData
    };
    orders.unshift(localOrder);
    saveLocalOrders(orders);

    res.status(201).json(localOrder);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Error creating order' });
  }
};

// @desc    Get order by ID or orderNumber
// @route   GET /api/orders/:id
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (Order.db?.readyState === 1) {
      const order = await Order.findOne({
        $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { orderNumber: id }]
      });
      if (order) return res.json(order);
    }

    const orders = getLocalOrders();
    const order = orders.find(o => o._id === id || o.orderNumber === id);
    if (order) return res.json(order);

    res.status(404).json({ message: 'Order not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
export const getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    if (Order.db?.readyState === 1) {
      const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
      return res.json(orders);
    }

    const orders = getLocalOrders();
    const myOrders = orders.filter(o => o.user === userId || o.guestEmail === req.user.email);
    res.json(myOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Track order by orderNumber and phone
// @route   POST /api/orders/track
export const trackOrder = async (req, res) => {
  try {
    const { orderNumber, phone } = req.body;
    if (!orderNumber) {
      return res.status(400).json({ message: 'Please provide an Order Number' });
    }

    const cleanOrderNumber = orderNumber.trim().toUpperCase();

    if (Order.db?.readyState === 1) {
      const query = { orderNumber: cleanOrderNumber };
      if (phone) query.phone = { $regex: phone.slice(-8) };
      const order = await Order.findOne(query);
      if (order) return res.json(order);
    }

    const orders = getLocalOrders();
    const order = orders.find(
      o =>
        o.orderNumber?.toUpperCase() === cleanOrderNumber &&
        (!phone || o.phone?.includes(phone.slice(-8)))
    );

    if (order) return res.json(order);

    res.status(404).json({ message: 'No matching order found for this order number and contact' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
export const getAllOrders = async (req, res) => {
  try {
    if (Order.db?.readyState === 1) {
      const orders = await Order.find({}).sort({ createdAt: -1 });
      return res.json(orders);
    }
    const orders = getLocalOrders();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, trackingNumber } = req.body;

    if (Order.db?.readyState === 1) {
      const order = await Order.findById(id);
      if (order) {
        if (orderStatus) order.orderStatus = orderStatus;
        if (trackingNumber) order.trackingNumber = trackingNumber;
        const updated = await order.save();
        return res.json(updated);
      }
    }

    const orders = getLocalOrders();
    const idx = orders.findIndex(o => o._id === id || o.orderNumber === id);
    if (idx !== -1) {
      if (orderStatus) orders[idx].orderStatus = orderStatus;
      if (trackingNumber) orders[idx].trackingNumber = trackingNumber;
      orders[idx].updatedAt = new Date().toISOString();
      saveLocalOrders(orders);
      return res.json(orders[idx]);
    }

    res.status(404).json({ message: 'Order not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
