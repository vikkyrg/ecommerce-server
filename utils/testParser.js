import { parseWebsiteExcel } from './catalogParser.js';

const res = parseWebsiteExcel();
console.log('Parsed Categories:', res.categories.length);
console.log('Parsed Brands:', res.brands.length);
console.log('Parsed Products:', res.products.length);
console.log('\nCategories:');
res.categories.forEach(c => console.log(`- ${c.name} (${c.slug})`));
console.log('\nBrands Count & Samples:');
res.brands.forEach(b => console.log(`- ${b.name} (${b.categories.join(', ')})`));
console.log('\nSample Products (first 5):');
res.products.slice(0, 5).forEach(p => console.log(`- [${p.brand}] ${p.name} (cat: ${p.category})`));
