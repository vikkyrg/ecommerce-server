import Enquiry from '../models/Enquiry.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localEnquiriesPath = path.join(__dirname, '../data/enquiries.json');

// Helper to read local json backup if DB is offline
const getLocalEnquiries = () => {
  try {
    if (fs.existsSync(localEnquiriesPath)) {
      return JSON.parse(fs.readFileSync(localEnquiriesPath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const saveLocalEnquiries = data => {
  try {
    fs.writeFileSync(localEnquiriesPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
};

/**
 * @desc    Submit a new enquiry (Public or Authenticated)
 * @route   POST /api/enquiries
 * @access  Public / User
 */
export const submitEnquiry = async (req, res) => {
  try {
    const { name, customerName, email, phone, productId, productName, productImage, subject, message } = req.body;
    const finalName = (customerName || name || '').trim();
    const finalEmail = (email || '').toLowerCase().trim();
    const finalPhone = (phone || '').trim();
    const finalMessage = (message || '').trim();

    if (!finalName || !finalEmail || !finalPhone || !finalMessage) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone number, and enquiry message are required.'
      });
    }

    let customerId = req.user?.id || req.user?._id || null;
    let resolvedProductName = (productName || '').trim();
    let resolvedProductImage = (productImage || '').trim();

    // Check if user is registered by email if not already authenticated
    if (!customerId && User.db?.readyState === 1) {
      const existingUser = await User.findOne({ email: finalEmail, role: 'customer' });
      if (existingUser) {
        customerId = existingUser._id;
      }
    }

    // Resolve product info if productId provided
    if (productId && (!resolvedProductName || !resolvedProductImage) && Product.db?.readyState === 1) {
      try {
        const prod = await Product.findById(productId);
        if (prod) {
          if (!resolvedProductName) resolvedProductName = prod.name;
          if (!resolvedProductImage) resolvedProductImage = prod.image || '';
        }
      } catch (err) {}
    }

    if (Enquiry.db?.readyState === 1) {
      const enquiry = await Enquiry.create({
        customerId,
        customerName: finalName,
        email: finalEmail,
        phone: finalPhone,
        productId: productId || null,
        productName: resolvedProductName,
        productImage: resolvedProductImage,
        subject: subject || (resolvedProductName ? `Enquiry: ${resolvedProductName}` : 'General Inquiry'),
        message: finalMessage,
        status: 'New'
      });

      return res.status(201).json({
        success: true,
        message: 'Your enquiry has been received. Our stone chemical specialists will reach out promptly.',
        data: enquiry
      });
    }

    // Fallback if Mongo is offline
    const local = getLocalEnquiries();
    const newEnquiry = {
      _id: `enq-${Date.now()}`,
      customerId,
      customerName: finalName,
      email: finalEmail,
      phone: finalPhone,
      productId: productId || null,
      productName: resolvedProductName,
      productImage: resolvedProductImage,
      subject: subject || (resolvedProductName ? `Enquiry: ${resolvedProductName}` : 'General Inquiry'),
      message: finalMessage,
      status: 'New',
      adminNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    local.unshift(newEnquiry);
    saveLocalEnquiries(local);

    return res.status(201).json({
      success: true,
      message: 'Your enquiry has been received. Our stone chemical specialists will reach out promptly.',
      data: newEnquiry
    });
  } catch (error) {
    console.error('Error submitting enquiry:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit enquiry'
    });
  }
};

/**
 * @desc    Get all enquiries with search, filter, and pagination
 * @route   GET /api/admin/enquiries
 * @access  Private/Admin
 */
export const getAdminEnquiries = async (req, res) => {
  try {
    const { search = '', status = 'All', page = 1, limit = 10, startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    if (Enquiry.db?.readyState === 1) {
      const query = {};

      if (status && status !== 'All') {
        query.status = status;
      }

      if (search) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
          { customerName: regex },
          { email: regex },
          { phone: regex },
          { productName: regex },
          { subject: regex }
        ];
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const total = await Enquiry.countDocuments(query);
      const enquiries = await Enquiry.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .populate('customerId', 'name email phone createdAt');

      const newCount = await Enquiry.countDocuments({ status: 'New' });
      const inProgressCount = await Enquiry.countDocuments({ status: { $in: ['Contacted', 'In Progress'] } });
      const resolvedCount = await Enquiry.countDocuments({ status: 'Resolved' });

      return res.json({
        success: true,
        data: enquiries,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize) || 1
        },
        counts: {
          total: await Enquiry.countDocuments(),
          new: newCount,
          inProgress: inProgressCount,
          resolved: resolvedCount
        }
      });
    }

    // Local fallback
    let list = getLocalEnquiries();
    if (status && status !== 'All') list = list.filter(e => e.status === status);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        e =>
          e.customerName?.toLowerCase().includes(s) ||
          e.email?.toLowerCase().includes(s) ||
          e.phone?.includes(s) ||
          e.productName?.toLowerCase().includes(s)
      );
    }
    const total = list.length;
    const paginated = list.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return res.json({
      success: true,
      data: paginated,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize) || 1
      },
      counts: {
        total,
        new: list.filter(e => e.status === 'New').length,
        inProgress: list.filter(e => ['Contacted', 'In Progress'].includes(e.status)).length,
        resolved: list.filter(e => e.status === 'Resolved').length
      }
    });
  } catch (error) {
    console.error('Error fetching admin enquiries:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch enquiries'
    });
  }
};

