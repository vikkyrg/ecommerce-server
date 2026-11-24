import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import Category from '../models/Category.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brandsFilePath = path.join(__dirname, '../data/brands.json');
const productsFilePath = path.join(__dirname, '../data/products.json');

const getLocalBrands = () => {
  try {
    if (fs.existsSync(brandsFilePath)) {
      return JSON.parse(fs.readFileSync(brandsFilePath, 'utf8'));
    }
    return [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const saveLocalBrands = brands => {
  fs.writeFileSync(brandsFilePath, JSON.stringify(brands, null, 2), 'utf8');
};

const getLocalProducts = () => {
  try {
    return JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim();
const slugify = value => cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const requireDatabase = res => {
  if (Brand.db?.readyState === 1) return true;
  res.status(503).json({ message: 'Catalog database is unavailable' });
  return false;
};

const resolveCategories = async (values, session) => {
  const slugs = [...new Set((Array.isArray(values) ? values : []).map(cleanName).filter(Boolean))];
  if (!slugs.length) return [];
  let categories;
  if (Category.db?.readyState === 1) {
    const filter = {
      $or: slugs.flatMap(value => [
        { slug: slugify(value) },
        { name: { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        ...(mongoose.isValidObjectId(value) ? [{ _id: value }] : [])
      ])
    };
    const query = Category.find(filter);
    if (session) query.session(session);
    categories = await query;
  } else {
    const categoriesFile = path.join(__dirname, '../data/categories.json');
    categories = JSON.parse(fs.readFileSync(categoriesFile, 'utf8')).filter(category =>
      slugs.some(value =>
        category._id === value ||
        category.slug === slugify(value) ||
        category.name.toLowerCase() === value.toLowerCase()
      )
    );
  }
  const bySlug = new Map(categories.map(category => [category.slug.toLowerCase(), category]));
  const byId = new Map(categories.map(category => [String(category._id), category]));
  const resolved = slugs.map(value => bySlug.get(value.toLowerCase()) || byId.get(value));
  if (resolved.some(category => !category)) return null;
  return [...new Map(resolved.map(category => [String(category._id), category])).values()];
};

const serializeBrand = async brand => {
  const categories = await Category.find({ _id: { $in: brand.categories || [] } }, 'name slug');
  return {
    ...brand.toObject(),
    categories: categories.map(category => category.slug),
    categoryDetails: categories,
    productCount: await Product.countDocuments({
      $or: [{ brandRef: brand._id }, { brand: brand.name }]
    })
  };
};

// @desc    Get all brands (with optional category filter)
// @route   GET /api/brands
export const getBrands = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { category, activeOnly } = req.query;
    const filter = {};
    if (activeOnly !== 'false') filter.isActive = { $ne: false };

    if (Brand.db?.readyState === 1) {
      if (category) {
        const categoryDoc = await Category.findOne({
          $or: [
            { slug: cleanName(category).toLowerCase() },
            { name: { $regex: `^${cleanName(category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
            ...(category.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: category }] : [])
          ]
        });
        if (!categoryDoc) return res.json([]);
        filter.categories = categoryDoc._id;
      }
      const brands = await Brand.find(filter).populate('categories', 'name slug').sort({ name: 1 });
      const result = await Promise.all(brands.map(async brand => ({
        ...brand.toObject(),
        categories: (brand.categories || []).map(item => item.slug),
        categoryDetails: brand.categories || [],
        productCount: await Product.countDocuments({
          $or: [{ brandRef: brand._id }, { brand: brand.name }]
        })
      })));
      return res.json(result);
    }

    let local = getLocalBrands();
    if (activeOnly !== 'false') local = local.filter(b => b.isActive !== false);
    if (category) {
      const localCategories = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/categories.json'), 'utf8'));
      const selectedCategory = localCategories.find(item =>
        item._id === category ||
        item.slug === slugify(category) ||
        item.name.toLowerCase() === category.toLowerCase()
      );
      if (!selectedCategory) return res.json([]);
      local = local.filter(brand =>
        (brand.categories || []).some(value =>
          value === selectedCategory.slug || value === selectedCategory._id
        )
      );
    }
    const localProducts = getLocalProducts();
    local = local.map(brand => ({
      ...brand,
      productCount: localProducts.filter(product =>
        product.brand === brand.name || product.brandRef === brand._id
      ).length
    }));
    res.json(local.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Create new brand
// @route   POST /api/brands
export const createBrand = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { name, logo = '', description = '', categories = [], isActive = true } = req.body;
    const clean = cleanName(name);
    if (!clean) {
      return res.status(400).json({ message: 'Brand name is required' });
    }
    const slug = slugify(req.body.slug || clean);
    if (!slug) return res.status(400).json({ message: 'Brand slug is invalid' });
    const resolvedCategories = await resolveCategories(categories);
    if (!resolvedCategories || resolvedCategories.length === 0) {
      return res.status(400).json({ message: 'Select at least one valid category for this brand' });
    }

    if (Brand.db?.readyState === 1) {
      const exists = await Brand.findOne({
        $or: [{ slug }, { name: { $regex: `^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }]
      });
      if (exists) {
        return res.status(409).json({ message: 'Brand with this name or slug already exists' });
      }
      const brand = await Brand.create({
        name: clean,
        slug,
        logo,
        description,
        categories: resolvedCategories.map(category => category._id),
        isActive: isActive !== false
      });
      return res.status(201).json(await serializeBrand(brand));
    }

    const local = getLocalBrands();
    if (local.find(b => b.slug === slug || b.name.toLowerCase() === clean.toLowerCase())) {
      return res.status(409).json({ message: 'Brand with this name or slug already exists' });
    }

    const newBrand = {
      _id: `brand-${Date.now()}`,
      name: clean,
      slug,
      logo,
      description,
      categories: resolvedCategories.map(category => category.slug),
      isActive: isActive !== false,
      createdAt: new Date().toISOString()
    };
    local.push(newBrand);
    saveLocalBrands(local);
    res.status(201).json(newBrand);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Update brand
// @route   PUT /api/brands/:id
export const updateBrand = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;
    const { name, logo, description, categories, isActive } = req.body;

    if (Brand.db?.readyState === 1) {
      const filter = {
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: slugify(id) }
        ]
      };
      const session = await mongoose.startSession();
      let updated;
      try {
        await session.withTransaction(async () => {
          const brand = await Brand.findOne(filter).session(session);
          if (!brand) {
            const error = new Error('Brand not found');
            error.status = 404;
            throw error;
          }
          const previousName = brand.name;
          if (name !== undefined || req.body.slug !== undefined) {
            const nextName = name === undefined ? brand.name : cleanName(name);
            if (!nextName) {
              const error = new Error('Brand name is required');
              error.status = 400;
              throw error;
            }
            const nextSlug = slugify(req.body.slug || nextName);
            if (!nextSlug) {
              const error = new Error('Brand slug is invalid');
              error.status = 400;
              throw error;
            }
            const duplicate = await Brand.findOne({
              _id: { $ne: brand._id },
              $or: [
                { slug: nextSlug },
                { name: { $regex: `^${nextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }
              ]
            }).session(session);
            if (duplicate) {
              const error = new Error('Brand with this name or slug already exists');
              error.status = 409;
              throw error;
            }
            brand.name = nextName;
            brand.slug = nextSlug;
          }
          if (logo !== undefined) brand.logo = logo;
          if (description !== undefined) brand.description = description;
          if (categories !== undefined) {
            const resolvedCategories = await resolveCategories(categories, session);
            if (!resolvedCategories || resolvedCategories.length === 0) {
              const error = new Error('One or more selected categories do not exist');
              error.status = 400;
              throw error;
            }
            const nextCategoryIds = new Set(resolvedCategories.map(category => String(category._id)));
            const removedCategoryIds = (brand.categories || [])
              .map(categoryId => String(categoryId))
              .filter(categoryId => !nextCategoryIds.has(categoryId));
            for (const categoryId of removedCategoryIds) {
              const category = await Category.findById(categoryId).session(session);
              if (!category) continue;
              const assignedProducts = await Product.countDocuments({
                $and: [
                  { $or: [{ brandRef: brand._id }, { brand: brand.name }] },
                  { $or: [{ categoryRef: category._id }, { category: category.slug }, { category: category.name }] }
                ]
              }).session(session);
              if (assignedProducts) {
                const error = new Error(
                  `Cannot remove category '${category.name}' while ${assignedProducts} product(s) use this brand-category assignment.`
                );
                error.status = 409;
                throw error;
              }
            }
            brand.categories = resolvedCategories.map(category => category._id);
          }
          if (isActive !== undefined) brand.isActive = isActive !== false;
          updated = await brand.save({ session });
          if (updated.name !== previousName) {
            await Product.updateMany(
              { $or: [{ brandRef: updated._id }, { brand: previousName }] },
              { $set: { brand: updated.name } },
              { session }
            );
          }
        });
      } finally {
        await session.endSession();
      }
      return res.json(await serializeBrand(updated));
    }

    const local = getLocalBrands();
    const idx = local.findIndex(b => b._id === id || b.slug === id);
    if (idx === -1) return res.status(404).json({ message: 'Brand not found' });

    if (name !== undefined || req.body.slug !== undefined) {
      const previousName = local[idx].name;
      const nextName = name === undefined ? previousName : cleanName(name);
      const nextSlug = slugify(req.body.slug || nextName);
      if (!nextName || !nextSlug) return res.status(400).json({ message: 'Brand name and slug are required' });
      if (local.some((brand, index) =>
        index !== idx &&
        (brand.name.toLowerCase() === nextName.toLowerCase() || brand.slug === nextSlug)
      )) {
        return res.status(409).json({ message: 'Brand with this name or slug already exists' });
      }
      local[idx].name = nextName;
      local[idx].slug = nextSlug;
      const products = getLocalProducts().map(product =>
        product.brandRef === local[idx]._id || product.brand === previousName
          ? { ...product, brand: nextName }
          : product
      );
      fs.writeFileSync(productsFilePath, JSON.stringify(products, null, 2), 'utf8');
    }
    if (logo !== undefined) local[idx].logo = logo;
    if (description !== undefined) local[idx].description = description;
    if (categories !== undefined) {
      const resolvedCategories = await resolveCategories(categories);
      if (!resolvedCategories || resolvedCategories.length === 0) {
        return res.status(400).json({ message: 'Select at least one valid category for this brand' });
      }
      local[idx].categories = resolvedCategories.map(category => category.slug);
    }
    if (isActive !== undefined) local[idx].isActive = isActive !== false;
    local[idx].updatedAt = new Date().toISOString();

    saveLocalBrands(local);
    res.json(local[idx]);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

// @desc    Delete brand (with dependency check)
// @route   DELETE /api/brands/:id
export const deleteBrand = async (req, res) => {
  try {
    if (!requireDatabase(res)) return;
    const { id } = req.params;

    if (Brand.db?.readyState === 1) {
      const filter = {
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { slug: slugify(id) }
        ]
      };
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const brand = await Brand.findOne(filter).session(session);
          if (!brand) {
            const error = new Error('Brand not found');
            error.status = 404;
            throw error;
          }
          const productCount = await Product.countDocuments({
            $or: [{ brand: brand.name }, { brandRef: brand._id }]
          }).session(session);
          if (productCount) {
            const error = new Error(
              `Cannot delete brand '${brand.name}'. It is assigned to ${productCount} product(s). Reassign or delete them first.`
            );
            error.status = 409;
            throw error;
          }
          await Brand.deleteOne({ _id: brand._id }, { session });
        });
      } finally {
        await session.endSession();
      }
      return res.json({ message: 'Brand deleted successfully' });
    }

    const local = getLocalBrands();
    const brand = local.find(b => b._id === id || b.slug === id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    // Local product check
    const localProducts = getLocalProducts();
    const count = localProducts.filter(p => p.brand === brand.name).length;
    if (count > 0) {
      return res.status(400).json({
        message: `Cannot delete brand '${brand.name}'. It is assigned to ${count} product(s).`
      });
    }

    const filtered = local.filter(b => b._id !== brand._id);
    saveLocalBrands(filtered);
    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};
