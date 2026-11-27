import test from 'node:test';
import assert from 'node:assert/strict';
import { changeProductStock } from './inventoryService.js';

const fakeProductModel = initialStock => {
  const products = new Map(
    Object.entries(initialStock).map(([id, stock]) => [id, { _id: id, stock, inStock: stock > 0 }])
  );
  return {
    products,
    findById: id => ({
      select: () => ({
        lean: async () => products.get(String(id))
      })
    }),
    collection: {
      updateOne: async (filter, pipeline) => {
        const product = products.get(String(filter._id));
        if (!product || !Number.isSafeInteger(product.stock)) return { matchedCount: 0 };
        if (filter.stock?.$gte !== undefined && product.stock < filter.stock.$gte) {
          return { matchedCount: 0 };
        }

        const expression = pipeline[0].$set.stock;
        const [left, quantity] = expression.$subtract || expression.$add;
        product.stock = expression.$subtract
          ? product.stock - quantity
          : product.stock + quantity;
        product.inStock = product.stock > 0;
        return { matchedCount: 1 };
      }
    }
  };
};

test('multi-product stock deduction rolls back earlier updates when any item is short', async () => {
  const Product = fakeProductModel({ a: 10, b: 2 });
  await assert.rejects(
    changeProductStock(Product, [
      { productId: 'a', productName: 'Product A', quantity: 3, stock: 10 },
      { productId: 'b', productName: 'Product B', quantity: 4, stock: 2 }
    ], 'deduct'),
    error => error.status === 409
  );
  assert.equal(Product.products.get('a').stock, 10);
  assert.equal(Product.products.get('b').stock, 2);
});

test('conditional deductions prevent simultaneous orders from overselling', async () => {
  const Product = fakeProductModel({ a: 5 });
  const change = { productId: 'a', productName: 'Product A', quantity: 4, stock: 5 };
  const results = await Promise.allSettled([
    changeProductStock(Product, [change], 'deduct'),
    changeProductStock(Product, [change], 'deduct')
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Product.products.get('a').stock, 1);
});
