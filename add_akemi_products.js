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

const akemiProducts = [
  {
    name: 'Akemi Rust Remover',
    description: 'Safe Rust Cleaner for Marble & Natural Stone'
  },
  {
    name: 'Akemi Pearl Impregnator',
    description: 'Water & Oil Repellent for Marble & Stone'
  },
  {
    name: 'Akemi Transformer MAX',
    description: 'Premium Color Enhancer & Stone Reviver'
  },
  {
    name: 'Akemi Crystal Clean',
    description: 'Daily Cleaner for Marble, Granite & Quartz'
  },
  {
    name: 'Akemi Waterclear / Crackbond',
    description: 'Transparent Epoxy Adhesive for Stone Repair'
  },
  {
    name: 'Akemi Nano Effect',
    description: 'Advanced Impregnator with Nanotechnology for Natural Stone'
  },
  {
    name: 'Akemi Akepox 1005',
    description: 'Transparent Epoxy Adhesive for Natural Stone'
  },
  {
    name: 'Akemi Stone Impregnation',
    description: 'Protective Sealer for Natural & Artificial Stone'
  },
  {
    name: 'Akemi Darkener Super',
    description: 'Color Enhancer for Granite & Natural Stone'
  },
  {
    name: 'Akemi Protector',
    description: 'Stain & Water Repellent Sealer for Natural Stone'
  },
  {
    name: 'Akemi Gelofix',
    description: 'Transparent Gel Epoxy Adhesive for Vertical Bonding'
  },
  {
    name: 'Akemi Stone Sill 200',
    description: 'Premium Colour Enhancer & Water Repellent for Stone'
  },
  {
    name: 'Akemi Akepox 5010 (2.25 Kg)',
    description: 'Component A & B Epoxy Adhesive'
  },
  {
    name: 'Akemi L-Spezial Cleaner',
    description: 'Deep Cleaner for Natural Stone & Tiles'
  },
  {
    name: 'Akemi Colour Tint Poly',
    description: 'Pigment Paste for Polyester Adhesives'
  },
  {
    name: 'Akemi Colour Tint',
    description: 'Pigment Paste for Akepox Epoxy Adhesives'
  },
  {
    name: 'Akemi Solid Wax Transparent',
    description: 'Polish Wax for Marble, Granite & Stone Surfaces'
  },
  {
    name: 'Akemi High Performance Floor Coating',
    description: 'Heavy Duty Epoxy Flooring System'
  },
  {
    name: 'ASN AKE Grit Pads and Buff',
    description: 'Marble & Granite Buffing Abrasive'
  }
];

export async function addAkemiProducts() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB Atlas');

  // 1. Locate Category
  const categorySlug = 'marble-and-granite-polishing-materials';
  const category = await Category.findOne({
    $or: [
      { slug: categorySlug },
      { name: 'Marble and Granite Polishing Materials' }
    ]
  });

  if (!category) {
    throw new Error('Category "Marble and Granite Polishing Materials" not found!');
  }
  console.log(`Found Category: ${category.name} (${category._id})`);

  // 2. Locate or create AKEMI Brand
  let brand = await Brand.findOne({
    $or: [{ name: 'AKEMI' }, { slug: 'akemi' }]
  });

  if (!brand) {
    brand = await Brand.create({
      name: 'AKEMI',
      slug: 'akemi',
      categories: [category._id],
      isActive: true
    });
    console.log(`Created Brand: AKEMI (${brand._id})`);
  } else {
    // Ensure category reference is present
    if (!brand.categories.some(cId => String(cId) === String(category._id))) {
      brand.categories.push(category._id);
      await brand.save();
    }
    console.log(`Reused Brand: AKEMI (${brand._id})`);
  }

  // 3. Insert or update the 19 products
  let createdCount = 0;
  let reusedCount = 0;

  for (const item of akemiProducts) {
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
        description: item.description,
        shortDescription: item.description,
        image: '', // Zero product images as specified
        imageId: null,
        productImages: [],
        variants: [],
        price: null,
        mrp: null,
        stock: INITIAL_PRODUCT_STOCK,
        sku: '',
        isActive: true,
        inStock: true
      });
      createdCount++;
      console.log(`[Created Product] ${product.name}`);
    } else {
      product.description = item.description;
      product.shortDescription = item.description;
      product.brand = brand.name;
      product.brandRef = brand._id;
      product.category = category.slug;
      product.categoryRef = category._id;
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
  console.log(`AKEMI Products Created: ${createdCount}, Reused: ${reusedCount}`);
}

addAkemiProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error adding AKEMI products:', err);
    process.exit(1);
  });
