import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { parseWebsiteExcel } from '../utils/catalogParser.js';

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

// Seed products from Excel if database / local is empty
export const seedProductsFromExcelIfEmpty = async () => {
  try {
    const { products: parsedProducts } = parseWebsiteExcel();

    if (Product.db?.readyState === 1) {
      const count = await Product.countDocuments();
      if (count === 0) {
        await Product.insertMany(parsedProducts);
        console.log(`[Product] Seeded ${parsedProducts.length} Excel products into MongoDB.`);
      }
    }

    const local = getLocalProducts();
    if (local.length === 0) {
      saveLocalProducts(parsedProducts);
    }
  } catch (err) {
    console.warn('Product seed error:', err.message);
  }
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
      activeOnly,
      isFeatured,
      isBestSeller,
      sort,
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    // Try MongoDB if connected
    if (Product.db?.readyState === 1) {
      try {
        const query = {};

        if (activeOnly !== 'false') {
          query.isActive = { $ne: false };
        }

        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { name: { $regex: s, $options: 'i' } },
            { brand: { $regex: s, $options: 'i' } },
            { category: { $regex: s, $options: 'i' } },
            { sku: { $regex: s, $options: 'i' } }
          ];
        }

        if (category && category !== 'All Categories' && category !== 'All Products' && category !== 'all') {
          query.$or = [
            { category: { $regex: `^${category}$`, $options: 'i' } },
            { category: { $regex: category, $options: 'i' } }
          ];
        }

        if (brand && brand !== 'All Brands' && brand !== 'all') {
          query.brand = { $regex: `^${brand}$`, $options: 'i' };
        }

        if (inStock === 'true') {
          query.inStock = true;
        }

        if (isFeatured === 'true') {
          query.isFeatured = true;
        }

        if (isBestSeller === 'true') {
          query.isBestSeller = true;
        }

        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = Number(minPrice);
          if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-asc' || sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-desc' || sort === 'price-high') sortOption = { price: -1 };
        else if (sort === 'newest') sortOption = { createdAt: -1 };
        else if (sort === 'name') sortOption = { name: 1 };
        else if (sort === 'rating') sortOption = { rating: -1 };

        const total = await Product.countDocuments(query);
        const dbProducts = await Product.find(query)
          .sort(sortOption)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum);

        return res.json({
          products: dbProducts,
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum) || 1
        });
      } catch (err) {
        console.warn('Falling back to local product dataset:', err.message);
      }
    }

    // In-Memory filtering
    let items = getLocalProducts();

    if (activeOnly !== 'false') {
      items = items.filter(p => p.isActive !== false);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))
      );
    }

    if (category && category !== 'All Categories' && category !== 'All Products' && category !== 'all') {
      const catLower = category.toLowerCase();
      items = items.filter(
        p => (p.category && p.category.toLowerCase() === catLower) || (p.category && p.category.toLowerCase().includes(catLower))
      );
    }

    if (brand && brand !== 'All Brands' && brand !== 'all') {
      const bLower = brand.toLowerCase();
      items = items.filter(p => p.brand && p.brand.toLowerCase() === bLower);
    }

    if (inStock === 'true') {
      items = items.filter(p => p.inStock === true);
    }

    if (isFeatured === 'true') {
      items = items.filter(p => p.isFeatured === true);
    }

    if (isBestSeller === 'true') {
      items = items.filter(p => p.isBestSeller === true);
    }

    if (minPrice) items = items.filter(p => p.price >= Number(minPrice));
    if (maxPrice) items = items.filter(p => p.price <= Number(maxPrice));

    // Sort
    if (sort === 'price-asc' || sort === 'price-low') items.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === 'price-desc' || sort === 'price-high') items.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === 'name') items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'rating') items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = items.length;
    const paginated = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.json({
      products: paginated,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
export const getFeaturedProducts = async (req, res) => {
  try {
    if (Product.db?.readyState === 1) {
      const prods = await Product.find({
        $or: [{ isFeatured: true }, { isBestSeller: true }],
        isActive: { $ne: false }
      }).limit(8);

      if (prods && prods.length > 0) return res.json(prods);
    }

    const local = getLocalProducts().filter(p => p.isActive !== false);
    const featured = local.filter(p => p.isFeatured || p.isBestSeller).slice(0, 8);
    res.json(featured.length > 0 ? featured : local.slice(0, 8));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product by ID, slug or SKU
// @route   GET /api/products/:id
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (Product.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      const prod = await Product.findOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { sku: id.toUpperCase() }
        ]
      });
      if (prod) return res.json(prod);
    }

    const local = getLocalProducts();
    const cleanId = id.toLowerCase();
    const prod = local.find(
      p =>
        p.id === id ||
        p._id === id ||
        (p.slug && p.slug.toLowerCase() === cleanId) ||
        (p.sku && p.sku.toUpperCase() === id.toUpperCase())
    );

    if (!prod) return res.status(404).json({ message: 'Product not found' });
    res.json(prod);
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
      category,
      subcategory = '',
      description = '',
      shortDescription = '',
      sku,
      price = 0,
      mrp = 0,
      discount = 0,
      stock = 50,
      size = 'Standard',
      weight = '',
      unit = 'Piece',
      image = '',
      productImages = [],
      variants = [],
      specifications = {},
      isFeatured = false,
      isBestSeller = false,
      inStock = true,
      isActive = true,
      seoTitle = '',
      seoDescription = ''
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Product name is required' });
    }
    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    const cleanName = name.trim();
    const cleanBrand = (brand || 'NS Stone Chemicals').trim();
    const cleanSlug = `${cleanName}-${cleanBrand}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cleanSku = (sku || `NSC-${cleanBrand.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();

    if (Product.db?.readyState === 1) {
      const prod = await Product.create({
        name: cleanName,
        slug: cleanSlug,
        brand: cleanBrand,
        category,
        subcategory,
        description,
        shortDescription,
        sku: cleanSku,
        price: Number(price) || 0,
        mrp: Number(mrp) || Math.round(Number(price) * 1.15) || 0,
        discount: Number(discount) || 0,
        stock: Number(stock) || 50,
        size,
        weight,
        unit,
        image: image || (productImages.length > 0 ? productImages[0] : ''),
        productImages: productImages.length > 0 ? productImages : (image ? [image] : []),
        variants,
        specifications,
        isFeatured: Boolean(isFeatured),
        isBestSeller: Boolean(isBestSeller),
        inStock: Boolean(inStock),
        isActive: Boolean(isActive),
        seoTitle,
        seoDescription
      });
      return res.status(201).json(prod);
    }

    // Local fallback
    const prods = getLocalProducts();
    const newProd = {
      _id: `prod-${Date.now()}`,
      id: `prod-${Date.now()}`,
      name: cleanName,
      slug: cleanSlug,
      brand: cleanBrand,
      category,
      subcategory,
      description,
      shortDescription,
      sku: cleanSku,
      price: Number(price) || 0,
      mrp: Number(mrp) || Math.round(Number(price) * 1.15) || 0,
      discount: Number(discount) || 0,
      stock: Number(stock) || 50,
      size,
      weight,
      unit,
      image: image || (productImages.length > 0 ? productImages[0] : ''),
      productImages: productImages.length > 0 ? productImages : (image ? [image] : []),
      variants,
      specifications,
      isFeatured: Boolean(isFeatured),
      isBestSeller: Boolean(isBestSeller),
      inStock: Boolean(inStock),
      isActive: Boolean(isActive),
      seoTitle,
      seoDescription,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    prods.unshift(newProd);
    saveLocalProducts(prods);

    res.status(201).json(newProd);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update product (Admin)
// @route   PUT /api/products/:id
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    if (Product.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      const prod = await Product.findOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { sku: id.toUpperCase() }
        ]
      });

      if (prod) {
        Object.assign(prod, req.body);
        if (req.body.name && req.body.brand) {
          prod.slug = `${req.body.name}-${req.body.brand}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        const updated = await prod.save();
        return res.json(updated);
      }
    }

    const prods = getLocalProducts();
    const idx = prods.findIndex(p => p.id === id || p._id === id || p.sku === id || p.slug === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }

    prods[idx] = {
      ...prods[idx],
      ...req.body,
      updatedAt: new Date().toISOString()
    };
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

    if (Product.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      await Product.deleteOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { sku: id.toUpperCase() }
        ]
      });
      return res.json({ message: 'Product deleted successfully' });
    }

    let prods = getLocalProducts();
    const beforeLen = prods.length;
    prods = prods.filter(p => p.id !== id && p._id !== id && p.sku !== id && p.slug !== id);

    if (prods.length === beforeLen) {
      return res.status(404).json({ message: 'Product not found' });
    }

    saveLocalProducts(prods);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
