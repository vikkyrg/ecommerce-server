import mongoose from 'mongoose';

const enquirySchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null
    },
    productName: {
      type: String,
      trim: true,
      default: ''
    },
    productImage: {
      type: String,
      default: ''
    },
    subject: {
      type: String,
      trim: true,
      default: 'Product Enquiry'
    },
    message: {
      type: String,
      required: [true, 'Enquiry message is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'In Progress', 'Resolved'],
      default: 'New'
    },
    adminNotes: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

enquirySchema.index({ email: 1, createdAt: -1 });
enquirySchema.index({ status: 1 });
enquirySchema.index({ customerId: 1 });

const Enquiry = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);
export default Enquiry;
