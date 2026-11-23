import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../models/Category.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const categoriesFilePath = path.join(__dirname, '../data/categories.json');

const getLocalCategories = () => {
  try {
    if (fs.existsSync(categoriesFilePath)) {
      return JSON.parse(fs.readFileSync(categoriesFilePath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const saveLocalCategories = cats => {
  try {
    fs.writeFileSync(categoriesFilePath, JSON.stringify(cats, null, 2), 'utf8');
  } catch (e) {}
};

// Auto-seed initial categories from JSON into MongoDB if empty
export const seedCategoriesIfEmpty = async () => {
  try {
    if (Category.db?.readyState === 1) {
      const count = await Category.countDocuments();
      if (count === 0) {
        const local = getLocalCategories();
        if (local.length > 0) {
          await Category.insertMany(
            local.map(c => ({
              name: c.name,
              slug: c.slug || c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              description: c.description || '',
              image: c.image || '',
              itemCount: c.itemCount || 0,
              isActive: c.isActive !== false
            }))
          );
          console.log('[MongoDB] Seeded initial categories into database.');
        }
      }
    }
  } catch (err) {
    console.warn('Category seed warning:', err.message);
  }
};

// @desc    Get all categories (public only gets active; admin can get all)
// @route   GET /api/categories
export const getCategories = async (req, res) => {
  try {
    const isAdmin = req.query.all === 'true';

    if (Category.db?.readyState === 1) {
      const query = isAdmin ? {} : { isActive: { $ne: false } };
      const dbCategories = await Category.find(query).sort({ createdAt: -1 });
      if (dbCategories && dbCategories.length > 0) {
        return res.json(dbCategories);
      }
    }

    const localCats = getLocalCategories();
    const result = isAdmin ? localCats : localCats.filter(c => c.isActive !== false);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single category by slug or id
// @route   GET /api/categories/:id
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (Category.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      const cat = await Category.findOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { name: { $regex: `^${id}$`, $options: 'i' } }
        ]
      });
      if (cat) return res.json(cat);
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
    const { name, slug, description, image, isActive = true } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const cleanSlug = (slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // MongoDB check
    if (Category.db?.readyState === 1) {
      const existing = await Category.findOne({
        $or: [{ name: { $regex: `^${name.trim()}$`, $options: 'i' } }, { slug: cleanSlug }]
      });
      if (existing) {
        return res.status(400).json({ message: 'Category with this name or slug already exists' });
      }

      const cat = await Category.create({
        name: name.trim(),
        slug: cleanSlug,
        description: description || '',
        image: image || '',
        itemCount: 0,
        isActive: Boolean(isActive)
      });
      return res.status(201).json(cat);
    }

    // Local fallback
    const local = getLocalCategories();
    if (local.find(c => c.name.toLowerCase() === name.trim().toLowerCase() || c.slug === cleanSlug)) {
      return res.status(400).json({ message: 'Category with this name or slug already exists' });
    }

    const newCat = {
      _id: `cat-${Date.now()}`,
      id: `cat-${Date.now()}`,
      name: name.trim(),
      slug: cleanSlug,
      description: description || '',
      image: image || '',
      itemCount: 0,
      isActive: Boolean(isActive),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    local.unshift(newCat);
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
    const { id } = req.params;
    const { name, slug, description, image, isActive } = req.body;

    if (Category.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      const cat = await Category.findOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { name: { $regex: `^${id}$`, $options: 'i' } }
        ]
      });

      if (cat) {
        if (name) cat.name = name.trim();
        if (slug) cat.slug = slug.toLowerCase().trim();
        if (description !== undefined) cat.description = description;
        if (image !== undefined) cat.image = image;
        if (isActive !== undefined) cat.isActive = Boolean(isActive);

        const updated = await cat.save();
        return res.json(updated);
      }
    }

    const local = getLocalCategories();
    const idx = local.findIndex(
      c => c.id === id || c._id === id || c.slug === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase()
    );

    if (idx === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (name) local[idx].name = name.trim();
    if (slug) local[idx].slug = slug.toLowerCase().trim();
    if (description !== undefined) local[idx].description = description;
    if (image !== undefined) local[idx].image = image;
    if (isActive !== undefined) local[idx].isActive = Boolean(isActive);
    local[idx].updatedAt = new Date().toISOString();

    saveLocalCategories(local);
    res.json(local[idx]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete category (Admin)
// @route   DELETE /api/categories/:id
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (Category.db?.readyState === 1) {
      const isObjectId = id.match(/^[0-9a-fA-F]{24}$/);
      await Category.deleteOne({
        $or: [
          ...(isObjectId ? [{ _id: id }] : []),
          { slug: id.toLowerCase() },
          { name: { $regex: `^${id}$`, $options: 'i' } }
        ]
      });
      return res.json({ message: 'Category deleted successfully' });
    }

    let local = getLocalCategories();
    const beforeLen = local.length;
    local = local.filter(
      c => c.id !== id && c._id !== id && c.slug !== id.toLowerCase() && c.name.toLowerCase() !== id.toLowerCase()
    );

    if (local.length === beforeLen) {
      return res.status(404).json({ message: 'Category not found' });
    }

    saveLocalCategories(local);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
