import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { withOriginalPrice } from '../utils/productPricing.js';
import { isValidStockQuantity } from '../utils/productStock.js';
import { changeProductStock, runWithInventoryTransaction } from '../services/inventoryService.js';

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

// Generate order number like NSC-2025-10492
const generateOrderNumber = () => {
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `NSC-${new Date().getFullYear()}-${rand}`;
};

const createHttpError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const orderProductFilter = productRef => {
  const cleanRef = String(productRef).trim();
  return mongoose.isValidObjectId(cleanRef)
    ? { _id: cleanRef }
    : { $or: [{ slug: cleanRef.toLowerCase() }, { sku: cleanRef.toUpperCase() }] };
};

const parseOrderLines = orderItems => {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    throw createHttpError('No order items specified', 400);
  }
  if (orderItems.length > 100) {
    throw createHttpError('An order cannot contain more than 100 line items', 400);
  }

  return orderItems.map(item => {
    const productRef = item?.productId || item?.product || item?.id;
    const quantity = typeof item?.quantity === 'string' && item.quantity.trim() !== ''
      ? Number(item.quantity)
      : item?.quantity;
    if (!productRef || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw createHttpError('Each order item must have a product and a positive integer quantity', 400);
    }
    return { productRef: String(productRef), quantity, size: item.size };
  });
};

const loadOrderProducts = async (lines, session) => Promise.all(lines.map(async line => {
  const query = Product.findOne(orderProductFilter(line.productRef));
  if (session) query.session(session);
  const product = await query.lean();
  if (!product || product.isActive === false) {
    throw createHttpError('One or more products are no longer available', 409);
  }
  if (!isValidStockQuantity(product.stock)) {
    throw createHttpError(`Stock is not configured for ${product.name}. Please contact support.`, 409);
  }

  const normalizedProduct = withOriginalPrice(product);
  const price = normalizedProduct.discountPrice ?? normalizedProduct.originalPrice;
  if (!Number.isFinite(price) || price <= 0) {
    throw createHttpError(`A current price is unavailable for ${product.name}.`, 409);
  }

  return {
    ...line,
    product,
    productId: product._id,
    productName: product.name,
    image: product.image || '',
    price,
    availableStock: product.stock,
    size: product.size || line.size || ''
  };
}));

