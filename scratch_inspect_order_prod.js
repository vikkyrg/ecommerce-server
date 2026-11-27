import mongoose from './node_modules/mongoose/index.js';
import dotenv from './node_modules/dotenv/lib/main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  console.log('URI:', process.env.MONGODB_URI ? 'Exists' : 'Missing');
  await mongoose.connect(process.env.MONGODB_URI);

  const targetProd = await mongoose.connection.db.collection('products').findOne({
    _id: new mongoose.Types.ObjectId('6b0565d04ca772a17eb815c8')
  });
  console.log('Target Product in Order NSC-2026-83829:');
  console.log(JSON.stringify(targetProd, null, 2));

  const prods = await mongoose.connection.db.collection('products').find({}).limit(100).toArray();
  const withImg = prods.filter(p => p.image || (p.images && p.images.length > 0));
  console.log('Products with image in first 100:', withImg.length);
  withImg.slice(0, 10).forEach(p => console.log(p.name, 'image:', p.image, 'images:', p.images));

  await mongoose.disconnect();
}
run();
