import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { parseWebsiteWorkbook } from '../utils/websiteWorkbookParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbookPath = path.join(__dirname, '../data/WEBSITE.xlsx');
const backupDirectory = path.join(__dirname, '../backups');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const slugify = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const errorResponse = (res, error) =>
  res.status(error.status || 500).json({ success: false, message: error.message });

const withWorkbook = async (body, callback) => {
  let temporaryPath;
  try {
    let targetPath = workbookPath;
    if (body?.base64Data) {
      const base64 = body.base64Data.replace(/^data:.*;base64,/, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        const error = new Error('Uploaded workbook data is invalid');
        error.status = 400;
        throw error;
      }
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.length || buffer.length > 20 * 1024 * 1024) {
        const error = new Error('Workbook must be between 1 byte and 20 MB');
        error.status = 400;
        throw error;
      }
      temporaryPath = path.join(os.tmpdir(), `ns-stone-import-${crypto.randomBytes(12).toString('hex')}.xlsx`);
      fs.writeFileSync(temporaryPath, buffer, { flag: 'wx' });
      targetPath = temporaryPath;
    }

    if (!fs.existsSync(targetPath)) {
      const error = new Error('The catalog workbook was not found');
      error.status = 404;
      throw error;
    }
    const workbookBuffer = fs.readFileSync(targetPath);
    const parsed = parseWebsiteWorkbook(targetPath);
    return await callback(parsed, sha256(workbookBuffer));
  } finally {
    if (temporaryPath && fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
};

const requireDatabase = res => {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ success: false, message: 'Catalog database is unavailable' });
  return false;
};

const makeCatalogBackup = async () => {
  const [categories, brands, products] = await Promise.all([
    Category.find({}).sort({ _id: 1 }).lean(),
    Brand.find({}).sort({ _id: 1 }).lean(),
    Product.find({}).sort({ _id: 1 }).lean()
  ]);
  const backup = {
    createdAt: new Date().toISOString(),
    database: mongoose.connection.name,
    collections: { categories, brands, products }
  };
  const snapshotHash = sha256(JSON.stringify(backup.collections));
  fs.mkdirSync(backupDirectory, { recursive: true });
  const fileName = `catalog-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}.json`;
  const backupPath = path.join(backupDirectory, fileName);
  const contents = JSON.stringify(backup, null, 2);
  fs.writeFileSync(backupPath, contents, { flag: 'wx' });
  const writtenContents = fs.readFileSync(backupPath, 'utf8');
  if (sha256(contents) !== sha256(writtenContents)) {
    throw new Error('Catalog backup checksum verification failed');
  }
  const verified = JSON.parse(writtenContents);
  const backupCounts = {
    categories: verified.collections.categories.length,
    brands: verified.collections.brands.length,
    products: verified.collections.products.length
  };
  if (
    backupCounts.categories !== categories.length ||
    backupCounts.brands !== brands.length ||
    backupCounts.products !== products.length
  ) {
    throw new Error('Catalog backup record-count verification failed');
  }
  return {
    path: backupPath,
    sha256: sha256(writtenContents),
    snapshotHash,
    counts: backupCounts
  };
};

