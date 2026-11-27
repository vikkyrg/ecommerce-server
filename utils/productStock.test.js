import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_PRODUCT_STOCK,
  getStockStatus,
  isValidStockQuantity,
  parseStockQuantity
} from './productStock.js';

test('preserves only non-negative safe integer stock values', () => {
  for (const valid of [0, 1, 50, 100]) {
    assert.equal(isValidStockQuantity(valid), true);
  }
  for (const invalid of [null, undefined, '50', -1, 1.5, Number.NaN, Infinity]) {
    assert.equal(isValidStockQuantity(invalid), false);
  }
  assert.equal(INITIAL_PRODUCT_STOCK, 50);
});

test('validates stock updates as non-negative integers', () => {
  assert.equal(parseStockQuantity(0), 0);
  assert.equal(parseStockQuantity('75'), 75);
  assert.throws(() => parseStockQuantity(-1), { status: 400 });
  assert.throws(() => parseStockQuantity('1.5'), { status: 400 });
  assert.throws(() => parseStockQuantity(''), { status: 400 });
});

test('maps quantities to requested inventory statuses', () => {
  assert.equal(getStockStatus(0), 'Out of Stock');
  assert.equal(getStockStatus(1), 'Critical Stock');
  assert.equal(getStockStatus(5), 'Critical Stock');
  assert.equal(getStockStatus(6), 'Low Stock');
  assert.equal(getStockStatus(10), 'Low Stock');
  assert.equal(getStockStatus(11), 'In Stock');
  assert.equal(getStockStatus(50), 'In Stock');
});