/**
 * @desc    Get single enquiry by ID
 * @route   GET /api/admin/enquiries/:id
 * @access  Private/Admin
 */
export const getAdminEnquiryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (Enquiry.db?.readyState === 1) {
      const enquiry = await Enquiry.findById(id).populate('customerId', 'name email phone createdAt addresses');
      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry record not found' });
      }
      return res.json({ success: true, data: enquiry });
    }

    const local = getLocalEnquiries();
    const item = local.find(e => e._id === id);
    if (!item) return res.status(404).json({ success: false, message: 'Enquiry record not found' });
    return res.json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update enquiry status
 * @route   PATCH /api/admin/enquiries/:id/status
 * @access  Private/Admin
 */
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['New', 'Contacted', 'In Progress', 'Resolved'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    if (Enquiry.db?.readyState === 1) {
      const enquiry = await Enquiry.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      ).populate('customerId', 'name email phone');

      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry not found' });
      }
      return res.json({ success: true, message: 'Status updated successfully', data: enquiry });
    }

    const local = getLocalEnquiries();
    const idx = local.findIndex(e => e._id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Enquiry not found' });
    local[idx].status = status;
    local[idx].updatedAt = new Date().toISOString();
    saveLocalEnquiries(local);
    return res.json({ success: true, message: 'Status updated successfully', data: local[idx] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update admin notes on an enquiry
 * @route   PATCH /api/admin/enquiries/:id/notes
 * @access  Private/Admin
 */
export const updateEnquiryNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (Enquiry.db?.readyState === 1) {
      const enquiry = await Enquiry.findByIdAndUpdate(
        id,
        { adminNotes: adminNotes || '' },
        { new: true }
      );
      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry not found' });
      }
      return res.json({ success: true, message: 'Notes saved', data: enquiry });
    }

    const local = getLocalEnquiries();
    const idx = local.findIndex(e => e._id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Enquiry not found' });
    local[idx].adminNotes = adminNotes || '';
    local[idx].updatedAt = new Date().toISOString();
    saveLocalEnquiries(local);
    return res.json({ success: true, message: 'Notes saved', data: local[idx] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete an enquiry
 * @route   DELETE /api/admin/enquiries/:id
 * @access  Private/Admin
 */
export const deleteEnquiry = async (req, res) => {
  try {
    const { id } = req.params;

    if (Enquiry.db?.readyState === 1) {
      const enquiry = await Enquiry.findByIdAndDelete(id);
      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry not found' });
      }
      return res.json({ success: true, message: 'Enquiry deleted successfully' });
    }

    const local = getLocalEnquiries();
    const filtered = local.filter(e => e._id !== id);
    saveLocalEnquiries(filtered);
    return res.json({ success: true, message: 'Enquiry deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