const replaceCatalog = async (parsed, mappingDecisions) => {
  if (parsed.unclassifiedEntries.length) {
    const error = new Error('Unclassified workbook cells must be mapped or explicitly recorded before replacement');
    error.status = 409;
    error.unclassifiedEntries = parsed.unclassifiedEntries;
    throw error;
  }
  if (parsed.duplicateCandidates.length) {
    const error = new Error('Duplicate product candidates must be reviewed before replacement');
    error.status = 409;
    throw error;
  }

  const categoryIds = new Map(parsed.categories.map(category => [
    category.slug,
    new mongoose.Types.ObjectId()
  ]));
  const brandIds = new Map(parsed.brands.map(brand => [
    brand.slug,
    new mongoose.Types.ObjectId()
  ]));
  const categories = parsed.categories.map((category, index) => ({
    _id: categoryIds.get(category.slug),
    name: category.name,
    slug: category.slug,
    description: '',
    displayOrder: index + 1,
    itemCount: 0,
    isActive: true
  }));
  const brands = parsed.brands.map(brand => {
    const categoryRefs = brand.categories.map(slug => categoryIds.get(slug));
    if (!categoryRefs.length || categoryRefs.some(reference => !reference)) {
      throw new Error(`Brand "${brand.name}" has a category reference that was not extracted`);
    }
    return {
      _id: brandIds.get(brand.slug),
      name: brand.name,
      slug: brand.slug,
      description: '',
      categories: categoryRefs,
      isActive: true,
      supplierNotes: parsed.notes
        .filter(note => note.brand?.toLowerCase() === brand.name.toLowerCase())
        .map(note => `${note.sourceCell}: ${note.text}`)
    };
  });
  const products = parsed.products.map(product => {
    const categoryName = mappingDecisions[product.sourceCell] || product.categoryName;
    const resolvedCategory = parsed.categories.find(category =>
      category.name.toLowerCase() === categoryName.toLowerCase()
    );
    const categorySlug = resolvedCategory?.slug || product.category;
    const categoryRef = categoryIds.get(categorySlug);
    const brandRef = product.brandSlug ? brandIds.get(product.brandSlug) : undefined;
    if (!categoryRef || (product.brandSlug && !brandRef)) {
      throw new Error(`Product "${product.name}" has an unresolved category or brand reference`);
    }
    return {
      name: product.name,
      slug: slugify(`${categorySlug}-${product.brandSlug || 'unbranded'}-${product.name}`),
      sku: '',
      brand: product.brand || '',
      ...(brandRef ? { brandRef } : {}),
      category: categorySlug,
      categoryRef,
      subcategory: product.subcategory || '',
      description: '',
      shortDescription: '',
      price: null,
      mrp: null,
      discount: 0,
      stock: null,
      size: product.variants.map(variant => variant.size).filter(Boolean).join(', '),
      weight: '',
      unit: '',
      image: '',
      productImages: [],
      variants: product.variants,
      specifications: {},
      inStock: null,
      isActive: true,
      notes: product.notes || '',
      sourceCell: product.sourceCell,
      importWarnings: product.warnings
    };
  });

  const backup = await makeCatalogBackup();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const [oldCategories, oldBrands, oldProducts] = await Promise.all([
        Category.find({}).sort({ _id: 1 }).session(session).lean(),
        Brand.find({}).sort({ _id: 1 }).session(session).lean(),
        Product.find({}).sort({ _id: 1 }).session(session).lean()
      ]);
      const currentHash = sha256(JSON.stringify({
        categories: oldCategories,
        brands: oldBrands,
        products: oldProducts
      }));
      if (currentHash !== backup.snapshotHash) {
        throw new Error('Catalog changed after backup verification; replacement cancelled');
      }
      await Product.deleteMany({}, { session });
      await Brand.deleteMany({}, { session });
      await Category.deleteMany({}, { session });
      if (categories.length) await Category.insertMany(categories, { session });
      if (brands.length) await Brand.insertMany(brands, { session });
      if (products.length) await Product.insertMany(products, { session });

      const [categoryCount, brandCount, productCount] = await Promise.all([
        Category.countDocuments({}).session(session),
        Brand.countDocuments({}).session(session),
        Product.countDocuments({}).session(session)
      ]);
      if (
        categoryCount !== categories.length ||
        brandCount !== brands.length ||
        productCount !== products.length
      ) {
        throw new Error('In-transaction catalog count verification failed');
      }

      const [savedBrands, savedProducts] = await Promise.all([
        Brand.find({}).session(session),
        Product.find({}).session(session)
      ]);
      const categoryIdSet = new Set(categories.map(category => String(category._id)));
      const brandById = new Map(savedBrands.map(brand => [String(brand._id), brand]));
      for (const brand of savedBrands) {
        if (!brand.categories.length || brand.categories.some(id => !categoryIdSet.has(String(id)))) {
          throw new Error(`Saved brand "${brand.name}" has an invalid category reference`);
        }
      }
      for (const product of savedProducts) {
        if (!categoryIdSet.has(String(product.categoryRef))) {
          throw new Error(`Saved product "${product.name}" has an invalid category reference`);
        }
        if (product.brandRef) {
          const brand = brandById.get(String(product.brandRef));
          if (!brand || !brand.categories.some(id => String(id) === String(product.categoryRef))) {
            throw new Error(`Saved product "${product.name}" has an invalid brand-category relationship`);
          }
        }
        if (product.price !== null || product.stock !== null) {
          throw new Error(`Saved product "${product.name}" has an invented price or stock value`);
        }
      }
    });
  } finally {
    await session.endSession();
  }

  const [categoryCount, brandCount, productCount] = await Promise.all([
    Category.countDocuments({}),
    Brand.countDocuments({}),
    Product.countDocuments({})
  ]);
  const imported = { categories: categoryCount, brands: brandCount, products: productCount };
  if (
    imported.categories !== categories.length ||
    imported.brands !== brands.length ||
    imported.products !== products.length
  ) {
    throw new Error('Post-commit catalog verification failed');
  }
  return { imported, backup };
};

