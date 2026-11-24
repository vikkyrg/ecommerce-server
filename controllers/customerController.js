import User from '../models/User.js';
import Enquiry from '../models/Enquiry.js';
import Order from '../models/Order.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '../data/users.json');

const getLocalUsers = () => {
  try {
    if (fs.existsSync(usersFilePath)) {
      return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

/**
 * @desc    Get all registered customer accounts (excluding admin accounts)
 * @route   GET /api/admin/customers
 * @access  Private/Admin
 */
export const getAdminCustomers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10, startDate, endDate, dateFilter, status = 'All' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    // Calculate start of current month for New Registrations This Month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (User.db?.readyState === 1) {
      // STRICT FILTER: Only role === 'customer', never return admins
      const query = { role: 'customer' };

      if (search) {
        const cleanSearch = search.trim();
        const regex = new RegExp(cleanSearch, 'i');
        const orConditions = [
          { name: regex },
          { email: regex },
          { phone: regex }
        ];

        // Support matching by ObjectId if hex string
        if (/^[0-9a-fA-F]{24}$/.test(cleanSearch)) {
          orConditions.push({ _id: cleanSearch });
        }

        query.$or = orConditions;
      }

      // Quick Date filter presets
      if (dateFilter) {
        const d = new Date();
        if (dateFilter === 'today') {
          d.setHours(0, 0, 0, 0);
          query.createdAt = { $gte: d };
        } else if (dateFilter === 'this_week') {
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          d.setDate(diff);
          d.setHours(0, 0, 0, 0);
          query.createdAt = { $gte: d };
        } else if (dateFilter === 'this_month') {
          query.createdAt = { $gte: startOfMonth };
        }
      } else if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const total = await User.countDocuments(query);
      const totalAllCustomers = await User.countDocuments({ role: 'customer' });
      const newThisMonth = await User.countDocuments({
        role: 'customer',
        createdAt: { $gte: startOfMonth }
      });

      const customers = await User.find(query)
        .select('-password') // Never expose password hash
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean();

      // Enrich with enquiry counts and order counts
      const enriched = await Promise.all(
        customers.map(async c => {
          const [enquiriesCount, ordersCount] = await Promise.all([
            Enquiry.countDocuments({
              $or: [{ customerId: c._id }, { email: c.email.toLowerCase().trim() }]
            }),
            Order.countDocuments({
              $or: [{ user: c._id }, { 'customer.email': c.email.toLowerCase().trim() }]
            })
          ]);
          return {
            ...c,
            status: 'Active',
            enquiryCount: enquiriesCount || 0,
            orderCount: ordersCount || 0
          };
        })
      );

      return res.json({
        success: true,
        data: enriched,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize) || 1
        },
        counts: {
          totalCustomers: totalAllCustomers,
          activeCustomers: totalAllCustomers,
          newThisMonth: newThisMonth
        }
      });
    }

    // Local JSON fallback
    let list = getLocalUsers().filter(u => u.role === 'customer');
    const totalAll = list.length;
    const newThisMonthLocal = list.filter(u => u.createdAt && new Date(u.createdAt) >= startOfMonth).length;

    if (search) {
      const s = search.toLowerCase().trim();
      list = list.filter(
        u =>
          u.name?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.phone?.includes(s) ||
          u._id?.toLowerCase().includes(s)
      );
    }

    if (dateFilter) {
      if (dateFilter === 'this_month') {
        list = list.filter(u => u.createdAt && new Date(u.createdAt) >= startOfMonth);
      }
    }

    const total = list.length;
    const paginated = list
      .slice((pageNum - 1) * pageSize, pageNum * pageSize)
      .map(({ password, ...safeUser }) => ({
        ...safeUser,
        status: 'Active',
        enquiryCount: 0,
        orderCount: 0
      }));

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
        totalCustomers: totalAll,
        activeCustomers: totalAll,
        newThisMonth: newThisMonthLocal
      }
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch registered customers'
    });
  }
};

/**
 * @desc    Get detailed customer profile with enquiry and order history
 * @route   GET /api/admin/customers/:id
 * @access  Private/Admin
 */
export const getAdminCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (User.db?.readyState === 1) {
      const customer = await User.findOne({ _id: id, role: 'customer' })
        .select('-password')
        .lean();

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer account not found or is not a registered customer.'
        });
      }

      // Fetch customer's enquiries
      const enquiries = await Enquiry.find({
        $or: [{ customerId: customer._id }, { email: customer.email.toLowerCase().trim() }]
      }).sort({ createdAt: -1 });

      // Fetch customer's order history
      const orders = await Order.find({
        $or: [{ user: customer._id }, { 'customer.email': customer.email.toLowerCase().trim() }]
      }).sort({ createdAt: -1 });

      return res.json({
        success: true,
        data: {
          ...customer,
          status: 'Active',
          enquiries,
          orders
        }
      });
    }

    const localUsers = getLocalUsers();
    const customer = localUsers.find(u => u._id === id && u.role === 'customer');
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found'
      });
    }

    const { password, ...safeUser } = customer;
    return res.json({
      success: true,
      data: {
        ...safeUser,
        status: 'Active',
        enquiries: [],
        orders: []
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