const getStockChanges = orderLines => {
  const changes = new Map();
  for (const line of orderLines) {
    const key = String(line.productId);
    const change = changes.get(key) || {
      productId: line.productId,
      productName: line.productName,
      quantity: 0,
      stock: line.availableStock
    };
    change.quantity += line.quantity;
    changes.set(key, change);
  }

  for (const change of changes.values()) {
    if (change.quantity > change.stock) {
      throw createHttpError(
        `Only ${change.stock} units are currently available for ${change.productName}.`,
        409
      );
    }
  }
  return [...changes.values()];
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
      userId,
      itemsPrice,
      shippingPrice = 0,
      discountAmount = 0,
      totalPrice
    } = req.body;

    if (!shippingAddress || !customerName || !phone) {
      return res.status(400).json({ message: 'Missing required shipping or customer details' });
    }
    if (Order.db?.readyState !== 1 || Product.db?.readyState !== 1) {
      return res.status(503).json({ message: 'Order and inventory databases are unavailable' });
    }

    // Determine customer user ID from token or body or fallback lookup
    let effectiveUserId = null;
    const candidateId = req.user?.id || req.user?._id || userId;
    if (candidateId && mongoose.isValidObjectId(candidateId)) {
      effectiveUserId = candidateId;
    }
    let customerEmail = req.user?.email || guestEmail || '';

    // If effectiveUserId not set yet and email is present, look up user in DB
    if (!effectiveUserId && customerEmail) {
      try {
        const User = mongoose.models.User || mongoose.model('User');
        const foundUser = await User.findOne({ email: customerEmail.toLowerCase().trim() }).lean();
        if (foundUser && foundUser._id) {
          effectiveUserId = foundUser._id;
        }
      } catch (e) {}
    }

    const lines = parseOrderLines(orderItems);
    const validPaymentMethods = ['UPI', 'Card', 'NetBanking', 'COD'];
    const normalizedPaymentMethod = String(paymentMethod || 'UPI').toUpperCase();
    if (!validPaymentMethods.includes(normalizedPaymentMethod)) {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    const requestedShipping = Number(shippingPrice);
    const requestedDiscount = Number(discountAmount);
    if (!Number.isFinite(requestedShipping) || requestedShipping < 0 ||
      !Number.isFinite(requestedDiscount) || requestedDiscount < 0) {
      return res.status(400).json({ message: 'Shipping and discount amounts must be valid non-negative numbers' });
    }

    const orderNumber = generateOrderNumber();
    const buildOrderData = async session => {
      const orderLines = await loadOrderProducts(lines, session);
      const stockChanges = getStockChanges(orderLines);
      const finalOrderItems = orderLines.map(line => ({
        product: String(line.productId),
        productId: line.productId,
        name: line.productName,
        productName: line.productName,
        image: line.image || 'https://via.placeholder.com/150',
        price: line.price,
        quantity: line.quantity,
        size: line.size,
        stockDeducted: true
      }));
      const computedItemsPrice = finalOrderItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const finalShipping = computedItemsPrice > 1999 ? 0 : requestedShipping;
      const finalDiscount = Math.min(requestedDiscount, computedItemsPrice);

      return {
        stockChanges,
        orderData: {
          orderNumber,
          user: effectiveUserId,
          guestEmail: customerEmail,
          customerName,
          phone,
          orderItems: finalOrderItems,
          shippingAddress,
          paymentMethod: normalizedPaymentMethod,
          paymentStatus: normalizedPaymentMethod === 'COD' ? 'Pending' : 'Completed',
          itemsPrice: computedItemsPrice,
          shippingPrice: finalShipping,
          discountAmount: finalDiscount,
          totalPrice: Math.max(0, computedItemsPrice + finalShipping - finalDiscount),
          orderStatus: 'Order Placed',
          statusHistory: [
            {
              status: 'Order Placed',
              updatedAt: new Date(),
              updatedBy: effectiveUserId,
              updatedByName: customerName || 'Customer',
              note: 'Order successfully placed via ' + normalizedPaymentMethod
            }
          ],
          inventoryStatus: 'Deducted',
          inventoryDeductedAt: new Date(),
          trackingNumber: `TRK-${Date.now().toString().slice(-8)}`
        }
      };
    };

    const createOrderWithSession = async session => {
      const { orderData, stockChanges } = await buildOrderData(session);
      await changeProductStock(Product, stockChanges, 'deduct', session);
      const [order] = await Order.create([orderData], { session });
      return order;
    };
    const createOrderWithRollback = async () => {
      const { orderData, stockChanges } = await buildOrderData(null);
      await changeProductStock(Product, stockChanges, 'deduct');
      try {
        const [order] = await Order.create([orderData]);
        return order;
      } catch (error) {
        await changeProductStock(Product, stockChanges, 'restore');
        throw error;
      }
    };

    const order = await runWithInventoryTransaction(
      mongoose.connection,
      createOrderWithSession,
      createOrderWithRollback
    );
    return res.status(201).json(order);
  } catch (error) {
    console.error('[CreateOrder Error]', error);
    return res.status(error.status || 500).json({ message: error.message || 'Error creating order' });
  }
};

