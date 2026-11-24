import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';

dotenv.config({ path: './server/.env' });

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const aralditeProducts = [
  {
    name: 'Araldite Klear 5 Epoxy Adhesive',
    size: '450 Grams',
    variants: [
      { name: '450 Grams', size: '450 Grams' }
    ]
  },
  {
    name: 'Araldite Standard Epoxy Adhesive',
    size: '',
    variants: []
  },
  {
    name: 'Araldite Klad X',
    size: '1.5 KG',
    variants: [
      { name: '1.5 KG', size: '1.5 KG', weight: '1.5 KG' }
    ]
  },
  {
    name: 'Araldite Klear 120',
    size: '180G',
    variants: [
      { name: '180G', size: '180G', weight: '180G' }
    ]
  },
  {
    name: 'Araldite Klear 20',
    size: '250G',
    variants: [
      { name: '250G', size: '250G', weight: '250G' }
    ]
  },
  {
    name: 'Araldite Klad Pro Epoxy Adhesive',
    size: '4 KG',
    variants: [
      { name: '4 KG', size: '4 KG', weight: '4 KG' }
    ]
  }
];

export async function addAralditeProducts() {
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

  // 2. Locate or create ARALDITE Brand
  let brand = await Brand.findOne({
    $or: [{ name: 'ARALDITE' }, { slug: 'araldite' }]
  });

  if (!brand) {
    brand = await Brand.create({
      name: 'ARALDITE',
      slug: 'araldite',
      categories: [category._id],
      isActive: true
    });
    console.log(`Created Brand: ARALDITE (${brand._id})`);
  } else {
    if (!brand.categories.some(cId => String(cId) === String(category._id))) {
      brand.categories.push(category._id);
      await brand.save();
    }
    console.log(`Reused Brand: ARALDITE (${brand._id})`);
  }

  // 3. Insert or update the 6 products
  let createdCount = 0;
  let reusedCount = 0;
  let variantsCount = 0;

  for (const item of aralditeProducts) {
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
        image: '', // Zero product images as specified
        imageId: null,
        productImages: [],
        variants: item.variants || [],
        price: null,
        mrp: null,
        stock: null,
        sku: '',
        isActive: true,
        inStock: null
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
      product.variants = item.variants || [];
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
  console.log(`ARALDITE Products Created: ${createdCount}, Reused: ${reusedCount}, Variants: ${variantsCount}`);
}

addAralditeProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error adding ARALDITE products:', err);
    process.exit(1);
  });
