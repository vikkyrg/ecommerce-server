import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  product: { type: String, required: true }, // product ID or sku
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: { type: String, required: true },
  productName: { type: String },
  image: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  size: { type: String },
  stockDeducted: { type: Boolean, default: false }
});

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['Order Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
    required: true
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: 'System' },
  note: { type: String, default: '' }
}, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    guestEmail: { type: String },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    orderItems: [orderItemSchema],
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      house: { type: String, required: true },
      street: { type: String, required: true },
      area: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      landmark: { type: String },
      addressType: { type: String, default: 'Home' }
    },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Card', 'NetBanking', 'COD'],
      default: 'UPI'
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed', 'Paid'],
      default: 'Pending'
    },
    itemsPrice: { type: Number, required: true },
    taxPrice: { type: Number, default: 0 },
    shippingPrice: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    orderStatus: {
      type: String,
      enum: ['Order Placed', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Order Placed'
    },
    statusHistory: [statusHistorySchema],
    cancellationReason: { type: String },
    cancelledBy: { type: String }, // 'customer' | 'admin' | 'system'
    cancelledAt: { type: Date },
    adminNotes: { type: String },
    inventoryStatus: {
      type: String,
      enum: ['Not Deducted', 'Deducted', 'Restoring', 'Restored'],
      default: 'Not Deducted'
    },
    inventoryDeductedAt: { type: Date },
    inventoryRestoredAt: { type: Date },
    trackingNumber: { type: String }
  },
  { timestamps: true }
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export default Order;
