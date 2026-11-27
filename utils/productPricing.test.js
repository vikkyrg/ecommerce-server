import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductPricing, withOriginalPrice } from './productPricing.js';

test('calculates discounts and treats an equal or zero discount as no discount', () => {
  assert.deepEqual(parseProductPricing(2500, 2000), {
    originalPrice: 2500,
    price: 2500,
    discountPrice: 2000,
    discountPercentage: 20
  });
  assert.equal(parseProductPricing(2500, 2500).discountPrice, null);
  assert.equal(parseProductPricing(2500, 0).discountPercentage, null);
});

test('rejects invalid and over-regular prices', () => {
  assert.throws(() => parseProductPricing(0, null), /positive number/);
  assert.throws(() => parseProductPricing(-10, null), /non-negative number/);
  assert.throws(() => parseProductPricing(100, 101), /cannot be greater/);
});

test('normalizes legacy price fields without dropping the supplied percentage', () => {
  assert.deepEqual(withOriginalPrice({
    price: 35,
    discountPrice: 30,
    discountPercentage: 15
  }), {
    price: 35,
    originalPrice: 35,
    discountPrice: 30,
    discountPercentage: 15,
    discount: 15
  });
});
