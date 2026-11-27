const transactionNotSupported = error =>
  error.code === 20 ||
  /transaction numbers are only allowed|does not support transactions|not a replica set|replica set member or mongos/i.test(error.message || '');

export const runWithInventoryTransaction = async (connection, operation, fallback) => {
  const session = await connection.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result;
    } catch (error) {
      if (!transactionNotSupported(error)) throw error;
      return await fallback();
    }
  } finally {
    await session.endSession();
  }
};

const stockError = (change, available) => {
  const error = new Error(`Only ${available} units are currently available for ${change.productName}.`);
  error.status = 409;
  return error;
};

const updateOneStock = async (Product, change, direction, session) => {
  const quantityExpression = direction === 'deduct'
    ? { $subtract: ['$stock', change.quantity] }
    : { $add: ['$stock', change.quantity] };
  const filter = { _id: change.productId, stock: { $type: 'number' } };
  if (direction === 'deduct') filter.stock.$gte = change.quantity;

  const options = session ? { session } : {};
  const result = await Product.collection.updateOne(filter, [{
    $set: {
      stock: quantityExpression,
      inStock: { $gt: [quantityExpression, 0] }
    }
  }], options);

  if (result.matchedCount === 1) return;
  if (direction === 'restore') {
    const error = new Error(`Unable to restore inventory for ${change.productName}.`);
    error.status = 500;
    throw error;
  }

  let available = change.stock;
  if (!session) {
    const currentProduct = await Product.findById(change.productId).select('stock').lean();
    available = Number.isSafeInteger(currentProduct?.stock) ? currentProduct.stock : 0;
  }
  throw stockError(change, available);
};

export const changeProductStock = async (Product, changes, direction, session = null) => {
  const applied = [];
  try {
    for (const change of changes) {
      await updateOneStock(Product, change, direction, session);
      applied.push(change);
    }
    return applied;
  } catch (error) {
    if (session || applied.length === 0) throw error;

    try {
      const rollbackDirection = direction === 'deduct' ? 'restore' : 'deduct';
      for (const change of applied.reverse()) {
        await updateOneStock(Product, change, rollbackDirection, null);
      }
    } catch (rollbackError) {
      const failure = new Error(
        `Inventory update failed and rollback was incomplete: ${rollbackError.message}`
      );
      failure.status = 500;
      throw failure;
    }
    throw error;
  }
};