// Helper: Enrich order items with current product image if missing/placeholder
const enrichOrderImages = async (orderDoc) => {
  if (!orderDoc || !Array.isArray(orderDoc.orderItems) || orderDoc.orderItems.length === 0) {
    return orderDoc;
  }
  const plainOrder = orderDoc.toObject ? orderDoc.toObject() : { ...orderDoc };
  const itemsNeedingImages = plainOrder.orderItems.filter(item =>
    !item.image || item.image.includes('placeholder') || item.image.trim() === ''
  );

  if (itemsNeedingImages.length > 0 && Product.db?.readyState === 1) {
    try {
      const prodIds = itemsNeedingImages.map(item => item.productId || item.product).filter(Boolean);
      const prods = await Product.find({ _id: { $in: prodIds } }).lean();
      const prodMap = new Map(prods.map(p => [String(p._id), p]));

      plainOrder.orderItems = plainOrder.orderItems.map(item => {
        if (!item.image || item.image.includes('placeholder') || item.image.trim() === '') {
          const prod = prodMap.get(String(item.productId || item.product));
          if (prod && prod.image) {
            return { ...item, image: prod.image };
          }
        }
        return item;
      });
    } catch (e) {
      console.warn('[enrichOrderImages Error]:', e.message);
    }
  }
  return plainOrder;
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
      if (order) {
        const enriched = await enrichOrderImages(order);
        return res.json(enriched);
      }
    }

    const orders = getLocalOrders();
    const order = orders.find(o => o._id === id || o.orderNumber === id);
    if (order) {
      const enriched = await enrichOrderImages(order);
      return res.json(enriched);
    }

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
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : '';

    if (Order.db?.readyState === 1) {
      // Find orders matching user ID or customer email for resilient synchronization
      const query = {
        $or: [
          { user: userId },
          ...(userEmail ? [{ guestEmail: userEmail }] : [])
        ]
      };
      const orders = await Order.find(query).sort({ createdAt: -1 });
      const enrichedOrders = await Promise.all(orders.map(o => enrichOrderImages(o)));
      return res.json(enrichedOrders);
    }

    const orders = getLocalOrders();
    const myOrders = orders.filter(o => o.user === userId || (userEmail && o.guestEmail?.toLowerCase() === userEmail));
    const enrichedOrders = await Promise.all(myOrders.map(o => enrichOrderImages(o)));
    res.json(enrichedOrders);
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
      if (order) {
        const enriched = await enrichOrderImages(order);
        return res.json(enriched);
      }
    }

    const orders = getLocalOrders();
    const order = orders.find(
      o =>
        o.orderNumber?.toUpperCase() === cleanOrderNumber &&
        (!phone || o.phone?.includes(phone.slice(-8)))
    );

    if (order) {
      const enriched = await enrichOrderImages(order);
      return res.json(enriched);
    }

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
      const enriched = await Promise.all(orders.map(o => enrichOrderImages(o)));
      return res.json(enriched);
    }
    const orders = getLocalOrders();
    const enriched = await Promise.all(orders.map(o => enrichOrderImages(o)));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper: Shared cancellation processor
