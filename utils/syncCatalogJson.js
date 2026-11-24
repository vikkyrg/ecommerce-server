import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseWebsiteExcel } from './catalogParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const res = parseWebsiteExcel();
const dataDir = path.join(__dirname, '../data');

fs.writeFileSync(path.join(dataDir, 'categories.json'), JSON.stringify(res.categories, null, 2), 'utf8');
fs.writeFileSync(path.join(dataDir, 'brands.json'), JSON.stringify(res.brands, null, 2), 'utf8');
fs.writeFileSync(path.join(dataDir, 'products.json'), JSON.stringify(res.products, null, 2), 'utf8');

console.log(`[Success] Synced ${res.categories.length} categories, ${res.brands.length} brands, and ${res.products.length} products to data/*.json!`);
