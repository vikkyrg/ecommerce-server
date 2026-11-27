import assert from 'node:assert/strict';
import test from 'node:test';
import { getProductDescriptionCopy } from './productDescriptions.js';

test('generates editable category-specific copy using the individual product name', () => {
  const polisher = getProductDescriptionCopy({
    name: 'AGER',
    category: 'marble-and-granite-polishing-materials'
  });
  const adhesive = getProductDescriptionCopy({
    name: 'Roff T01 NCA Tile Adhesive',
    category: 'tile-adhesives-and-epoxy-grouts'
  });

  assert.match(polisher.shortDescription, /marble and granite surface care/);
  assert.match(polisher.description, /AGER/);
  assert.match(adhesive.shortDescription, /tile installation/);
  assert.match(adhesive.description, /Roff T01 NCA Tile Adhesive/);
  assert.notEqual(polisher.description, adhesive.description);
});

test('fails explicitly when a product name or category cannot be described', () => {
  assert.throws(() => getProductDescriptionCopy({ category: 'machines' }), /Product name is required/);
  assert.throws(() => getProductDescriptionCopy({ name: 'Unknown', category: 'diamond-core-bits' }), /No product description template/);
});
