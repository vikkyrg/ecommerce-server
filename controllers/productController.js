import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsFilePath = path.join(__dirname, '../data/products.json');

const getLocalProducts = () => {
  try {
    return JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));
  } catch (e) {
    return [];
  }
};

const saveLocalProducts = prods => {
  try {
    fs.writeFileSync(productsFilePath, JSON.stringify(prods, null, 2), 'utf8');
  } catch (e) {}
};

// @desc    Get all products with search, filter, sort & pagination
// @route   GET /api/products
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      sort,
      page = 1,
      limit = 40
    } = req.query;

    let items = getLocalProducts();

    // Try MongoDB if connected
    if (Product.db?.readyState === 1) {
      try {
        const query = {};
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } },
            { category: { $regex: search, $options: 'i' } }
          ];
        }
        if (category && category !== 'All Categories' && category !== 'All Products' && category !== 'all') {
          query.category = { $regex: category, $options: 'i' };
        }
        if (brand && brand !== 'All Brands' && brand !== 'all') {
          query.brand = { $regex: brand, $options: 'i' };
        }
        if (inStock === 'true') {
          query.inStock = true;
        }
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = Number(minPrice);
          if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        let sortOption = {};
        if (sort === 'price-asc' || sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-desc' || sort === 'price-high') sortOption = { price: -1 };
        else if (sort === 'newest') sortOption = { createdAt: -1 };
        else if (sort === 'name') sortOption = { name: 1 };
        else sortOption = { isFeatured: -1, rating: -1 };

        const total = await Product.countDocuments(query);
        const dbProducts = await Product.find(query)
          .sort(sortOption)
          .skip((Number(page) - 1) * Number(limit))
          .limit(Number(limit));

        if (dbProducts && dbProducts.length > 0) {
          return res.json({
            products: dbProducts,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit))
          });
        }
      } catch (err) {
        console.warn('Falling back to local product dataset:', err.message);
      }
    }

    // In-Memory filtering
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          p.sku.toLowerCase().includes(q)
      );
    }

    if (category && category !== 'All Categories' && category !== 'All Products' && category !== 'all' && category !== 'All') {
      items = items.filter(
        p => p.category.toLowerCase() === category.toLowerCase() ||
             p.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (brand && brand !== 'All Brands' && brand !== 'all') {
      items = items.filter(p => p.brand.toLowerCase() === brand.toLowerCase());
    }

    if (inStock === 'true') {
      items = items.filter(p => p.inStock === true);
    }

    if (minPrice) {
      items = items.filter(p => p.price >= Number(minPrice));
    }

    if (maxPrice) {
      items = items.filter(p => p.price <= Number(maxPrice));
    }

    if (sort === 'price-asc' || sort === 'price-low') {
      items.sort((a, b) => a.price - b.price);
    } else if (sort === 'price-desc' || sort === 'price-high') {
      items.sort((a, b) => b.price - a.price);
    } else if (sort === 'newest') {
      items.reverse();
    } else if (sort === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) || (b.rating || 0) - (a.rating || 0));
    }

    const total = items.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    const paginated = items.slice(startIndex, startIndex + Number(limit));

    res.json({
      products: paginated,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
export const getFeaturedProducts = async (req, res) => {
  try {
    const prods = getLocalProducts();
    const featured = prods.filter(p => p.isFeatured || p.isBestSeller).slice(0, 8);
    res.json(featured.length > 0 ? featured : prods.slice(0, 8));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get product by ID or SKU or Slug
// @route   GET /api/products/:id
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const prods = getLocalProducts();

    const product = prods.find(
      p =>
        p.id === id ||
        p.sku === id ||
        p._id === id ||
        (p.name && p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === id.toLowerCase())
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new product (Admin)
// @route   POST /api/products
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      brand,
      sku,
      category,
      subcategory,
      description,
      price,
      mrp,
      discount = 0,
      stock = 10,
      size,
      unit,
      image,
      isFeatured = false,
      isBestSeller = false,
      inStock = true,
      specifications
    } = req.body;

    if (!name || !brand || !sku || !category || !price) {
      return res.status(400).json({ message: 'Please provide required product fields' });
    }

    const prods = getLocalProducts();
    const id = `prod-${Date.now()}`;

    const newProd = {
      id,
      name,
      brand,
      sku: sku.toUpperCase(),
      category,
      subcategory: subcategory || category,
      description: description || name,
      price: Number(price),
      mrp: mrp ? Number(mrp) : Math.round(Number(price) * 1.15),
      discount: discount ? Number(discount) : 0,
      stock: Number(stock),
      size: size || 'Standard',
      unit: unit || 'Piece',
      image: image || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCSXCIJPEceZGNuZyqKbhC8_BQArcQi3WMXEc0P1DzHrfhrQ3TAanwLtSHf3WCpP5t5jzjixohSK2FmRJXb0xDrW1BJr5WPP7Rce_dYV-5Q8wfaBDnS8Gq0HO83ki9DIQB9bzdanqfEYyU4zAgyMTbGdGs-wJu61xNxNbQPEvIN0wqzXv2_eVGH1lslY0QvOmjIkfsX0weN7Qp_4kELbQkg0tyCMS_Xi-Wx8DneX7w',
      rating: 4.8,
      reviewsCount: 12,
      isFeatured: Boolean(isFeatured),
      isBestSeller: Boolean(isBestSeller),
      inStock: Boolean(inStock),
      specifications: specifications || { Brand: brand, Category: category }
    };

    prods.unshift(newProd);
    saveLocalProducts(prods);

    // Sync to client catalog data as well
    try {
      const clientCatalogPath = path.join(__dirname, '../../client/src/data/catalogData.js');
      if (fs.existsSync(clientCatalogPath)) {
        const cats = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/categories.json'), 'utf8'));
        const content = `export const categories = ${JSON.stringify(cats, null, 2)};\n\nexport const products = ${JSON.stringify(prods, null, 2)};\n\nexport const filterProducts = ({ category, search, brand, sort } = {}) => {\n  let result = [...products];\n  if (category && category !== "all" && category !== "All Products") {\n    result = result.filter(p => p.category.toLowerCase() === category.toLowerCase() || p.category.toLowerCase().includes(category.toLowerCase()));\n  }\n  if (brand && brand !== "all") result = result.filter(p => p.brand.toLowerCase() === brand.toLowerCase());\n  if (search && search.trim() !== "") {\n    const q = search.toLowerCase();\n    result = result.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));\n  }\n  if (sort === "price-low") result.sort((a, b) => a.price - b.price);\n  else if (sort === "price-high") result.sort((a, b) => b.price - a.price);\n  else if (sort === "rating") result.sort((a, b) => b.rating - a.rating);\n  else if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));\n  return result;\n};\n`;
        fs.writeFileSync(clientCatalogPath, content, 'utf8');
      }
    } catch (e) {}

    res.status(201).json(newProd);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update existing product (Admin)
// @route   PUT /api/products/:id
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const prods = getLocalProducts();
    const idx = prods.findIndex(p => p.id === id || p.sku === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }

    prods[idx] = { ...prods[idx], ...req.body };
    saveLocalProducts(prods);

    res.json(prods[idx]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete product (Admin)
// @route   DELETE /api/products/:id
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let prods = getLocalProducts();
    const beforeLen = prods.length;
    prods = prods.filter(p => p.id !== id && p.sku !== id);

    if (prods.length === beforeLen) {
      return res.status(404).json({ message: 'Product not found' });
    }

    saveLocalProducts(prods);
    res.json({ message: 'Product removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
