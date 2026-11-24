import XLSX from 'xlsx';

const YELLOW = new Set(['FFFFFF00', 'FFFF00']);
const NON_BRAND_GROUPS = new Set([
  'polishig powdes -',
  'blades',
  'design blades marble',
  'diamond core bits for marble granite and tiles'
]);

const normalizeWhitespace = value => String(value ?? '').replace(/\s+/g, ' ').trim();

const slugify = value =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const titleCase = value =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, character => character.toUpperCase())
    .replace(/\b(And|Or|The|For|Of)\b/g, word => word.toLowerCase());

const normalizeBrandName = value => {
  return normalizeWhitespace(value).toUpperCase();
};

const getFill = cell => {
  const color = cell?.s?.fgColor;
  return String(color?.rgb || '').toUpperCase().replace(/^FF(?=[0-9A-F]{6}$)/, '');
};

const hasFill = (cell, colors) => colors.has(getFill(cell));

const splitItems = value =>
  normalizeWhitespace(value)
    .split(/[,;]+/)
    .map(normalizeWhitespace)
    .filter(Boolean);

const readCell = (sheet, row, column) => {
  const address = XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });
  const cell = sheet[address];
  return {
    address,
    row,
    column,
    cell,
    text: normalizeWhitespace(cell?.v)
  };
};

const cellHasText = entry => Boolean(entry.text);

const productRecord = ({ name, category, brand, source, subcategory = '', variants = [], warnings = [] }) => ({
  name: normalizeWhitespace(name),
  slug: slugify(`${category.slug}-${brand?.slug || 'unbranded'}-${name}`),
  sku: '',
  category: category.slug,
  categoryName: category.name,
  brand: brand?.name || '',
  brandSlug: brand?.slug || '',
  brandRef: null,
  description: '',
  price: null,
  stock: null,
  isActive: true,
  image: '',
  subcategory,
  variants: variants.map(value => ({
    name: normalizeWhitespace(value),
    size: normalizeWhitespace(value),
    unit: '',
    price: null,
    stock: null
  })),
  sourceCell: source.address,
  sourceText: source.originalText || source.text,
  notes: '',
  reviewRequired: warnings.length > 0,
  warnings
});

