import mongoose from './node_modules/mongoose/index.js';
import dotenv from './node_modules/dotenv/lib/main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Specific product images from GridFS
  const specificImages = {
    'Akemi Rust Remover': '/api/images/6b054dc877a7ed11969d76e7',
    'Akemi Stone Care Chemical System': '/api/images/6b054dc877a7ed11969d76e7',
    'DongCheng 02-110 Marble Cutter': '/api/images/6b054dc877a7ed11969d76ee',
    'DongCheng 03-110 Heavy Duty Marble Cutter': '/api/images/6b054dc977a7ed11969d76f4',
    'Heavy Duty PVC Flooring Protection Sheet': '/api/images/6b054dc977a7ed11969d76fe',
    'PVC FLOORING': '/api/images/6b054dc977a7ed11969d76fe',
    'PP Corrugated Floor Protection Sheets': '/api/images/6b054dca77a7ed11969d7703',
    'EPE Foam Roll Floor Cushion Protection': '/api/images/6b054dca77a7ed11969d7707',
    '305 ADHESIVE GREY 30 KG': '/api/images/6b054dc977a7ed11969d76f9'
  };

  const cats = await mongoose.connection.db.collection('categories').find({}).toArray();
  const catImageMap = {};
  cats.forEach(c => {
    if (c.image) {
      catImageMap[c.slug] = c.image;
      catImageMap[c.name.toLowerCase()] = c.image;
      if (c._id) catImageMap[String(c._id)] = c.image;
    }
  });

  const products = await mongoose.connection.db.collection('products').find({}).toArray();
  let updatedCount = 0;
  for (const p of products) {
    let img = specificImages[p.name] || p.image;
    if (!img || img === '' || img.includes('placeholder')) {
      img = catImageMap[p.category] ||
            catImageMap[(p.category || '').toLowerCase()] ||
            catImageMap[String(p.categoryRef)] ||
            '/api/images/6b054d20045a6920b5a19de3';
    }

    // Normalize any localhost absolute urls to relative paths so they work on both localhost & production
    if (img && img.includes('/api/images/')) {
      const idx = img.indexOf('/api/images/');
      img = img.slice(idx);
    }

    await mongoose.connection.db.collection('products').updateOne(
      { _id: p._id },
      { $set: { image: img } }
    );
    updatedCount++;
  }
  console.log(`Updated ${updatedCount} products with genuine image URLs.`);

  // Update existing orders to point to actual product images instead of placeholders
  const freshProducts = await mongoose.connection.db.collection('products').find({}).toArray();
  const prodMap = new Map(freshProducts.map(p => [String(p._id), p]));

  const orders = await mongoose.connection.db.collection('orders').find({}).toArray();
  let ordersFixed = 0;
  for (const o of orders) {
    const newItems = (o.orderItems || []).map(item => {
      const prod = prodMap.get(String(item.productId || item.product));
      let itemImg = item.image;
      if (!itemImg || itemImg.includes('placeholder') || itemImg === '') {
        itemImg = prod?.image ||
                  catImageMap[prod?.category] ||
                  '/api/images/6b054d20045a6920b5a19de3';
      }
      if (itemImg && itemImg.includes('/api/images/')) {
        itemImg = itemImg.slice(itemImg.indexOf('/api/images/'));
      }
      return {
        ...item,
        image: itemImg
      };
    });

    await mongoose.connection.db.collection('orders').updateOne(
      { _id: o._id },
      { $set: { orderItems: newItems } }
    );
    ordersFixed++;
  }
  console.log(`Updated ${ordersFixed} existing orders with genuine product images.`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
