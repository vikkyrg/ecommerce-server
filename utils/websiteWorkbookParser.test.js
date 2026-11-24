import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseWebsiteWorkbook } from './websiteWorkbookParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('extracts categories and brand headers from workbook formatting and positions', () => {
  const result = parseWebsiteWorkbook(path.join(__dirname, '../data/WEBSITE.xlsx'));

  assert.equal(result.workbook.sheetName, 'Sheet1');
  assert.equal(result.workbook.range, 'A4:R97');
  assert.equal(result.workbook.mergedCellCount, 0);
  assert.equal(result.summary.totalCategories, 6);
  assert.equal(result.summary.totalBrands, 23);
  assert.equal(result.categories[0].name, 'Marble and Granite Polishing Materials');
  assert.ok(result.brands.some(brand => brand.name === 'MYK LATICRETE'));
  assert.ok(result.brands.some(brand => brand.name === 'RAINBOW'));
});

test('preserves product names, specifications, supplier notes, and unset price/stock', () => {
  const result = parseWebsiteWorkbook(path.join(__dirname, '../data/WEBSITE.xlsx'));
  const tenax = result.products.find(product => product.name === 'AGER');
  const corrugatedSheets = result.products.find(product => product.name === 'PP CORRUGATED SHEETS');

  assert.equal(tenax.brand, 'TENAX');
  assert.equal(tenax.price, null);
  assert.equal(tenax.stock, null);
  assert.deepEqual(corrugatedSheets.variants.map(variant => variant.size), ['2MM', '3MM', '4MM', '5MM']);
  assert.equal(result.notes.some(note => note.text === 'CHECK HOMERUN, MATERIAL HUNT'), true);
  assert.equal(result.products.some(product => product.name.includes('CHECK HOMERUN')), false);
  assert.equal(result.summary.duplicateCandidates, 0);
});

test('surfaces incomplete and ambiguous source mappings instead of guessing', () => {
  const result = parseWebsiteWorkbook(path.join(__dirname, '../data/WEBSITE.xlsx'));

  assert.ok(result.invalidEntries.some(entry => entry.text === '307'));
  assert.ok(result.ambiguousMappings.some(mapping => mapping.sourceCell === 'C65'));
  assert.ok(result.ambiguousMappings.some(mapping => mapping.sourceCell === 'M9'));
  assert.ok(result.ambiguousMappings.some(mapping => mapping.sourceCell === 'E86'));
  assert.ok(result.products.some(product => !product.brand));
});
