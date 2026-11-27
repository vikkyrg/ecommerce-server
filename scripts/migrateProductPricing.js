import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Product from '../models/Product.js';
import { getProductDescriptionCopy } from '../utils/productDescriptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const seedPath = path.resolve(__dirname, '../data/productPricingSeed.json');
const seedRecords = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const applyChanges = process.argv.includes('--apply');
const pricingFields = ['price', 'originalPrice', 'discountPrice', 'discountPercentage', 'mrp'];

const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isConfiguredPrice = product => pricingFields.some(field => {
  const value = Number(product[field]);
  return product[field] !== null && product[field] !== undefined && product[field] !== '' &&
    Number.isFinite(value) && value > 0;
});

const emptyFieldFilter = field => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: 0 }
  ]
});

const missingPriceFilter = {
  $and: pricingFields.map(emptyFieldFilter)
};

const main = async () => {
  if (!Array.isArray(seedRecords) || seedRecords.length === 0) {
    throw new Error('Pricing seed data is empty or invalid');
  }
  if (applyChanges && process.argv.includes('--dry-run')) {
    throw new Error('Choose either --apply or --dry-run, not both');
  }

  const connected = await connectDB();
  if (!connected || Product.db?.readyState !== 1) {
    throw new Error('MongoDB is unavailable; product migration was not run');
  }

  const products = await Product.find({})
    .select('_id name category categoryRef brand price originalPrice discountPrice discountPercentage mrp shortDescription description image')
    .lean();
  const productsByName = new Map();
  for (const product of products) {
    const key = normalizeName(product.name);
    if (!productsByName.has(key)) productsByName.set(key, []);
    productsByName.get(key).push(product);
  }

  const report = {
    mode: applyChanges ? 'apply' : 'dry-run',
    productCount: products.length,
    sampleRows: seedRecords.length,
    matchedSampleRows: 0,
    matchedExistingProducts: 0,
    ambiguousNameMatches: [],
    productsWithPricesPlanned: [],
    productsWithPricesUpdated: [],
    skippedManualPrices: [],
    descriptionsPlanned: [],
    descriptionsUpdated: [],
    unmatchedSampleProducts: [],
    unlistedExistingProducts: [],
    descriptionErrors: []
  };
  const matchedIds = new Set();
  const seedNames = new Set();

  for (const sample of seedRecords) {
    const key = normalizeName(sample.name);
    seedNames.add(key);
    const matches = productsByName.get(key) || [];
    if (matches.length === 0) {
      report.unmatchedSampleProducts.push({
        name: sample.name,
        category: sample.category,
        reason: 'No existing product has this exact name'
      });
      continue;
    }

    report.matchedSampleRows += 1;
    if (matches.length > 1) {
      report.ambiguousNameMatches.push({
        name: sample.name,
        existingProductIds: matches.map(product => String(product._id))
      });
    }
    for (const product of matches) {
      const id = String(product._id);
      matchedIds.add(id);
      report.matchedExistingProducts += 1;

      let descriptions;
      try {
        descriptions = getProductDescriptionCopy(product);
      } catch (error) {
        report.descriptionErrors.push({ id, name: product.name, error: error.message });
      }

      const missingDescriptions = {};
      if (descriptions && !String(product.shortDescription || '').trim()) {
        missingDescriptions.shortDescription = descriptions.shortDescription;
      }
      if (descriptions && !String(product.description || '').trim()) {
        missingDescriptions.description = descriptions.description;
      }

      const hasManualPrice = isConfiguredPrice(product);
      const pricing = {
        price: sample.originalPrice,
        originalPrice: sample.originalPrice,
        discountPrice: sample.discountPrice,
        discountPercentage: sample.discountPercentage,
        mrp: sample.originalPrice,
        discount: sample.discountPercentage
      };

      if (hasManualPrice) {
        report.skippedManualPrices.push({ id, name: product.name });
      } else {
        report.productsWithPricesPlanned.push({
          id,
          name: product.name,
          originalPrice: sample.originalPrice,
          discountPrice: sample.discountPrice,
          discountPercentage: sample.discountPercentage
        });
      }

      if (Object.keys(missingDescriptions).length > 0) {
        report.descriptionsPlanned.push({ id, name: product.name, fields: Object.keys(missingDescriptions) });
      }

      if (!applyChanges) continue;

      if (!hasManualPrice) {
        const priceUpdate = await Product.updateOne(
          { _id: product._id, ...missingPriceFilter },
          { $set: pricing },
          { runValidators: true }
        );
        if (priceUpdate.modifiedCount === 1) {
          report.productsWithPricesUpdated.push({ id, name: product.name });
        } else {
          report.skippedManualPrices.push({ id, name: product.name, reason: 'Price changed after migration read' });
        }
      }

      if (Object.keys(missingDescriptions).length > 0) {
        const descriptionFilter = {
          _id: product._id,
          ...Object.fromEntries(Object.keys(missingDescriptions).map(field => [field, { $in: [null, ''] }]))
        };
        const descriptionUpdate = await Product.updateOne(
          descriptionFilter,
          { $set: missingDescriptions },
          { runValidators: true }
        );
        if (descriptionUpdate.modifiedCount === 1) {
          report.descriptionsUpdated.push({ id, name: product.name, fields: Object.keys(missingDescriptions) });
        }
      }
    }
  }

  for (const product of products) {
    if (!matchedIds.has(String(product._id)) && !seedNames.has(normalizeName(product.name))) {
      report.unlistedExistingProducts.push({ id: String(product._id), name: product.name });
      let descriptions;
      try {
        descriptions = getProductDescriptionCopy(product);
      } catch (error) {
        report.descriptionErrors.push({
          id: String(product._id),
          name: product.name,
          error: error.message
        });
        continue;
      }

      const missingDescriptions = {};
      if (!String(product.shortDescription || '').trim()) {
        missingDescriptions.shortDescription = descriptions.shortDescription;
      }
      if (!String(product.description || '').trim()) {
        missingDescriptions.description = descriptions.description;
      }
      if (Object.keys(missingDescriptions).length === 0) continue;

      report.descriptionsPlanned.push({
        id: String(product._id),
        name: product.name,
        fields: Object.keys(missingDescriptions)
      });
      if (applyChanges) {
        const descriptionFilter = {
          _id: product._id,
          ...Object.fromEntries(Object.keys(missingDescriptions).map(field => [field, { $in: [null, ''] }]))
        };
        const descriptionUpdate = await Product.updateOne(
          descriptionFilter,
          { $set: missingDescriptions },
          { runValidators: true }
        );
        if (descriptionUpdate.modifiedCount === 1) {
          report.descriptionsUpdated.push({
            id: String(product._id),
            name: product.name,
            fields: Object.keys(missingDescriptions)
          });
        }
      }
    }
  }

  const discountPercentageExceptions = seedRecords
    .filter(sample => Math.round(((sample.originalPrice - sample.discountPrice) / sample.originalPrice) * 100) !== sample.discountPercentage)
    .map(sample => ({ name: sample.name, suppliedPercentage: sample.discountPercentage }));
  console.log(JSON.stringify({
    ...report,
    pricePlanCount: report.productsWithPricesPlanned.length,
    descriptionPlanCount: report.descriptionsPlanned.length,
    unlistedExistingProductNames: report.unlistedExistingProducts.map(product => product.name),
    productsWithPricesPlanned: report.productsWithPricesPlanned,
    descriptionsPlanned: undefined,
    unlistedExistingProducts: undefined,
    discountPercentageExceptions
  }, null, 2));
};

try {
  await main();
} finally {
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
}
