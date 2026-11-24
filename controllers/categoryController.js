import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import { parseWebsiteExcel } from '../utils/catalogParser.js';

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

// Seed 6 Master Categories from the Excel specification
export const seedCategoriesIfEmpty = async () => {
  try {
    const { categories: defaultCategories } = parseWebsiteExcel();

    if (Category.db?.readyState === 1) {
      for (const cat of defaultCategories) {
        const existing = await Category.findOne({ slug: cat.slug });
        if (!existing) {
          await Category.create(cat);
        }
      }
      console.log('[Category] 6 Master Categories synced with MongoDB.');
    }

    // Also update local JSON fallback
    const local = getLocalCategories();
    for (const cat of defaultCategories) {
      if (!local.find(c => c.slug === cat.slug)) {
        local.push({
          _id: `cat-${cat.slug}`,
          ...cat,
          createdAt: new Date().toISOString()
        });
      }
    }
    saveLocalCategories(local);
  } catch (err) {
    console.warn('Category seed warning:', err.message);
  }
};

// @desc    Get all categories (with product count)
// @route   GET /api/categories
export const getCategories = async (req, res) => {
  try {
    const isAdmin = req.query.all === 'true';

    if (Category.db?.readyState === 1) {
      const query = isAdmin ? {} : { isActive: { $ne: false } };
      const categories = await Category.find(query).sort({ displayOrder: 1, name: 1 });

      // Dynamically calculate actual product count for each category
      const categoriesWithCount = await Promise.all(
        categories.map(async cat => {
          const count = await Product.countDocuments({
            $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
          });
          const catObj = cat.toObject();
          catObj.itemCount = count;
          return catObj;
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
      try {
        localProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      } catch (e) {}
    }

    const result = localCats.map(cat => ({
      ...cat,
      itemCount: localProducts.filter(p => p.category === cat.slug || p.category === cat.name).length
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
      if (cat) {
        const count = await Product.countDocuments({
          $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
        });
        const catObj = cat.toObject();
        catObj.itemCount = count;
        return res.json(catObj);
      }
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

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const cleanName = name.trim();
    const cleanSlug = (slug || cleanName)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // MongoDB check
    if (Category.db?.readyState === 1) {
      const existing = await Category.findOne({
        $or: [{ name: { $regex: `^${cleanName}$`, $options: 'i' } }, { slug: cleanSlug }]
      });
      if (existing) {
        return res.status(400).json({ message: 'Category with this name or slug already exists' });
      }

      const cat = await Category.create({
        name: cleanName,
        slug: cleanSlug,
        description,
        image,
        displayOrder: Number(displayOrder) || 0,
        seoTitle,
        seoDescription,
        itemCount: 0,
        isActive: Boolean(isActive)
      });
      return res.status(201).json(cat);
    }

    // Local fallback
    const local = getLocalCategories();
    if (local.find(c => c.name.toLowerCase() === cleanName.toLowerCase() || c.slug === cleanSlug)) {
      return res.status(400).json({ message: 'Category with this name or slug already exists' });
    }

    const newCat = {
      _id: `cat-${Date.now()}`,
      id: `cat-${Date.now()}`,
      name: cleanName,
      slug: cleanSlug,
      description,
      image,
      displayOrder: Number(displayOrder) || 0,
      seoTitle,
      seoDescription,
      itemCount: 0,
      isActive: Boolean(isActive),
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
    const { id } = req.params;
    const { name, slug, description, image, displayOrder, seoTitle, seoDescription, isActive } = req.body;

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
        if (displayOrder !== undefined) cat.displayOrder = Number(displayOrder);
        if (seoTitle !== undefined) cat.seoTitle = seoTitle;
        if (seoDescription !== undefined) cat.seoDescription = seoDescription;
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
    if (displayOrder !== undefined) local[idx].displayOrder = Number(displayOrder);
    if (seoTitle !== undefined) local[idx].seoTitle = seoTitle;
    if (seoDescription !== undefined) local[idx].seoDescription = seoDescription;
    if (isActive !== undefined) local[idx].isActive = Boolean(isActive);
    local[idx].updatedAt = new Date().toISOString();

    saveLocalCategories(local);
    res.json(local[idx]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete category with dependency protection (Admin)
// @route   DELETE /api/categories/:id
export const deleteCategory = async (req, res) => {
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

      if (!cat) return res.status(404).json({ message: 'Category not found' });

      // Dependency Protection: Check if products exist in category
      const productCount = await Product.countDocuments({
        $or: [{ category: cat.slug }, { category: cat.name }, { categoryRef: cat._id }]
      });

      if (productCount > 0) {
        return res.status(400).json({
          message: `Cannot delete '${cat.name}'. It currently contains ${productCount} product(s). Please reassign or delete these products before deleting the category.`
        });
      }

      await Category.findByIdAndDelete(cat._id);
      return res.json({ message: 'Category deleted successfully' });
    }

    let local = getLocalCategories();
    const cat = local.find(
      c => c.id === id || c._id === id || c.slug === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase()
    );

    if (!cat) return res.status(404).json({ message: 'Category not found' });

    // Local check
    const productsFile = path.join(__dirname, '../data/products.json');
    let localProducts = [];
    if (fs.existsSync(productsFile)) {
      try {
        localProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      } catch (e) {}
    }

    const count = localProducts.filter(p => p.category === cat.slug || p.category === cat.name).length;
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete '${cat.name}'. It contains ${count} product(s).`
      });
    }

    local = local.filter(c => c._id !== cat._id && c.slug !== cat.slug);
    saveLocalCategories(local);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
