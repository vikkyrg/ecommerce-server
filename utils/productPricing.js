export const optionalNumber = (value, label, { integer = false } = {}) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    const error = new Error(`${label} must be a non-negative ${integer ? 'integer' : 'number'}`);
    error.status = 400;
    throw error;
  }
  return number;
};

export const parseProductPricing = (originalPriceInput, discountPriceInput) => {
  const originalPrice = optionalNumber(originalPriceInput, 'Product Price');
  if (originalPrice === null || originalPrice <= 0) {
    const error = new Error('Product Price is required and must be a positive number');
    error.status = 400;
    throw error;
  }

  let discountPrice = optionalNumber(discountPriceInput, 'Discount Price');
  if (discountPrice !== null && discountPrice > originalPrice) {
    const error = new Error('Discount Price cannot be greater than Product Price');
    error.status = 400;
    throw error;
  }

  if (discountPrice === 0 || discountPrice === originalPrice) discountPrice = null;
  const discountPercentage = discountPrice === null
    ? null
    : Math.round(((originalPrice - discountPrice) / originalPrice) * 100);

  return { originalPrice, price: originalPrice, discountPrice, discountPercentage };
};

export const withOriginalPrice = product => {
  const rawOriginalPrice = product.originalPrice ?? product.price;
  const parsedOriginalPrice = Number(rawOriginalPrice);
  const originalPrice = rawOriginalPrice != null &&
    rawOriginalPrice !== '' &&
    Number.isFinite(parsedOriginalPrice) &&
    parsedOriginalPrice > 0
    ? parsedOriginalPrice
    : null;

  const parsedDiscountPrice = Number(product.discountPrice);
  const discountPrice = originalPrice !== null &&
    product.discountPrice != null &&
    product.discountPrice !== '' &&
    Number.isFinite(parsedDiscountPrice) &&
    parsedDiscountPrice > 0 &&
    parsedDiscountPrice < originalPrice
    ? parsedDiscountPrice
    : null;
  const parsedStoredPercentage = Number(product.discountPercentage);
  const discountPercentage = discountPrice === null
    ? null
    : product.discountPercentage != null &&
      Number.isFinite(parsedStoredPercentage) &&
      parsedStoredPercentage > 0 &&
      parsedStoredPercentage <= 100
      ? parsedStoredPercentage
      : Math.round(((originalPrice - discountPrice) / originalPrice) * 100);

  return {
    ...product,
    price: originalPrice,
    originalPrice,
    discountPrice,
    discountPercentage,
    discount: discountPercentage ?? 0
  };
};
