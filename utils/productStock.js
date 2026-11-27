export const INITIAL_PRODUCT_STOCK = 50;

export const isValidStockQuantity = value =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const parseStockQuantity = value => {
  const quantity = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!isValidStockQuantity(quantity)) {
    const error = new Error('Stock must be a non-negative integer');
    error.status = 400;
    throw error;
  }
  return quantity;
};

export const getStockStatus = value => {
  if (!isValidStockQuantity(value)) return 'Stock not set';
  if (value === 0) return 'Out of Stock';
  if (value <= 5) return 'Critical Stock';
  if (value <= 10) return 'Low Stock';
  return 'In Stock';
};
