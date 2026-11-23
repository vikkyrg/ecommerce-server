import mongoose from 'mongoose';
import { hashPassword, comparePassword } from '../utils/tokenUtil.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    addresses: [
      {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        house: { type: String, required: true },
        street: { type: String, required: true },
        area: { type: String },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        landmark: { type: String },
        addressType: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
        isDefault: { type: Boolean, default: false }
      }
    ],
    wishlist: [{ type: String }]
  },
  { timestamps: true }
);

// Encrypt password before saving
userSchema.pre('save', function (next) {
  if (!this.isModified('password')) return next();
  this.password = hashPassword(this.password);
  next();
});

// Match password method
userSchema.methods.matchPassword = function (enteredPassword) {
  return comparePassword(enteredPassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
