import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brandsFilePath = path.join(__dirname, '../data/brands.json');

const getLocalBrands = () => {
  try {
    if (fs.existsSync(brandsFilePath)) {
      return JSON.parse(fs.readFileSync(brandsFilePath, 'utf8'));
    }
  } catch (e) {}
  return [];
};

const saveLocalBrands = brands => {
  try {
    fs.writeFileSync(brandsFilePath, JSON.stringify(brands, null, 2), 'utf8');
  } catch (e) {}
};

// @desc    Get all brands (with optional category filter)
// @route   GET /api/brands
export const getBrands = async (req, res) => {
  try {
    const { category, activeOnly } = req.query;
    const filter = {};
    if (activeOnly === 'true') filter.isActive = true;
    if (category) filter.categories = category;

    if (Brand.db?.readyState === 1) {
      const brands = await Brand.find(filter).sort({ name: 1 });
      return res.json(brands);
    }

    let local = getLocalBrands();
    if (activeOnly === 'true') local = local.filter(b => b.isActive !== false);
    if (category) local = local.filter(b => b.categories && b.categories.includes(category));
    res.json(local.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new brand
// @route   POST /api/brands
export const createBrand = async (req, res) => {
  try {
    const { name, logo = '', description = '', categories = [], isActive = true } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    const cleanName = name.trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (Brand.db?.readyState === 1) {
      const exists = await Brand.findOne({ slug });
      if (exists) {
        return res.status(400).json({ message: 'Brand with this name already exists' });
      }

      const brand = await Brand.create({
        name: cleanName,
        slug,
        logo,
        description,
        categories,
        isActive
      });
      return res.status(201).json(brand);
    }

    const local = getLocalBrands();
    if (local.find(b => b.slug === slug)) {
      return res.status(400).json({ message: 'Brand with this name already exists' });
    }

    const newBrand = {
      _id: `brand-${Date.now()}`,
      name: cleanName,
      slug,
      logo,
      description,
      categories,
      isActive,
      createdAt: new Date().toISOString()
    };
    local.push(newBrand);
    saveLocalBrands(local);
    res.status(201).json(newBrand);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update brand
// @route   PUT /api/brands/:id
export const updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, logo, description, categories, isActive } = req.body;

    if (Brand.db?.readyState === 1) {
      const brand = await Brand.findById(id);
      if (!brand) return res.status(404).json({ message: 'Brand not found' });

      if (name) {
        brand.name = name.trim();
        brand.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }
      if (logo !== undefined) brand.logo = logo;
      if (description !== undefined) brand.description = description;
      if (categories !== undefined) brand.categories = categories;
      if (isActive !== undefined) brand.isActive = isActive;

      const updated = await brand.save();
      return res.json(updated);
    }

    const local = getLocalBrands();
    const idx = local.findIndex(b => b._id === id || b.slug === id);
    if (idx === -1) return res.status(404).json({ message: 'Brand not found' });

    if (name) {
      local[idx].name = name.trim();
      local[idx].slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    if (logo !== undefined) local[idx].logo = logo;
    if (description !== undefined) local[idx].description = description;
    if (categories !== undefined) local[idx].categories = categories;
    if (isActive !== undefined) local[idx].isActive = isActive;

    saveLocalBrands(local);
    res.json(local[idx]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete brand (with dependency check)
// @route   DELETE /api/brands/:id
export const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    if (Brand.db?.readyState === 1) {
      const brand = await Brand.findById(id);
      if (!brand) return res.status(404).json({ message: 'Brand not found' });

      // Check if products are using this brand
      const productCount = await Product.countDocuments({
        $or: [{ brand: brand.name }, { brandRef: brand._id }]
      });

      if (productCount > 0) {
        return res.status(400).json({
          message: `Cannot delete brand '${brand.name}'. It is currently assigned to ${productCount} product(s). Please reassign or delete these products first.`
        });
      }

      await Brand.findByIdAndDelete(id);
      return res.json({ message: 'Brand deleted successfully' });
    }

    const local = getLocalBrands();
    const brand = local.find(b => b._id === id || b.slug === id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    // Local product check
    const productsFile = path.join(__dirname, '../data/products.json');
    let localProducts = [];
    if (fs.existsSync(productsFile)) {
      try {
        localProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
      } catch (e) {}
    }

    const count = localProducts.filter(p => p.brand === brand.name).length;
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete brand '${brand.name}'. It is assigned to ${count} product(s).`
      });
    }

    const filtered = local.filter(b => b._id !== id && b.slug !== id);
    saveLocalBrands(filtered);
    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
