import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { optionalNumber, parseProductPricing, withOriginalPrice } from '../utils/productPricing.js';
import { INITIAL_PRODUCT_STOCK, parseStockQuantity } from '../utils/productStock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsFilePath = path.join(__dirname, '../data/products.json');
const requireDatabase = res => {
  if (Product.db?.readyState === 1) return true;
  res.status(503).json({ message: 'Catalog database is unavailable' });
  return false;
};

const getLocalProducts = () => {
  try {
    return JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const saveLocalProducts = prods => {
  fs.writeFileSync(productsFilePath, JSON.stringify(prods, null, 2), 'utf8');
};

const hasProductPrice = product =>
  [product.originalPrice, product.price].some(value =>
    value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0
  );

const preserveExistingDiscountPercentage = (product, pricing) => {
  const existingOriginalPrice = Number(product.originalPrice ?? product.price);
  const existingDiscountPrice = product.discountPrice == null || product.discountPrice === ''
    ? null
    : Number(product.discountPrice);
  const existingPercentage = Number(product.discountPercentage);
  const samePrices = existingOriginalPrice === pricing.originalPrice &&
    existingDiscountPrice === pricing.discountPrice;

  return samePrices &&
    pricing.discountPrice !== null &&
    Number.isFinite(existingPercentage) &&
    existingPercentage > 0 &&
    existingPercentage <= 100
    ? existingPercentage
    : pricing.discountPercentage;
};

const productLookup = id => ({
  $or: [
    ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
    { slug: id.toLowerCase() },
    { sku: id.toUpperCase() }
  ]
});

const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim();
const slugify = value => cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const resolveCategory = async value => {
  const clean = cleanName(value);
  if (!clean) return null;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slugified = slugify(clean);
  if (Category.db?.readyState !== 1) {
    const categories = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/categories.json'), 'utf8'));
    return categories.find(item =>
      item._id === clean ||
      item.slug === slugified ||
      item.name.toLowerCase() === clean.toLowerCase() ||
      item.name.toLowerCase().includes(clean.toLowerCase())
    ) || null;
  }
  return Category.findOne({
    $or: [
      { slug: slugified },
      { slug: clean.toLowerCase() },
      { name: { $regex: `^${escaped}$`, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
      ...(mongoose.isValidObjectId(clean) ? [{ _id: clean }] : [])
    ]
  });
};

const resolveBrand = async value => {
  const clean = cleanName(value);
  if (!clean) return null;
  if (Brand.db?.readyState !== 1) {
    const brands = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/brands.json'), 'utf8'));
    return brands.find(item =>
      item._id === clean || item.slug === slugify(clean) || item.name.toLowerCase() === clean.toLowerCase()
    ) || null;
  }
  return Brand.findOne({
    $or: [
      { slug: slugify(clean) },
      { name: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ...(mongoose.isValidObjectId(clean) ? [{ _id: clean }] : [])
    ]
  });
};

const parseFeatures = val => {
  if (Array.isArray(val)) return val.map(cleanName).filter(Boolean);
  if (typeof val === 'string') return val.split(/\r?\n/).map(cleanName).filter(Boolean);
  return [];
};

// @desc    Get all products with search, filter, sort & pagination
// @route   GET /api/products
export const getProducts = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
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
    // Admin requests pass limit=300 — allow up to 500 for internal use
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));

    // Try MongoDB if connected
    if (Product.db?.readyState === 1) {
      try {
        const query = {};

        if (activeOnly !== 'false') {
          query.isActive = { $ne: false };
          const [inactiveCategories, inactiveBrands] = await Promise.all([
            Category.find({ isActive: false }).distinct('_id'),
            Brand.find({ isActive: false }).distinct('_id')
          ]);
          query.$and = query.$and || [];
          if (inactiveCategories.length) query.$and.push({ categoryRef: { $nin: inactiveCategories } });
          if (inactiveBrands.length) query.$and.push({ brandRef: { $nin: inactiveBrands } });
        }

        if (search && search.trim()) {
          const s = search.trim();
          query.$or = [
            { name: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { brand: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { category: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { sku: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ];
        }

        if (category && category !== 'All Categories' && category !== 'All Products' && category !== 'all') {
          const categoryDoc = await resolveCategory(category);
          const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              ...(categoryDoc ? [{ categoryRef: categoryDoc._id }, { category: categoryDoc.slug }, { category: categoryDoc.name }] : []),
              { category: { $regex: `^${escapedCategory}$`, $options: 'i' } }
            ]
          });
        }

        if (brand && brand !== 'All Brands' && brand !== 'all') {
          const brandDoc = await resolveBrand(brand);
          const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              ...(brandDoc ? [{ brandRef: brandDoc._id }, { brand: brandDoc.name }] : []),
              { brand: { $regex: `^${escapedBrand}$`, $options: 'i' } }
            ]
          });
        }

        if (inStock === 'true') {
          query.stock = { $gt: 0 };
        }

        if (isFeatured === 'true') {
          query.isFeatured = true;
        }

        if (isBestSeller === 'true') {
          query.isBestSeller = true;
        }

        if (minPrice || maxPrice) {
          const priceRange = {};
          if (minPrice) priceRange.$gte = Number(minPrice);
          if (maxPrice) priceRange.$lte = Number(maxPrice);
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { price: priceRange },
              { originalPrice: priceRange }
            ]
          });
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-asc' || sort === 'price-low') sortOption = { price: 1 };
        else if (sort === 'price-desc' || sort === 'price-high') sortOption = { price: -1 };
        else if (sort === 'newest') sortOption = { createdAt: -1 };
        else if (sort === 'name') sortOption = { name: 1 };
        else if (sort === 'rating') sortOption = { rating: -1 };

        const total = await Product.countDocuments(query);
        const dbProducts = await Product.find(query)
          .populate('categoryRef', 'name slug image')
          .populate('brandRef', 'name slug')
          .sort(sortOption)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum);

        return res.json({
          products: dbProducts.map(product => {
            const obj = withOriginalPrice(product.toObject());
            return {
              ...obj,
              image: obj.image || product.categoryRef?.image || '',
              categoryName: product.categoryRef?.name || product.category,
              brandName: product.brandRef?.name || product.brand
            };
          }),
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum) || 1
        });
      } catch (err) {
        return res.status(500).json({ message: err.message });
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
      items = items.filter(p => Number.isSafeInteger(p.stock) && p.stock > 0);
    }

    if (isFeatured === 'true') {
      items = items.filter(p => p.isFeatured === true);
    }

    if (isBestSeller === 'true') {
      items = items.filter(p => p.isBestSeller === true);
    }

    if (minPrice) items = items.filter(p => Number(p.originalPrice ?? p.price) >= Number(minPrice));
    if (maxPrice) items = items.filter(p => Number(p.originalPrice ?? p.price) <= Number(maxPrice));

    // Sort
    if (sort === 'price-asc' || sort === 'price-low') items.sort((a, b) => Number(a.originalPrice ?? a.price ?? 0) - Number(b.originalPrice ?? b.price ?? 0));
    else if (sort === 'price-desc' || sort === 'price-high') items.sort((a, b) => Number(b.originalPrice ?? b.price ?? 0) - Number(a.originalPrice ?? a.price ?? 0));
    else if (sort === 'name') items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sort === 'rating') items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = items.length;
    const paginated = items
      .slice((pageNum - 1) * limitNum, pageNum * limitNum)
      .map(withOriginalPrice);

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

