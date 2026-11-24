import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';
import { generateToken } from '../middleware/authMiddleware.js';
import { hashPassword, comparePassword } from '../utils/tokenUtil.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../data/users.json');

// Helper for local mock user storage if MongoDB is offline
const getLocalUsers = () => {
  try {
    if (fs.existsSync(usersFilePath)) {
      return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const saveLocalUsers = users => {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {}
};

// Seed default admin if needed (local fallback and MongoDB)
export const seedAdmin = async () => {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@nsstonechemicals.com').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // 1. Seed into MongoDB if connected
    if (User.db?.readyState === 1) {
      const existing = await User.findOne({ email: adminEmail });
      if (!existing) {
        await User.create({
          name: 'NS Admin',
          email: adminEmail,
          phone: '+91 97388 93424',
          password: adminPassword, // will be hashed by pre('save') hook
          role: 'admin',
          addresses: [],
          wishlist: []
        });
        console.log(`[Auth] Default admin (${adminEmail}) seeded in MongoDB.`);
      } else if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
      }
    }

    // 2. Seed into local JSON fallback
    const users = getLocalUsers();
    if (!users.find(u => u.email === adminEmail)) {
      users.push({
        _id: 'admin-1',
        name: 'NS Admin',
        email: adminEmail,
        phone: '+91 97388 93424',
        password: hashPassword(adminPassword),
        role: 'admin',
        addresses: [],
        wishlist: []
      });
      saveLocalUsers(users);
    }
  } catch (err) {
    console.warn('[Auth] Admin seeding warning:', err.message);
  }
};

// @desc    Register new customer
// @route   POST /api/auth/register
export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Try MongoDB
    if (User.db?.readyState === 1) {
      const userExists = await User.findOne({ email: normalizedEmail });
      if (userExists) {
        return res.status(400).json({ message: 'User already exists with this email address' });
      }

      const user = await User.create({
        name,
        email: normalizedEmail,
        phone,
        password
      });

      return res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses || [],
        token: generateToken(user._id, user.role)
      });
    }

    // Local in-memory fallback
    const localUsers = getLocalUsers();
    if (localUsers.find(u => u.email === normalizedEmail)) {
      return res.status(400).json({ message: 'User already exists with this email address' });
    }

    const newUser = {
      _id: `user-${Date.now()}`,
      name,
      email: normalizedEmail,
      phone,
      password: hashPassword(password),
      role: 'customer',
      addresses: [],
      wishlist: []
    };

    localUsers.push(newUser);
    saveLocalUsers(localUsers);

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      addresses: [],
      token: generateToken(newUser._id, newUser.role)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error during registration' });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // MongoDB check
    if (User.db?.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail });
      if (user && (await user.matchPassword(password))) {
        return res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          addresses: user.addresses || [],
          wishlist: user.wishlist || [],
          token: generateToken(user._id, user.role)
        });
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Local fallback check
    const localUsers = getLocalUsers();
    const user = localUsers.find(u => u.email === normalizedEmail);

    if (user && comparePassword(password, user.password)) {
      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        addresses: user.addresses || [],
        wishlist: user.wishlist || [],
        token: generateToken(user._id, user.role)
      });
    }

    return res.status(401).json({ message: 'Invalid email or password' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error during login' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
export const getUserProfile = async (req, res) => {
  try {
    if (User.db?.readyState === 1) {
      const user = await User.findById(req.user.id).select('-password');
      if (user) return res.json(user);
    }

    const localUsers = getLocalUsers();
    const user = localUsers.find(u => u._id === req.user.id);
    if (user) {
      const { password, ...userData } = user;
      return res.json(userData);
    }

    res.status(404).json({ message: 'User not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile & addresses
// @route   PUT /api/auth/profile
export const updateUserProfile = async (req, res) => {
  try {
    const { name, phone, addresses, wishlist } = req.body;

    if (User.db?.readyState === 1) {
      const user = await User.findById(req.user.id);
      if (user) {
        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (addresses) user.addresses = addresses;
        if (wishlist) user.wishlist = wishlist;
        const updated = await user.save();
        return res.json({
          _id: updated._id,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          role: updated.role,
          addresses: updated.addresses,
          wishlist: updated.wishlist
        });
      }
    }

    const localUsers = getLocalUsers();
    const idx = localUsers.findIndex(u => u._id === req.user.id);
    if (idx !== -1) {
      if (name) localUsers[idx].name = name;
      if (phone) localUsers[idx].phone = phone;
      if (addresses) localUsers[idx].addresses = addresses;
      if (wishlist) localUsers[idx].wishlist = wishlist;
      saveLocalUsers(localUsers);

      const { password, ...userData } = localUsers[idx];
      return res.json(userData);
    }

    res.status(404).json({ message: 'User not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
