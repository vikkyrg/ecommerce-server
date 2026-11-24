import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Product from './models/Product.js';
import Category from './models/Category.js';

async function inspectData() {
  await connectDB();
  console.log('DB connected');

  const categories = await Category.find({}).lean();
  console.log('\n--- CATEGORIES IN DB ---');
  categories.forEach(c => {
    console.log(`ID: ${c._id} | Name: "${c.name}" | Slug: "${c.slug}"`);
  });

  const products = await Product.find({}).limit(5).lean();
  console.log('\n--- SAMPLE 5 PRODUCTS IN DB ---');
  products.forEach(p => {
    console.log(`Product: "${p.name}"`);
    console.log(`  category field:`, typeof p.category, JSON.stringify(p.category));
    console.log(`  categoryRef:`, p.categoryRef);
  });

  const distinctCategories = await Product.distinct('category');
  console.log('\n--- DISTINCT product.category VALUES IN DB ---');
  console.log(distinctCategories);

  const distinctCategoryRefs = await Product.distinct('categoryRef');
  console.log('\n--- DISTINCT product.categoryRef VALUES IN DB ---');
  console.log(distinctCategoryRefs);

  process.exit(0);
}

inspectData().catch(e => {
  console.error(e);
  process.exit(1);
});
