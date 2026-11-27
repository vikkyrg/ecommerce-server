import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Product from '../models/Product.js';
import { INITIAL_PRODUCT_STOCK, isValidStockQuantity } from '../utils/productStock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const applyChanges = process.argv.includes('--apply');
if (applyChanges && process.argv.includes('--dry-run')) {
  throw new Error('Choose either --apply or --dry-run, not both');
}

const main = async () => {
  const connected = await connectDB();
  if (!connected || Product.db?.readyState !== 1) {
    throw new Error('MongoDB is unavailable; stock migration was not run');
  }

  const products = await Product.collection
    .find({}, { projection: { _id: 1, name: 1, stock: 1 } })
    .toArray();
  const invalidProducts = products.filter(product => !isValidStockQuantity(product.stock));
  const updatedProducts = [];
  const skippedProducts = [];

  if (applyChanges) {
    for (const product of invalidProducts) {
      const filter = { _id: product._id };
      if (Object.prototype.hasOwnProperty.call(product, 'stock')) {
        filter.stock = product.stock;
      } else {
        filter.stock = { $exists: false };
      }

      const result = await Product.collection.updateOne(filter, {
        $set: { stock: INITIAL_PRODUCT_STOCK }
      });
      if (result.modifiedCount === 1) {
        updatedProducts.push({ id: String(product._id), name: product.name });
      } else {
        skippedProducts.push({ id: String(product._id), name: product.name });
      }
    }
  }

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    totalProducts: products.length,
    validStockPreserved: products.length - invalidProducts.length,
    invalidStockFound: invalidProducts.length,
    initialStock: INITIAL_PRODUCT_STOCK,
    productsToUpdate: invalidProducts.map(product => ({
      id: String(product._id),
      name: product.name,
      stock: product.stock === undefined ? 'missing' : product.stock
    })),
    updatedCount: updatedProducts.length,
    skippedDueToConcurrentChange: skippedProducts
  }, null, 2));
};

try {
  await main();
} catch (error) {
  console.error(`[Stock migration] ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
