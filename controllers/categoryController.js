import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const categoriesFilePath = path.join(__dirname, '../data/categories.json');
const brandsFilePath = path.join(__dirname, '../data/brands.json');

const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim();
const slugify = value => cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const requireDatabase = res => {
  if (Category.db?.readyState === 1) return true;
  res.status(503).json({ message: 'Catalog database is unavailable' });
  return false;
};

const getLocalCategories = () => {
  try {
    if (fs.existsSync(categoriesFilePath)) {
      return JSON.parse(fs.readFileSync(categoriesFilePath, 'utf8'));
    }
    return [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const saveLocalCategories = cats => {
  fs.writeFileSync(categoriesFilePath, JSON.stringify(cats, null, 2), 'utf8');
};

const getLocalBrands = () => {
  try {
    return JSON.parse(fs.readFileSync(brandsFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

// @desc    Get all categories (with product count)
// @route   GET /api/categories
export const getCategories = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const isAdmin = req.query.all === 'true';

    if (Category.db?.readyState === 1) {
      const query = isAdmin ? {} : { isActive: { $ne: false } };
      const categories = await Category.find(query).sort({ displayOrder: 1, name: 1 });
      const categoriesWithCount = await Promise.all(
        categories.map(async cat => {
          const itemCount = await Product.countDocuments({
            $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
          });
          const brandCount = await Brand.countDocuments({ categories: cat._id });
          return { ...cat.toObject(), itemCount, brandCount };
        })
      );
      return res.json(categoriesWithCount);
    }

    // Local in-memory fallback
    let localCats = getLocalCategories();
    if (!isAdmin) {
      localCats = localCats.filter(c => c.isActive !== false);
    }

    // Local product counts
    const productsFile = path.join(__dirname, '../data/products.json');
    let localProducts = [];
    if (fs.existsSync(productsFile)) {
      localProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    }

    const localBrands = getLocalBrands();
    const result = localCats.map(cat => ({
      ...cat,
      itemCount: localProducts.filter(p =>
        p.category === cat.slug || p.category === cat.name || p.categoryRef === cat._id
      ).length,
      brandCount: localBrands.filter(brand =>
        (brand.categories || []).some(category => category === cat.slug || category === cat._id)
      ).length
    })).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single category by slug or id
// @route   GET /api/categories/:id
export const getCategoryById = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Category.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      const cat = await Category.findOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
            { slug: slugify(id) },
            { name: { $regex: `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
        ]
      });
      if (cat) {
        const count = await Product.countDocuments({
          $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
        });
        const catObj = cat.toObject();
        catObj.itemCount = count;
        catObj.brandCount = await Brand.countDocuments({ categories: cat._id });
        return res.json(catObj);
      }
      return res.status(404).json({ message: 'Category not found' });
    }

    const local = getLocalCategories();
    const found = local.find(
      c => c.id === id || c._id === id || c.slug === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase()
    );
    if (!found) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.json(found);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new category (Admin)
// @route   POST /api/categories
export const createCategory = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const {
      name,
      slug,
      description = '',
      image = '',
      displayOrder = 0,
      seoTitle = '',
      seoDescription = '',
      isActive = true
    } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const categoryName = cleanName(name);
    const cleanSlug = slugify(slug || categoryName);
    if (!cleanSlug) return res.status(400).json({ message: 'Category slug is invalid' });

    // MongoDB check
    if (Category.db?.readyState === 1) {
      const existing = await Category.findOne({
        $or: [
          { name: { $regex: `^${categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
          { slug: cleanSlug }
        ]
      });
      if (existing) {
        return res.status(409).json({ message: 'Category with this name or slug already exists' });
      }

      const cat = await Category.create({
        name: categoryName,
        slug: cleanSlug,
        description,
        image,
        displayOrder: Number(displayOrder) || 0,
        seoTitle,
        seoDescription,
        itemCount: 0,
        isActive: isActive !== false
      });
      return res.status(201).json(cat);
    }

    // Local fallback
    const local = getLocalCategories();
    if (local.find(c => c.name.toLowerCase() === categoryName.toLowerCase() || c.slug === cleanSlug)) {
      return res.status(409).json({ message: 'Category with this name or slug already exists' });
    }

    const newCat = {
      _id: `cat-${Date.now()}`,
      id: `cat-${Date.now()}`,
      name: categoryName,
      slug: cleanSlug,
      description,
      image,
      displayOrder: Number(displayOrder) || 0,
      seoTitle,
      seoDescription,
      itemCount: 0,
      isActive: isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    local.push(newCat);
    saveLocalCategories(local);

    res.status(201).json(newCat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update category (Admin)
// @route   PUT /api/categories/:id
export const updateCategory = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;
    const { name, slug, description, image, displayOrder, seoTitle, seoDescription, isActive } = req.body;

    if (Category.db?.readyState === 1) {
      const filter = {
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: slugify(id) },
          { name: { $regex: `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
        ]
      };
      const session = await mongoose.startSession();
      let updated;
      try {
        await session.withTransaction(async () => {
          const cat = await Category.findOne(filter).session(session);
          if (!cat) {
            const error = new Error('Category not found');
            error.status = 404;
            throw error;
          }
          const oldName = cat.name;
          const oldSlug = cat.slug;
          const nextName = name === undefined ? cat.name : cleanName(name);
          const nextSlug = slug === undefined ? cat.slug : slugify(slug);
          if (!nextName || !nextSlug) {
            const error = new Error('Category name and slug are required');
            error.status = 400;
            throw error;
          }
          const duplicate = await Category.findOne({
            _id: { $ne: cat._id },
            $or: [{ name: { $regex: `^${nextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }, { slug: nextSlug }]
          }).session(session);
          if (duplicate) {
            const error = new Error('Category with this name or slug already exists');
            error.status = 409;
            throw error;
          }
          cat.name = nextName;
          cat.slug = nextSlug;
          if (description !== undefined) cat.description = description;
          if (image !== undefined) cat.image = image;
          if (displayOrder !== undefined) cat.displayOrder = Number(displayOrder);
          if (seoTitle !== undefined) cat.seoTitle = seoTitle;
          if (seoDescription !== undefined) cat.seoDescription = seoDescription;
          if (isActive !== undefined) cat.isActive = isActive !== false;
          updated = await cat.save({ session });
          if (oldName !== updated.name || oldSlug !== updated.slug) {
            await Product.updateMany(
              { $or: [{ categoryRef: cat._id }, { category: oldSlug }, { category: oldName }] },
              { $set: { category: updated.slug } },
              { session }
            );
          }
        });
      } finally {
        await session.endSession();
      }
      return res.json(updated);
    }

    const local = getLocalCategories();
    const idx = local.findIndex(
      c => c.id === id || c._id === id || c.slug === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase()
    );

    if (idx === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const oldName = local[idx].name;
    const oldSlug = local[idx].slug;
    const nextName = name === undefined ? oldName : cleanName(name);
    const nextSlug = slug === undefined ? oldSlug : slugify(slug);
    if (!nextName || !nextSlug) {
      return res.status(400).json({ message: 'Category name and slug are required' });
    }
    if (local.some((category, index) =>
      index !== idx &&
      (category.name.toLowerCase() === nextName.toLowerCase() || category.slug === nextSlug)
    )) {
      return res.status(409).json({ message: 'Category with this name or slug already exists' });
    }
    local[idx].name = nextName;
    local[idx].slug = nextSlug;
    if (description !== undefined) local[idx].description = description;
    if (image !== undefined) local[idx].image = image;
    if (displayOrder !== undefined) local[idx].displayOrder = Number(displayOrder);
    if (seoTitle !== undefined) local[idx].seoTitle = seoTitle;
    if (seoDescription !== undefined) local[idx].seoDescription = seoDescription;
    if (isActive !== undefined) local[idx].isActive = Boolean(isActive);
    local[idx].updatedAt = new Date().toISOString();

    const productsFile = path.join(__dirname, '../data/products.json');
    let localProducts = [];
    if (fs.existsSync(productsFile)) {
      localProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      localProducts = localProducts.map(product =>
        product.category === oldSlug || product.category === oldName || product.categoryRef === local[idx]._id
          ? { ...product, category: nextSlug }
          : product
      );
      fs.writeFileSync(productsFile, JSON.stringify(localProducts, null, 2), 'utf8');
    }
    const localBrands = getLocalBrands().map(brand => ({
      ...brand,
      categories: (brand.categories || []).map(category => category === oldSlug ? nextSlug : category)
    }));
    fs.writeFileSync(brandsFilePath, JSON.stringify(localBrands, null, 2), 'utf8');
    saveLocalCategories(local);
    res.json(local[idx]);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Delete category with dependency protection (Admin)
// @route   DELETE /api/categories/:id
export const deleteCategory = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Category.db?.readyState === 1) {
      const filter = {
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: slugify(id) },
          { name: { $regex: `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
        ]
      };
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const cat = await Category.findOne(filter).session(session);
          if (!cat) {
            const error = new Error('Category not found');
            error.status = 404;
            throw error;
          }
          const [productCount, brandCount] = await Promise.all([
            Product.countDocuments({
              $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
            }).session(session),
            Brand.countDocuments({ categories: cat._id }).session(session)
          ]);
          if (productCount || brandCount) {
            const error = new Error(
              `Cannot delete '${cat.name}'. It is assigned to ${productCount} product(s) and ${brandCount} brand(s). Reassign or delete them first.`
            );
            error.status = 409;
            throw error;
          }
          await Category.deleteOne({ _id: cat._id }, { session });
        });
      } finally {
        await session.endSession();
      }
      return res.json({ message: 'Category deleted successfully' });
    }

    let local = getLocalCategories();
    const cat = local.find(
      c => c.id === id || c._id === id || c.slug === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase()
    );

    if (!cat) return res.status(404).json({ message: 'Category not found' });

    // Local check
    const localProducts = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8'));
    const localBrands = getLocalBrands();
    const productCount = localProducts.filter(p =>
      p.category === cat.slug || p.category === cat.name || p.categoryRef === cat._id
    ).length;
    const brandCount = localBrands.filter(b =>
      (b.categories || []).some(category => category === cat.slug || category === cat._id)
    ).length;
    if (productCount || brandCount) {
      return res.status(400).json({
        message: `Cannot delete '${cat.name}'. It is assigned to ${productCount} product(s) and ${brandCount} brand(s).`
      });
    }

    local = local.filter(c => c._id !== cat._id && c.slug !== cat.slug);
    saveLocalCategories(local);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};
