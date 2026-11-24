import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseWebsiteExcel } from '../utils/catalogParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const res = parseWebsiteExcel();
const clientCatalogPath = path.join(__dirname, '../../client/src/data/catalogData.js');

const jsContent = `// Auto-generated dynamic catalog data from WEBSITE.xlsx source of truth
export const categories = ${JSON.stringify(res.categories, null, 2)};

export const brands = ${JSON.stringify(res.brands, null, 2)};

export const products = ${JSON.stringify(res.products, null, 2)};

export const filterProducts = ({ category, search, brand, sort } = {}) => {
  let result = [...products];

  if (category && category !== 'all' && category !== 'All Products' && category !== 'All Categories') {
    const catLower = category.toLowerCase().trim();
    result = result.filter(
      p =>
        (p.category && p.category.toLowerCase() === catLower) ||
        (p.category && p.category.toLowerCase().replace(/[^a-z0-9]+/g, '-') === catLower)
    );
  }

  if (brand && brand !== 'all' && brand !== 'All Brands') {
    const bLower = brand.toLowerCase().trim();
    result = result.filter(p => p.brand && p.brand.toLowerCase() === bLower);
  }

  if (search && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    result = result.filter(
      p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }

  if (sort === 'price-low') {
    result.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sort === 'price-high') {
    result.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sort === 'name') {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else {
    // Default: prioritize featured & rating
    result.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }

  return result;
};
`;

fs.writeFileSync(clientCatalogPath, jsContent, 'utf8');
console.log(`[Success] client/src/data/catalogData.js updated with ${res.categories.length} categories, ${res.brands.length} brands, and ${res.products.length} products!`);