const processOrderCancellation = async (orderId, { cancelledBy, reason, adminUser, trackingNumber }) => {
  const cancellationStockChanges = order => {
    const changes = new Map();
    const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
    if (orderItems.length === 0 || orderItems.some(item => item.stockDeducted !== true)) {
      throw createHttpError('Order inventory tracking is incomplete; stock was not restored.', 409);
    }
    for (const item of orderItems) {
      if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
        throw createHttpError('Order inventory tracking is incomplete; stock was not restored.', 409);
      }
      const key = String(item.productId);
      const change = changes.get(key) || {
        productId: item.productId,
        productName: item.productName || item.name,
        quantity: 0
      };
      change.quantity += item.quantity;
      changes.set(key, change);
    }
    return [...changes.values()];
  };

  const ensureCancellable = order => {
    if (order.orderStatus === 'Cancelled' && order.inventoryStatus === 'Restoring') {
      throw createHttpError('Inventory restoration is already in progress for this order.', 409);
    }
    if (order.orderStatus === 'Cancelled') return;
    if (!['Order Placed', 'Confirmed', 'Processing'].includes(order.orderStatus)) {
      throw createHttpError('This order can no longer be cancelled as it has already been dispatched or delivered.', 409);
    }
    if (order.inventoryStatus === 'Restoring') {
      throw createHttpError('Inventory restoration is already in progress for this order.', 409);
    }
  };

  const cancelWithSession = async session => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw createHttpError('Order not found', 404);
    ensureCancellable(order);
    if (order.orderStatus === 'Cancelled') return order;

    if (order.inventoryStatus === 'Deducted') {
      await changeProductStock(Product, cancellationStockChanges(order), 'restore', session);
      order.inventoryStatus = 'Restored';
      order.inventoryRestoredAt = new Date();
    }
    order.orderStatus = 'Cancelled';
    order.cancelledBy = cancelledBy || 'customer';
    order.cancellationReason = reason || '';
    order.cancelledAt = new Date();
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: 'Cancelled',
      updatedAt: new Date(),
      updatedBy: adminUser?._id || adminUser?.id || null,
      updatedByName: adminUser?.name || (cancelledBy === 'admin' ? 'Admin' : 'Customer'),
      note: reason ? `Cancelled (${cancelledBy}): ${reason}` : `Cancelled by ${cancelledBy}`
    });
    if (trackingNumber) order.trackingNumber = trackingNumber;
    return order.save({ session });
  };

  const cancelWithRollback = async () => {
    const order = await Order.findById(orderId);
    if (!order) throw createHttpError('Order not found', 404);
    ensureCancellable(order);
    if (order.orderStatus === 'Cancelled') return order;

    const priorStatus = order.orderStatus;
    const historyEntry = {
      status: 'Cancelled',
      updatedAt: new Date(),
      updatedBy: adminUser?._id || adminUser?.id || null,
      updatedByName: adminUser?.name || (cancelledBy === 'admin' ? 'Admin' : 'Customer'),
      note: reason ? `Cancelled (${cancelledBy}): ${reason}` : `Cancelled by ${cancelledBy}`
    };

    if (order.inventoryStatus !== 'Deducted') {
      const inventoryFilter = order.inventoryStatus === 'Not Deducted'
        ? { $or: [{ inventoryStatus: 'Not Deducted' }, { inventoryStatus: { $exists: false } }] }
        : { inventoryStatus: order.inventoryStatus };
      const updated = await Order.findOneAndUpdate({
        _id: order._id,
        orderStatus: priorStatus,
        ...inventoryFilter
      }, {
        $set: {
          orderStatus: 'Cancelled',
          cancelledBy: cancelledBy || 'customer',
          cancellationReason: reason || '',
          cancelledAt: new Date(),
          ...(trackingNumber ? { trackingNumber } : {})
        },
        $push: { statusHistory: historyEntry }
      }, { new: true, runValidators: true });
      if (!updated) throw createHttpError('Order status changed; refresh and try again.', 409);
      return updated;
    }

    const stockChanges = cancellationStockChanges(order);
    const claimed = await Order.findOneAndUpdate({
      _id: order._id,
      orderStatus: priorStatus,
      inventoryStatus: 'Deducted'
    }, {
      $set: {
        orderStatus: 'Cancelled',
        cancelledBy: cancelledBy || 'customer',
        cancellationReason: reason || '',
        cancelledAt: new Date(),
        inventoryStatus: 'Restoring',
        inventoryRestoredAt: new Date(),
        ...(trackingNumber ? { trackingNumber } : {})
      },
      $push: { statusHistory: historyEntry }
    }, { new: true });

    if (!claimed) {
      const current = await Order.findById(order._id);
      if (current?.orderStatus === 'Cancelled' && current.inventoryStatus === 'Restored') return current;
      throw createHttpError('Order cancellation is already being processed; refresh and try again.', 409);
    }

    try {
      await changeProductStock(Product, stockChanges, 'restore');
    } catch (error) {
      if (!error.message.startsWith('Inventory update failed and rollback was incomplete')) {
        await Order.updateOne({
          _id: order._id,
          inventoryStatus: 'Restoring'
        }, {
          $set: {
            orderStatus: priorStatus,
            inventoryStatus: 'Deducted',
            inventoryRestoredAt: null
          },
          $pull: { statusHistory: { status: 'Cancelled' } }
        });
      }
      throw error;
    }

    const restored = await Order.findOneAndUpdate({
      _id: order._id,
      inventoryStatus: 'Restoring'
    }, {
      $set: { inventoryStatus: 'Restored' }
    }, { new: true, runValidators: true });
    if (!restored) {
      throw createHttpError('Stock was restored but order inventory status could not be finalized.', 500);
    }
    return restored;
  };

  return runWithInventoryTransaction(
    mongoose.connection,
    cancelWithSession,
    cancelWithRollback
  );
};