export const previewCatalogImport = async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    return await withWorkbook(req.body, async (parsed, workbookHash) => {
      const existingCatalog = {
        categories: await Category.countDocuments({}),
        brands: await Brand.countDocuments({}),
        products: await Product.countDocuments({})
      };
      return res.json({
        success: true,
        workbookHash,
        workbook: parsed.workbook,
        summary: {
          ...parsed.summary,
          totalProductsFound: parsed.summary.totalProducts
        },
        existingCatalog,
        categories: parsed.categories,
        brands: parsed.brands,
        products: parsed.products,
        notes: parsed.notes,
        ambiguousMappings: parsed.ambiguousMappings,
        duplicateCandidates: parsed.duplicateCandidates,
        invalidEntries: parsed.invalidEntries,
        unclassifiedEntries: parsed.unclassifiedEntries
      });
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};

export const confirmCatalogImport = async (req, res) => {
  if (!requireDatabase(res)) return;
  try {
    return await withWorkbook(req.body, async (parsed, workbookHash) => {
      if (req.body?.workbookHash !== workbookHash) {
        return res.status(409).json({
          success: false,
          message: 'Workbook changed since preview. Generate a new preview before replacement.'
        });
      }
      if (req.body?.replaceExisting !== true) {
        return res.status(400).json({
          success: false,
          message: 'Explicit catalog replacement confirmation is required.'
        });
      }
      const requiredCells = [...new Set([
        ...parsed.ambiguousMappings.map(item => item.sourceCell),
        ...parsed.invalidEntries.map(item => item.sourceCell)
      ].filter(Boolean))];
      const approvedCells = new Set(req.body.reviewedCells || []);
      const unapprovedCells = requiredCells.filter(cell => !approvedCells.has(cell));
      if (unapprovedCells.length) {
        return res.status(409).json({
          success: false,
          message: 'Review and acknowledge each ambiguous or incomplete workbook entry before replacement.',
          unapprovedCells
        });
      }
      const mappingDecisions = req.body.mappingDecisions || {};
      const unresolvedCategoryMappings = parsed.ambiguousMappings
        .filter(mapping => mapping.options?.length)
        .filter(mapping => !mapping.options.includes(mappingDecisions[mapping.sourceCell]));
      if (unresolvedCategoryMappings.length) {
        return res.status(409).json({
          success: false,
          message: 'Choose a category for each ambiguous category mapping before replacement.',
          unresolvedCells: unresolvedCategoryMappings.map(mapping => mapping.sourceCell)
        });
      }
      const result = await replaceCatalog(parsed, mappingDecisions);
      return res.json({
        success: true,
        imported: result.imported,
        skipped: [],
        ambiguousMappings: parsed.ambiguousMappings,
        duplicateCandidates: parsed.duplicateCandidates,
        invalidEntries: parsed.invalidEntries,
        unclassifiedEntries: parsed.unclassifiedEntries,
        backup: result.backup
      });
    });
  } catch (error) {
    return errorResponse(res, error);
  }
};
