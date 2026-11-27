import mongoose from './node_modules/mongoose/index.js';
import dotenv from './node_modules/dotenv/lib/main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const allProds = await mongoose.connection.db.collection('products').find({}).toArray();
  console.log('Total products in DB:', allProds.length);

  const withImg = allProds.filter(p => p.image && p.image.trim() !== '');
  console.log('Products with p.image non-empty:', withImg.length);
  withImg.slice(0, 10).forEach(p => console.log(' ->', p.name, 'img:', p.image));

  const withImgId = allProds.filter(p => p.imageId);
  console.log('Products with p.imageId:', withImgId.length);
  withImgId.slice(0, 5).forEach(p => console.log(' ->', p.name, 'imageId:', p.imageId));

  const withProdImages = allProds.filter(p => Array.isArray(p.productImages) && p.productImages.length > 0);
  console.log('Products with p.productImages:', withProdImages.length);

  // Check categories images
  const cats = await mongoose.connection.db.collection('categories').find({}).toArray();
  console.log('Categories count:', cats.length);
  cats.forEach(c => console.log('Cat:', c.name, 'image:', c.image));

  // Check GridFS or images collection
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in DB:', collections.map(c => c.name));

  await mongoose.disconnect();
}
run();