// @desc    Cancel order (Customer)
// @route   PUT /api/orders/:id/cancel
export const cancelMyOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email ? req.user.email.toLowerCase().trim() : '';

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Verify ownership
    const isOwner =
      (order.user && String(order.user) === String(userId)) ||
      (userEmail && order.guestEmail?.toLowerCase() === userEmail);
    if (!isOwner) {
      return res.status(403).json({ message: 'Not authorized to cancel this order' });
    }

    const cancelledOrder = await processOrderCancellation(id, {
      cancelledBy: 'customer',
      reason: String(reason).trim(),
      adminUser: null
    });

    return res.json(cancelledOrder);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Error cancelling order' });
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, trackingNumber, note = '', paymentStatus } = req.body;
    if (Order.db?.readyState !== 1 || Product.db?.readyState !== 1) {
      return res.status(503).json({ message: 'Order and inventory databases are unavailable' });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const validStatuses = ['Order Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (orderStatus && !validStatuses.includes(orderStatus)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Handle cancellation transition
    if (orderStatus === 'Cancelled') {
      const cancelledOrder = await processOrderCancellation(id, {
        cancelledBy: 'admin',
        reason: note || 'Cancelled by admin',
        adminUser: req.user,
        trackingNumber
      });
      return res.json(cancelledOrder);
    }

    // Disallow reopening cancelled order
    if (order.orderStatus === 'Cancelled' && orderStatus && orderStatus !== 'Cancelled') {
      return res.status(409).json({ message: 'A cancelled order cannot be reopened.' });
    }

    // Disallow moving Delivered order backward to Processing or earlier
    if (order.orderStatus === 'Delivered' && orderStatus && orderStatus !== 'Delivered') {
      return res.status(409).json({ message: 'A delivered order cannot be moved backward.' });
    }

    // Status transition validation order:
    // Order Placed -> Confirmed -> Processing -> Shipped -> Out for Delivery -> Delivered
    const statusSequence = ['Order Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    const currentIdx = statusSequence.indexOf(order.orderStatus);
    const nextIdx = statusSequence.indexOf(orderStatus);

    if (orderStatus && orderStatus !== order.orderStatus) {
      // Disallow skipping more than necessary backward steps
      if (currentIdx !== -1 && nextIdx !== -1 && nextIdx < currentIdx) {
        return res.status(400).json({ message: `Cannot move status backwards from ${order.orderStatus} to ${orderStatus}.` });
      }

      order.orderStatus = orderStatus;

      // Update status history
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({
        status: orderStatus,
        updatedAt: new Date(),
        updatedBy: req.user?.id || req.user?._id || null,
        updatedByName: req.user?.name || 'Administrator',
        note: note ? String(note).trim() : `Status updated to ${orderStatus}`
      });
    }

    // Tracking number update
    if (trackingNumber) order.trackingNumber = trackingNumber.trim();

    // Payment status update: if explicitly provided or if COD confirmed as Delivered with collection
    if (paymentStatus && ['Pending', 'Completed', 'Failed', 'Paid'].includes(paymentStatus)) {
      order.paymentStatus = paymentStatus;
    }

    const savedOrder = await order.save();
    return res.json(savedOrder);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Error updating order status' });
  }
};
