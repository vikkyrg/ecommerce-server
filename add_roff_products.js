import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';
import { INITIAL_PRODUCT_STOCK } from './utils/productStock.js';

dotenv.config({ path: './server/.env' });

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const roffProducts = [
  {
    name: 'Roff T09 NSA Tile Adhesive',
    color: 'White',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'White - 20 Kg Bag', color: 'White', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T34 Starlike Epoxy Tile Grout',
    color: '',
    size: '',
    variants: [],
    notes: '12 options referenced; awaiting verification before publication'
  },
  {
    name: 'Roff T03 VFA Tile Adhesive',
    color: 'Grey',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'Grey - 20 Kg Bag', color: 'Grey', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T16 Cera Tile & Ceramic Cleaner',
    color: '',
    size: '',
    variants: [],
    notes: '2 options referenced; awaiting verification before publication'
  },
  {
    name: 'Roff Tiles Spacer',
    color: '',
    size: '100 Nos/Pack',
    unit: 'Pack',
    variants: [
      { name: '100 Nos/Pack', size: '100 Nos/Pack', unit: 'Pack' }
    ],
    notes: '3 options referenced; package: 100 Nos/Pack'
  },
  {
    name: 'Roff T20 Extrofix Ultra Tile Adhesive',
    color: 'White',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'White - 20 Kg Bag', color: 'White', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T04 VFA Tile Adhesive',
    color: 'White',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'White - 20 Kg Bag', color: 'White', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T07 Extrofix Tile Adhesive',
    color: 'Grey',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'Grey - 20 Kg Bag', color: 'Grey', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T06 VFA Tile Adhesive',
    color: 'White',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'White - 20 Kg Bag', color: 'White', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T02 NSA Tile Adhesive',
    color: 'Grey',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'Grey - 20 Kg Bag', color: 'Grey', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  },
  {
    name: 'Roff T01 NCA Tile Adhesive',
    color: 'Grey',
    size: '20 Kg Bag',
    weight: '20 Kg',
    unit: 'Bag',
    variants: [
      { name: 'Grey - 20 Kg Bag', color: 'Grey', size: '20 Kg Bag', weight: '20 Kg', unit: 'Bag' }
    ]
  }
];

export async function addRoffProducts() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB Atlas');

  // 1. Locate Category
  const categorySlug = 'tile-adhesives-and-epoxy-grouts';
  const category = await Category.findOne({
    $or: [
      { slug: categorySlug },
      { name: 'Tile Adhesives and Epoxy Grouts' }
    ]
  });

  if (!category) {
    throw new Error('Category "Tile Adhesives and Epoxy Grouts" not found!');
  }
  console.log(`Found Category: ${category.name} (${category._id})`);

  // 2. Locate or create ROFF Brand
  let brand = await Brand.findOne({
    $or: [{ name: 'ROFF' }, { slug: 'roff' }]
  });

  if (!brand) {
    brand = await Brand.create({
      name: 'ROFF',
      slug: 'roff',
      categories: [category._id],
      isActive: true
    });
    console.log(`Created Brand: ROFF (${brand._id})`);
  } else {
    if (!brand.categories.some(cId => String(cId) === String(category._id))) {
      brand.categories.push(category._id);
      await brand.save();
    }
    console.log(`Reused Brand: ROFF (${brand._id})`);
  }

  // 3. Insert or update the 11 products
  let createdCount = 0;
  let reusedCount = 0;
  let variantsCount = 0;

  for (const item of roffProducts) {
    const prodSlug = slugify(`${item.name}-${brand.name}`);
    let product = await Product.findOne({
      $or: [
        { slug: prodSlug },
        { name: item.name, brandRef: brand._id, categoryRef: category._id }
      ]
    });

    if (!product) {
      product = await Product.create({
        name: item.name,
        slug: prodSlug,
        brand: brand.name,
        brandRef: brand._id,
        category: category.slug,
        categoryRef: category._id,
        description: '',
        shortDescription: '',
        size: item.size || '',
        weight: item.weight || '',
        unit: item.unit || '',
        specifications: item.color ? { Colour: item.color, Package: item.size } : {},
        notes: item.notes || '',
        image: '', // Zero product images as specified
        imageId: null,
        productImages: [],
        variants: item.variants || [],
        price: null,
        mrp: null,
        stock: INITIAL_PRODUCT_STOCK,
        sku: '',
        isActive: true,
        inStock: true
      });
      createdCount++;
      if (item.variants?.length) variantsCount += item.variants.length;
      console.log(`[Created Product] ${product.name}`);
    } else {
      product.brand = brand.name;
      product.brandRef = brand._id;
      product.category = category.slug;
      product.categoryRef = category._id;
      product.size = item.size || '';
      product.weight = item.weight || '';
      product.unit = item.unit || '';
      if (item.color) {
        product.specifications = { Colour: item.color, Package: item.size };
      }
      product.variants = item.variants || [];
      product.notes = item.notes || '';
      product.isActive = true;
      await product.save();
      reusedCount++;
      console.log(`[Reused/Updated Product] ${product.name}`);
    }
  }

  // 4. Update category itemCount
  const totalCatProds = await Product.countDocuments({ categoryRef: category._id });
  category.itemCount = totalCatProds;
  await category.save();

  console.log(`\nCategory ${category.name} updated with total itemCount: ${totalCatProds}`);
  console.log(`ROFF Products Created: ${createdCount}, Reused: ${reusedCount}, Variants: ${variantsCount}`);
}

addRoffProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error adding ROFF products:', err);
    process.exit(1);
  });
