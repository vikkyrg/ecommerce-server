import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo: { type: String, default: '' },
    description: { type: String, default: '' },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    isActive: { type: Boolean, default: true },
    supplierNotes: [{ type: String, trim: true }]
  },
  { timestamps: true }
);

brandSchema.index({ categories: 1 });

const Brand = mongoose.models.Brand || mongoose.model('Brand', brandSchema);
export default Brand;