export const parseWebsiteWorkbook = filePath => {
  const workbook = XLSX.readFile(filePath, { cellStyles: true, cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no worksheets');

  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const yellow = [];
  const green = [];
  const entries = [];

  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    for (let column = range.s.c + 1; column <= range.e.c + 1; column += 1) {
      const entry = readCell(sheet, row, column);
      if (entry.cell) {
        entries.push(entry);
        if (hasFill(entry.cell, YELLOW)) yellow.push(entry);
        if (getFill(entry.cell) === 'B4E5A2') green.push(entry);
      }
    }
  }

  const categoryHeaders = yellow
    .filter(cellHasText)
    .map(entry => ({
      ...entry,
      sourceName: entry.text,
      name: titleCase(entry.text),
      slug: slugify(entry.text)
    }))
    .sort((a, b) => a.row - b.row || a.column - b.column);

  if (categoryHeaders.length === 0) {
    throw new Error('No yellow-highlighted category headings were found');
  }

  const categoryBySlug = new Map();
  for (const header of categoryHeaders) {
    if (!categoryBySlug.has(header.slug)) {
      categoryBySlug.set(header.slug, {
        name: header.name,
        slug: header.slug,
        description: '',
        image: '',
        isActive: true,
        sourceCells: []
      });
    }
    categoryBySlug.get(header.slug).sourceCells.push(header.address);
  }
  const categories = [...categoryBySlug.values()];

  const firstRowHeaders = categoryHeaders.filter(header => header.row === categoryHeaders[0].row);
  const horizontalHeaders = firstRowHeaders.length > 1 ? firstRowHeaders : [];
  const horizontalEndRow = categoryHeaders.find(header => header.row > categoryHeaders[0].row)?.row || Infinity;
  const categoryAt = entry => {
    if (horizontalHeaders.length > 1 && entry.row < horizontalEndRow) {
      let selected = horizontalHeaders[0];
      for (const header of horizontalHeaders) {
        if (entry.column >= header.column) selected = header;
      }
      return categoryBySlug.get(selected.slug);
    }
    let selected = categoryHeaders[0];
    for (const header of categoryHeaders) {
      if (header.row < entry.row || (header.row === entry.row && header.column <= entry.column)) {
        selected = header;
      }
    }
    return categoryBySlug.get(selected.slug);
  };

  const brandHeaders = green
    .filter(cellHasText)
    .filter(entry => !NON_BRAND_GROUPS.has(entry.text.toLowerCase()))
    .filter(entry => categoryAt(entry)?.slug !== 'floor-covering-materials')
    .map(entry => {
      const category = categoryAt(entry);
      const name = normalizeBrandName(entry.text);
      return {
        ...entry,
        name,
        slug: slugify(name),
        category,
        sourceName: entry.text
      };
    });

  const brandsByKey = new Map();
  const brandForHeader = new Map();
  for (const header of brandHeaders) {
    const key = header.slug;
    if (!brandsByKey.has(key)) {
      brandsByKey.set(key, {
        name: header.name,
        slug: header.slug,
        description: '',
        logo: '',
        categories: [],
        sourceCells: []
      });
    }
    const brand = brandsByKey.get(key);
    if (!brand.categories.includes(header.category.slug)) brand.categories.push(header.category.slug);
    brand.sourceCells.push(header.address);
    brandForHeader.set(header.address, brand);
  }

  const notes = [];
  const products = [];
  const invalidEntries = [];
  const ambiguousMappings = [];
  for (const header of brandHeaders) {
    const spellingReview = {
      KERAKOL: 'KERAKOLL',
      MAPIE: 'MAPEI'
    }[header.name];
    if (spellingReview) {
      ambiguousMappings.push({
        sourceCell: header.address,
        brandName: header.name,
        issue: `Workbook spelling may be intended as "${spellingReview}"; source spelling is preserved pending confirmation.`
      });
    }
  }
  const groupHeaders = green
    .filter(cellHasText)
    .filter(entry => NON_BRAND_GROUPS.has(entry.text.toLowerCase()));

  const nearestBrand = entry => {
    const possible = brandHeaders
      .filter(header => header.category.slug === categoryAt(entry)?.slug)
      .filter(header => header.row <= entry.row)
      .sort((a, b) => b.row - a.row);
    for (const header of possible) {
      const laterGroup = groupHeaders.some(group =>
        group.row > header.row &&
        group.row <= entry.row &&
        categoryAt(group)?.slug === header.category.slug
      );
      if (!laterGroup) return brandForHeader.get(header.address);
      break;
    }
    return null;
  };

  const currentGroup = entry => {
    const candidates = groupHeaders
      .filter(group => group.row <= entry.row && categoryAt(group)?.slug === categoryAt(entry)?.slug)
      .sort((a, b) => b.row - a.row);
    return candidates[0]?.text || '';
  };

  const potentialBrandWords = [
    { pattern: /\bklindex\b/i, name: 'KLINDEX' },
    { pattern: /\btechqnique\b/i, name: 'TECHQNIQUE' },
    { pattern: /\bfevikwik\b/i, name: 'FEVIKWIK' },
    { pattern: /\bmy\s*t\s*look\b/i, name: 'MY T LOOK' },
    { pattern: /\bmansion\b/i, name: 'MANSION' },
    { pattern: /\bwilliam\b/i, name: 'WILLIAM' },
    { pattern: /\bhikoki\b/i, name: 'HiKOKI' }
  ];

  const addSimpleProducts = (entry, brand, category, subcategory = '') => {
    processedCells.add(entry.address);
    const segments = splitItems(entry.text);
    for (const name of segments) {
      const warnings = [];
      if (/^\d{1,4}$/.test(name)) {
        warnings.push('Entry is numeric-only and may be an incomplete product name.');
        invalidEntries.push({
          sourceCell: entry.address,
          text: name,
          reason: 'Incomplete numeric-only product name'
        });
      }
      const embeddedBrand = potentialBrandWords.find(candidate => candidate.pattern.test(name));
      if (!brand && embeddedBrand) {
        const warning = `Possible brand "${embeddedBrand.name}" appears in the source text; brand assignment is unconfirmed.`;
        warnings.push(warning);
        ambiguousMappings.push({
          sourceCell: entry.address,
          productName: name,
          issue: warning
        });
      }
      products.push(productRecord({
        name,
        category,
        brand,
        source: { ...entry, text: name, originalText: entry.text },
        subcategory,
        warnings
      }));
      processedCells.add(entry.address);
    }
  };

  const addVariantProduct = (entry, category, subcategory, variants, warnings = []) => {
    processedCells.add(entry.address);
    const brand = nearestBrand(entry);
    products.push(productRecord({
      name: entry.text,
      category,
      brand,
      source: entry,
      subcategory,
      variants,
      warnings
    }));
    for (const warning of warnings) {
      ambiguousMappings.push({
        sourceCell: entry.address,
        productName: entry.text,
        issue: warning
      });
    }
  };

  const notePattern = /\bcheck\b|\benterprise\b|\bent\.?\b|\bmaterial hunt\b/i;
  const brandHeaderCells = new Set(brandHeaders.map(header => header.address));
  const groupHeaderCells = new Set(groupHeaders.map(header => header.address));
  const handledCells = new Set([...brandHeaderCells, ...groupHeaderCells]);
  const processedCells = new Set(handledCells);

  for (const entry of entries) {
    if (!entry.text || handledCells.has(entry.address) || hasFill(entry.cell, YELLOW)) continue;
    const category = categoryAt(entry);
    if (!category) continue;

    if (notePattern.test(entry.text)) {
      const brand = nearestBrand(entry);
      notes.push({
        sourceCell: entry.address,
        text: entry.text,
        category: category.slug,
        brand: brand?.name || '',
        type: 'supplier-or-review-note'
      });
      processedCells.add(entry.address);
      continue;
    }

    if (category.slug === 'floor-covering-materials') {
      if (getFill(entry.cell) === 'B4E5A2') {
        const relatedSizeCells = entries.filter(candidate =>
          candidate.row === entry.row &&
          candidate.column > entry.column &&
          candidate.text &&
          !hasFill(candidate.cell, new Set(['B4E5A2', 'FFFF00']))
        );
        const sizeText = relatedSizeCells.map(candidate => candidate.text).join(', ');
        const variants = splitItems(sizeText.replace(/^size\s*[-:]\s*/i, ''));
        const warnings = [];
        if (entry.text.toLowerCase() === 'foam tape' && /1["″]\s*2["″]/i.test(sizeText)) {
          warnings.push('Size cell has no separator between 1-inch and 2-inch values; raw text is preserved.');
          ambiguousMappings.push({
            sourceCell: relatedSizeCells[0]?.address || entry.address,
            productName: entry.text,
            issue: warnings[0]
          });
          variants.splice(0, variants.length, sizeText);
        }
        if (/gum tape.*william/i.test(entry.text)) {
          warnings.push('Possible WILLIAM brand is embedded in the item name; brand assignment is unconfirmed.');
          ambiguousMappings.push({
            sourceCell: entry.address,
            productName: entry.text,
            issue: warnings[0]
          });
        }
        products.push(productRecord({
          name: entry.text,
          category,
          source: entry,
          variants,
          warnings
        }));
        relatedSizeCells.forEach(sizeCell => {
          handledCells.add(sizeCell.address);
          processedCells.add(sizeCell.address);
        });
      }
      continue;
    }

    if (category.slug === 'marble-and-granite-cutting-accessories' && entry.row === 57) {
      const group = groupHeaders.find(header => header.row === 57);
      if (!group) continue;
      const variantCells = entries.filter(candidate =>
        candidate.row === 57 &&
        candidate.column > group.column &&
        candidate.text &&
        !hasFill(candidate.cell, new Set(['B4E5A2', 'FFFF00']))
      );
      const variants = variantCells.flatMap(candidate => splitItems(candidate.text));
      addVariantProduct(group, category, 'Design blades marble', variants);
      variantCells.forEach(variantCell => {
        handledCells.add(variantCell.address);
        processedCells.add(variantCell.address);
      });
      continue;
    }

    if (category.slug === 'machines' && entry.row === 65) {
      const group = groupHeaders.find(header => header.row === 65);
      if (!group) continue;
      const sizeCells = entries.filter(candidate =>
        candidate.row === entry.row &&
        candidate.column > group.column &&
        candidate.text &&
        !hasFill(candidate.cell, new Set(['B4E5A2', 'FFFF00']))
      );
      const sizeText = sizeCells.map(candidate => candidate.text).join(', ').replace(/^sizes?\s*[-:]+\s*/i, '');
      const variants = splitItems(sizeText);
      const warning = 'Category is inferred from worksheet position under Machines; this may belong to Marble and Granite Cutting Accessories.';
      addVariantProduct(group, category, 'Diamond core bits', variants, [warning]);
      ambiguousMappings[ambiguousMappings.length - 1].options = [
        'Machines',
        'Marble and Granite Cutting Accessories'
      ];
      sizeCells.forEach(sizeCell => {
        handledCells.add(sizeCell.address);
        processedCells.add(sizeCell.address);
      });
      if (variants.some(variant => /:\s*\.?$/.test(variant))) {
        invalidEntries.push({
          sourceCell: sizeCells.find(sizeCell => sizeCell.text.includes('2.1/4'))?.address || entry.address,
          text: variants.find(variant => /:\s*\.?$/.test(variant)),
          reason: 'Malformed size/specification; preserved for review'
        });
      }
      continue;
    }

    if (category.slug === 'marble-and-granite-polishing-materials' && entry.row === 46) {
      addSimpleProducts(entry, null, category, 'Polishing powders');
      continue;
    }

    if (category.slug === 'marble-and-granite-cutting-accessories' && entry.row >= 51 && entry.row <= 56) {
      const brand = nearestBrand(entry);
      if (brand) addSimpleProducts(entry, brand, category, currentGroup(entry));
      continue;
    }

    if (category.slug === 'machines' && entry.row === 63) {
      addSimpleProducts(entry, null, category, '');
    } else if (category.slug === 'machines' && entry.row >= 60 && entry.row <= 62) {
      const brand = nearestBrand(entry);
      if (brand) addSimpleProducts(entry, brand, category, currentGroup(entry));
    } else if (category.slug === 'other-items' && entry.row >= 90) {
      addSimpleProducts(entry, null, category, '');
    } else {
      const brand = nearestBrand(entry);
      if (brand) addSimpleProducts(entry, brand, category, currentGroup(entry));
    }
  }

  const unclassifiedEntries = entries
    .filter(entry =>
      entry.text &&
      !processedCells.has(entry.address) &&
      !hasFill(entry.cell, YELLOW) &&
      getFill(entry.cell) !== 'B4E5A2'
    )
    .map(entry => ({
      sourceCell: entry.address,
      text: entry.text,
      category: categoryAt(entry)?.name || '',
      reason: 'Populated cell was not confidently classified as a category, brand, product, or supplier note'
    }));

  const productKeys = new Map();
  const duplicateCandidates = [];
  for (const product of products) {
    const key = [
      product.category,
      product.brandSlug || '',
      product.name.toLowerCase().replace(/\s+/g, ' ')
    ].join('|');
    if (productKeys.has(key)) {
      duplicateCandidates.push({
        firstSourceCell: productKeys.get(key),
        sourceCell: product.sourceCell,
        productName: product.name,
        brand: product.brand
      });
    } else {
      productKeys.set(key, product.sourceCell);
    }
  }

  for (const duplicate of duplicateCandidates) {
    const product = products.find(candidate => candidate.sourceCell === duplicate.sourceCell);
    if (product) {
      product.reviewRequired = true;
      product.warnings.push('Duplicate candidate in the same category and brand; not merged.');
    }
  }

  return {
    workbook: {
      fileName: filePath.split(/[\\/]/).pop(),
      sheetName,
      range: sheet['!ref'],
      mergedCellCount: (sheet['!merges'] || []).length,
      categoryHeaderCells: categoryHeaders.map(({ address, sourceName }) => ({ address, text: sourceName })),
      brandHeaderCells: brandHeaders.map(({ address, sourceName, category }) => ({
        address,
        text: sourceName,
        category: category.name
      }))
    },
    categories,
    brands: [...brandsByKey.values()],
    products,
    notes,
    ambiguousMappings,
    duplicateCandidates,
    invalidEntries,
    unclassifiedEntries,
    summary: {
      totalCategories: categories.length,
      totalBrands: brandsByKey.size,
      totalProducts: products.length,
      productsWithoutIdentifiableBrand: products.filter(product => !product.brand).length,
      ambiguousMappings: ambiguousMappings.length,
      duplicateCandidates: duplicateCandidates.length,
      invalidOrIncompleteEntries: invalidEntries.length,
      unclassifiedEntries: unclassifiedEntries.length,
      productsRequiringReview: products.filter(product => product.reviewRequired).length
    }
  };
};