export const getProductsByCategory = (req, res) =>
  getProducts({
    query: {
      ...req.query,
      category: req.params.category
    }
  }, res);

// @desc    Get featured products
// @route   GET /api/products/featured
export const getFeaturedProducts = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    if (Product.db?.readyState === 1) {
      const prods = await Product.find({
        $or: [{ isFeatured: true }, { isBestSeller: true }],
        isActive: { $ne: false }
      }).populate('categoryRef', 'name slug image isActive').populate('brandRef', 'name slug isActive').limit(8);

      return res.json(prods.filter(product =>
        product.categoryRef?.isActive !== false && product.brandRef?.isActive !== false
      ).map(product => {
        const obj = withOriginalPrice(product.toObject());
        return {
          ...obj,
          image: obj.image || product.categoryRef?.image || '',
          categoryName: product.categoryRef?.name || product.category,
          brandName: product.brandRef?.name || product.brand
        };
      }));
    }

    const local = getLocalProducts().filter(p => p.isActive !== false);
    const featured = local.filter(p => p.isFeatured || p.isBestSeller).slice(0, 8);
    res.json((featured.length > 0 ? featured : local.slice(0, 8)).map(withOriginalPrice));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single product by ID, slug or SKU
// @route   GET /api/products/:id
export const getProductById = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Product.db?.readyState === 1) {
      const prod = await Product.findOne({
        $and: [
          {
            $or: [
              ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
              { slug: id.toLowerCase() },
              { sku: id.toUpperCase() }
            ]
          },
          { isActive: { $ne: false } },
          { $or: [{ price: { $gt: 0 } }, { originalPrice: { $gt: 0 } }] }
        ]
      }).populate('categoryRef', 'name slug image isActive').populate('brandRef', 'name slug isActive');
      if (prod) {
        if (prod.categoryRef?.isActive === false || prod.brandRef?.isActive === false) {
          return res.status(404).json({ message: 'Product not found' });
        }
        const obj = withOriginalPrice(prod.toObject());
        return res.json({
          ...obj,
          image: obj.image || prod.categoryRef?.image || '',
          categoryName: prod.categoryRef?.name || prod.category,
          brandName: prod.brandRef?.name || prod.brand
        });
      }
      return res.status(404).json({ message: 'Product not found' });
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

    if (!prod || prod.isActive === false || !hasProductPrice(prod)) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(withOriginalPrice(prod));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new product (Admin)
// @route   POST /api/products
export const createProduct = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const body = req.body;
    const productName = cleanName(body.name);
    if (!productName) {
      return res.status(400).json({ message: 'Product name is required' });
    }
    const category = await resolveCategory(body.categoryRef || body.category);
    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }
    const brandValue = body.brandRef || body.brand;
    const brand = brandValue ? await resolveBrand(brandValue) : null;
    if (brandValue && !brand) {
      return res.status(400).json({ message: 'Selected brand was not found' });
    }
    if (brand && !(brand.categories || []).some(categoryRef =>
      String(categoryRef) === String(category._id) || categoryRef === category.slug
    )) {
      return res.status(400).json({ message: 'Selected brand is not assigned to this category' });
    }
    const sku = cleanName(body.sku).toUpperCase();
    const pricing = parseProductPricing(
      body.originalPrice !== undefined ? body.originalPrice : body.price,
      body.discountPrice !== undefined ? body.discountPrice : body.offerPrice
    );
    const stock = body.stock === undefined || body.stock === null || body.stock === ''
      ? INITIAL_PRODUCT_STOCK
      : parseStockQuantity(body.stock);
    const product = {
      name: productName,
      brand: brand?.name || '',
      category: category.slug,
      categoryRef: category._id,
      subcategory: cleanName(body.subcategory),
      description: body.description || '',
      shortDescription: body.shortDescription || '',
      applications: body.applications || '',
      features: parseFeatures(body.features),
      sku,
      ...pricing,
      price: pricing.originalPrice,
      mrp: optionalNumber(body.mrp, 'MRP') ?? (pricing.discountPrice ? pricing.originalPrice : null),
      discount: pricing.discountPercentage ?? 0,
      stock,
      size: body.size || '',
      weight: body.weight || '',
      unit: body.unit || '',
      image: body.image || '',
      productImages: Array.isArray(body.productImages) ? body.productImages : (body.image ? [body.image] : []),
      variants: Array.isArray(body.variants) ? body.variants : [],
      specifications: body.specifications || {},
      isFeatured: body.isFeatured === true,
      isBestSeller: body.isBestSeller === true,
      inStock: stock === null ? null : stock > 0,
      isActive: body.isActive !== false,
      seoTitle: body.seoTitle || '',
      seoDescription: body.seoDescription || ''
    };
    if (brand) product.brandRef = brand._id;

    if (Product.db?.readyState === 1) {
      if (sku && await Product.exists({ sku })) {
        return res.status(409).json({ message: 'A product with this SKU already exists' });
      }
      let baseSlug = slugify(`${productName}-${category.slug}-${brand?.slug || 'unbranded'}`);
      let candidateSlug = baseSlug;
      let suffix = 2;
      while (await Product.exists({ slug: candidateSlug })) {
        candidateSlug = `${baseSlug}-${suffix++}`;
      }
      const prod = await Product.create({ ...product, slug: candidateSlug });
      return res.status(201).json(prod);
    }

    const prods = getLocalProducts();
    if (sku && prods.some(item => item.sku?.toUpperCase() === sku)) {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    const localBrands = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/brands.json'), 'utf8'));
    const localBrand = brandValue
      ? localBrands.find(item => item._id === brandValue || item.slug === slugify(brandValue) || item.name.toLowerCase() === cleanName(brandValue).toLowerCase())
      : null;
    if (brandValue && !localBrand) {
      return res.status(400).json({ message: 'Selected brand was not found' });
    }
    const baseSlug = slugify(`${productName}-${category.slug}-${localBrand?.slug || 'unbranded'}`);
    let candidateSlug = baseSlug;
    let suffix = 2;
    while (prods.some(item => item.slug === candidateSlug)) candidateSlug = `${baseSlug}-${suffix++}`;
    const newProd = {
      _id: `prod-${Date.now()}`,
      ...product,
      ...(localBrand ? { brand: localBrand.name, brandRef: localBrand._id } : {}),
      slug: candidateSlug,
      categoryRef: category._id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    prods.unshift(newProd);
    saveLocalProducts(prods);
    return res.status(201).json(newProd);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Update product (Admin)
// @route   PUT /api/products/:id
export const updateProduct = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Product.db?.readyState === 1) {
      const prod = await Product.findOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { sku: id.toUpperCase() }
        ]
      });

      if (prod) {
        const body = req.body;
        const nextName = body.name === undefined ? prod.name : cleanName(body.name);
        const categoryInput = body.categoryRef || body.category;
        const category = categoryInput === undefined
          ? (prod.categoryRef ? await Category.findById(prod.categoryRef) : await resolveCategory(prod.category))
          : await resolveCategory(categoryInput);
        if (!nextName) return res.status(400).json({ message: 'Product name is required' });
        if (!category) return res.status(400).json({ message: 'Category is required' });

        const brandInputProvided = body.brandRef !== undefined || body.brand !== undefined;
        const brandInput = body.brandRef !== undefined ? body.brandRef : body.brand;
        const brand = brandInputProvided
          ? (brandInput ? await resolveBrand(brandInput) : null)
          : (prod.brandRef ? await Brand.findById(prod.brandRef) : await resolveBrand(prod.brand));
        if (brandInput && !brand) return res.status(400).json({ message: 'Selected brand was not found' });
        if (brand && !(brand.categories || []).some(categoryId => String(categoryId) === String(category._id))) {
          return res.status(400).json({ message: 'Selected brand is not assigned to this category' });
        }

        const sku = body.sku === undefined ? prod.sku : cleanName(body.sku).toUpperCase();
        if (sku && await Product.exists({ _id: { $ne: prod._id }, sku })) {
          return res.status(409).json({ message: 'A product with this SKU already exists' });
        }
        prod.name = nextName;
        prod.category = category.slug;
        prod.categoryRef = category._id;
        prod.brand = brand?.name || '';
        prod.brandRef = brand?._id;
        prod.sku = sku;
        for (const field of [
          'subcategory', 'description', 'shortDescription', 'applications', 'size', 'weight', 'unit', 'image',
          'productImages', 'variants', 'specifications', 'isFeatured', 'isBestSeller', 'isActive',
          'seoTitle', 'seoDescription', 'notes'
        ]) {
          if (body[field] !== undefined) prod[field] = body[field];
        }

        if (body.features !== undefined) {
          prod.features = parseFeatures(body.features);
        }

        const updatedPriceInput = body.originalPrice !== undefined
          ? body.originalPrice
          : body.price !== undefined
            ? body.price
            : (prod.originalPrice ?? prod.price);
        const discountPriceInput = body.discountPrice !== undefined ? body.discountPrice : (body.offerPrice !== undefined ? body.offerPrice : prod.discountPrice);
        const pricing = parseProductPricing(updatedPriceInput, discountPriceInput);
        const discountPercentage = preserveExistingDiscountPercentage(prod, pricing);
        prod.originalPrice = pricing.originalPrice;
        prod.price = pricing.originalPrice;
        prod.discountPrice = pricing.discountPrice;
        prod.discountPercentage = discountPercentage;

        if (body.mrp !== undefined) prod.mrp = optionalNumber(body.mrp, 'MRP');
        else if (prod.discountPrice) prod.mrp = prod.price;
        prod.discount = discountPercentage ?? 0;
        if (body.stock !== undefined) prod.stock = parseStockQuantity(body.stock);
        if (body.inStock !== undefined) prod.inStock = body.inStock === true;
        else if (body.stock !== undefined) prod.inStock = prod.stock === null ? null : prod.stock > 0;
        prod.slug = slugify(`${nextName}-${category.slug}-${brand?.slug || 'unbranded'}`);
        const duplicateSlug = await Product.exists({ _id: { $ne: prod._id }, slug: prod.slug });
        if (duplicateSlug) prod.slug = `${prod.slug}-${String(prod._id).slice(-6)}`;
        const updated = await prod.save();
        return res.json(updated);
      }
      return res.status(404).json({ message: 'Product not found' });
    }

    const prods = getLocalProducts();
    const idx = prods.findIndex(p => p.id === id || p._id === id || p.sku === id || p.slug === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const body = req.body;
    const nextName = body.name === undefined ? prods[idx].name : cleanName(body.name);
    const category = body.categoryRef || body.category
      ? await resolveCategory(body.categoryRef || body.category)
      : { slug: prods[idx].category, _id: prods[idx].categoryRef };
    if (!nextName || !category) return res.status(400).json({ message: 'Product name and category are required' });
    const brandInputProvided = body.brandRef !== undefined || body.brand !== undefined;
    const brandInput = body.brandRef !== undefined ? body.brandRef : body.brand;
    let brand = null;
    if (brandInputProvided && brandInput) brand = await resolveBrand(brandInput);
    else if (!brandInputProvided && prods[idx].brand) {
      brand = await resolveBrand(prods[idx].brandRef || prods[idx].brand);
    }
    if (brandInput && !brand) return res.status(400).json({ message: 'Selected brand was not found' });
    if (brand && !(brand.categories || []).some(categoryRef =>
      String(categoryRef) === String(category._id) || categoryRef === category.slug
    )) {
      return res.status(400).json({ message: 'Selected brand is not assigned to this category' });
    }
    const sku = body.sku === undefined ? prods[idx].sku : cleanName(body.sku).toUpperCase();
    if (sku && prods.some((item, index) => index !== idx && item.sku?.toUpperCase() === sku)) {
      return res.status(409).json({ message: 'A product with this SKU already exists' });
    }
    const updated = {
      ...prods[idx],
      ...body,
      name: nextName,
      category: category.slug,
      categoryRef: category._id,
      brand: brand?.name || '',
      brandRef: brand?._id,
      sku,
      applications: body.applications !== undefined ? body.applications : (prods[idx].applications || ''),
      features: body.features !== undefined ? parseFeatures(body.features) : (prods[idx].features || [])
    };
    const updatedPriceInput = body.originalPrice !== undefined
      ? body.originalPrice
      : body.price !== undefined
        ? body.price
        : (prods[idx].originalPrice ?? prods[idx].price);
    const discountPriceInput = body.discountPrice !== undefined ? body.discountPrice : (body.offerPrice !== undefined ? body.offerPrice : prods[idx].discountPrice);
    const pricing = parseProductPricing(updatedPriceInput, discountPriceInput);
    const discountPercentage = preserveExistingDiscountPercentage(prods[idx], pricing);
    updated.originalPrice = pricing.originalPrice;
    updated.price = pricing.originalPrice;
    updated.discountPrice = pricing.discountPrice;
    updated.discountPercentage = discountPercentage;

    if (body.mrp !== undefined) updated.mrp = optionalNumber(body.mrp, 'MRP');
    else if (updated.discountPrice) updated.mrp = updated.price;
    updated.discount = discountPercentage ?? 0;
    if (body.stock !== undefined) {
      updated.stock = parseStockQuantity(body.stock);
      updated.inStock = updated.stock === null ? null : updated.stock > 0;
    }
    updated.slug = slugify(`${nextName}-${category.slug}-${brand?.slug || 'unbranded'}`);
    if (prods.some((item, index) => index !== idx && item.slug === updated.slug)) {
      updated.slug = `${updated.slug}-${String(prods[idx]._id).slice(-6)}`;
    }
    updated.updatedAt = new Date().toISOString();
    prods[idx] = updated;
    saveLocalProducts(prods);

    res.json(prods[idx]);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateProductPrice = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    if (Product.db?.readyState !== 1) {
      return res.status(503).json({ message: 'Catalog database is unavailable' });
    }
    const product = await Product.findOne(productLookup(req.params.id));
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const body = req.body || {};
    const originalPriceInput = body.originalPrice ?? body.regularPrice ?? body.price ??
      product.originalPrice ?? product.price;
    const discountPriceInput = body.discountPrice !== undefined
      ? body.discountPrice
      : product.discountPrice;
    const pricing = parseProductPricing(originalPriceInput, discountPriceInput);
    const discountPercentage = preserveExistingDiscountPercentage(product, pricing);
    const mrp = body.mrp !== undefined
      ? optionalNumber(body.mrp, 'MRP')
      : pricing.discountPrice === null
        ? null
        : pricing.originalPrice;

    const updated = await Product.findByIdAndUpdate(product._id, {
      $set: {
        ...pricing,
        discountPercentage,
        mrp,
        discount: discountPercentage ?? 0
      }
    }, { new: true, runValidators: true });

    return res.json(withOriginalPrice(updated.toObject()));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateProductStock = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const stock = parseStockQuantity(req.body?.stock);
    const product = await Product.findOneAndUpdate(
      productLookup(req.params.id),
      { $set: { stock, inStock: stock > 0 } },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json(withOriginalPrice(product.toObject()));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateProductDescription = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    if (Product.db?.readyState !== 1) {
      return res.status(503).json({ message: 'Catalog database is unavailable' });
    }
    const body = req.body || {};
    const update = {};

    if (body.shortDescription !== undefined) {
      if (typeof body.shortDescription !== 'string') {
        return res.status(400).json({ message: 'Short Description must be text' });
      }
      update.shortDescription = body.shortDescription.trim();
    }

    const description = body.description !== undefined ? body.description : body.fullDescription;
    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({ message: 'Full Product Description must be text' });
      }
      update.description = description.trim();
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Provide a short or full product description to update' });
    }

    const updated = await Product.findOneAndUpdate(
      productLookup(req.params.id),
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Product not found' });

    return res.json(withOriginalPrice(updated.toObject()));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Delete product (Admin)
// @route   DELETE /api/products/:id
export const deleteProduct = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Product.db?.readyState === 1) {
      const result = await Product.deleteOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { sku: id.toUpperCase() }
        ]
      });
      if (!result.deletedCount) return res.status(404).json({ message: 'Product not found' });
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
    res.status(error.status || 500).json({ message: error.message });
  }
};
