import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  size: { type: String, default: '' },
  weight: { type: String, default: '' },
  color: { type: String, default: '' },
  unit: { type: String, default: 'Piece' },
  modelNumber: { type: String, default: '' },
  price: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  sku: { type: String, default: '' }
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    brand: { type: String, required: true, trim: true },
    brandRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    category: { type: String, required: true, trim: true }, // category slug or name
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    subcategory: { type: String, default: '' },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    sku: { type: String, required: true, uppercase: true, trim: true },
    price: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    stock: { type: Number, default: 100 },
    size: { type: String, default: 'Standard' },
    weight: { type: String, default: '' },
    unit: { type: String, default: 'Piece' },
    image: { type: String, default: '' },
    productImages: [{ type: String }],
    variants: [variantSchema],
    specifications: { type: Map, of: String, default: {} },
    rating: { type: Number, default: 4.8 },
    reviewsCount: { type: Number, default: 12 },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    inStock: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

// Indexes for fast searching & filtering
productSchema.index({ name: 'text', brand: 'text', category: 'text' });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;
