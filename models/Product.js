import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    mrp: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    size: { type: String, default: 'Standard' },
    unit: { type: String, default: 'Piece' },
    rating: { type: Number, default: 4.8 },
    reviewsCount: { type: Number, default: 0 },
    image: { type: String, required: true }, // Base64 data URL or image URL
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    inStock: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    badge: { type: String },
    specifications: { type: Map, of: String }
  },
  { timestamps: true }
);

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;
