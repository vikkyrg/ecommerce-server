import mongoose from './node_modules/mongoose/index.js';
import dotenv from './node_modules/dotenv/lib/main.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const files = await mongoose.connection.db.collection('images.files').find({}).toArray();
  console.log('Total files in images.files:', files.length);
  files.forEach(f => console.log('File:', f._id, f.filename, f.contentType, f.length));

  await mongoose.disconnect();
}
run();
