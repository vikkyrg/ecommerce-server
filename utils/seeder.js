import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { parseWebsiteExcel } from './catalogParser.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('Parsing WEBSITE.xlsx source of truth...');
    const { categories, brands, products } = parseWebsiteExcel();

    console.log(`Parsed: ${categories.length} Categories, ${brands.length} Brands, ${products.length} Products`);

    if (Category.db?.readyState === 1) {
      console.log('Syncing Categories into MongoDB...');
      for (const cat of categories) {
        await Category.findOneAndUpdate({ slug: cat.slug }, cat, { upsert: true, new: true });
      }

      console.log('Syncing Brands into MongoDB...');
      for (const b of brands) {
        await Brand.findOneAndUpdate({ slug: b.slug }, b, { upsert: true, new: true });
      }

      console.log('Syncing Products into MongoDB...');
      for (const p of products) {
        await Product.findOneAndUpdate({ slug: p.slug }, p, { upsert: true, new: true });
      }

      console.log('MongoDB catalog sync completed successfully!');
    } else {
      console.log('MongoDB not connected; local JSON fallback ready.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedDatabase();
