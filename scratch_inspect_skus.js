import mongoose from './node_modules/mongoose/index.js';
import dotenv from './node_modules/dotenv/lib/main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const skus = ['NSC-AKE-1488', 'NSC-DON-3630', 'NSC-DON-6077', 'NSC-MYK-6173', 'NSC-NS-1736', 'NSC-NS-6252', 'NSC-NS-3866'];
  for (const sku of skus) {
    const p = await mongoose.connection.db.collection('products').findOne({
      $or: [
        { sku: sku },
        { sku: new RegExp(sku.replace('NSC-', ''), 'i') },
        { name: new RegExp(sku.split('-')[1], 'i') }
      ]
    });
    console.log('SKU:', sku, p ? { name: p.name, image: p.image, sku: p.sku, category: p.category } : 'NOT FOUND');
  }

  // Also check products whose name matches Roff
  const roff = await mongoose.connection.db.collection('products').find({ name: /roff/i }).toArray();
  console.log('Roff products:', roff.length);
  roff.forEach(r => console.log(' ->', r.name, 'img:', r.image, 'category:', r.category));

  await mongoose.disconnect();
}
run();
