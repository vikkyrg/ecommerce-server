import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  size: { type: String, default: '' },
  weight: { type: String, default: '' },
  color: { type: String, default: '' },
  unit: { type: String, default: '' },
  modelNumber: { type: String, default: '' },
  price: { type: Number, default: null },
  mrp: { type: Number, default: null },
  stock: { type: Number, default: null },
  sku: { type: String, default: '' }
}, { _id: false });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    brand: { type: String, trim: true, default: '' },
    brandRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    category: { type: String, required: true, trim: true }, // category slug or name
    categoryRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    subcategory: { type: String, default: '' },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    applications: { type: String, default: '' },
    features: [{ type: String }],
    sku: { type: String, uppercase: true, trim: true, default: '' },
    price: { type: Number, min: 0, default: null },
    originalPrice: { type: Number, min: 0, default: null },
    discountPrice: { type: Number, min: 0, default: null },
    discountPercentage: { type: Number, min: 0, max: 100, default: null },
    mrp: { type: Number, min: 0, default: null },
    discount: { type: Number, default: 0 },
    stock: { type: Number, min: 0, validate: Number.isInteger, default: 50 },
    size: { type: String, default: '' },
    weight: { type: String, default: '' },
    unit: { type: String, default: '' },
    image: { type: String, default: '' },
    imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'images.files', default: null },
    productImages: [{ type: String }],
    variants: [variantSchema],
    specifications: { type: Map, of: String, default: {} },
    rating: { type: Number, default: null },
    reviewsCount: { type: Number, default: null },
    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    inStock: { type: Boolean, default: null },
    isActive: { type: Boolean, default: true },
    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
    notes: { type: String, default: '' },
    sourceCell: { type: String, default: '' },
    importWarnings: [{ type: String }]
  },
  { timestamps: true }
);

// Indexes for fast searching & filtering
productSchema.index({ name: 'text', brand: 'text', category: 'text' });
productSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $type: 'string', $gt: '' } } }
);
productSchema.index({ categoryRef: 1, brandRef: 1 });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export default Product;
