const descriptionByCategory = {
  'marble-and-granite-polishing-materials': {
    name: 'Marble and Granite Polishing Materials',
    short: 'Professional stone polishing and maintenance material designed for marble and granite surface care.',
    overview: 'stone polishing and maintenance for marble and granite surfaces',
    applications: 'marble and granite surface care and related stone-maintenance work'
  },
  'tile-adhesives-and-epoxy-grouts': {
    name: 'Tile Adhesives and Epoxy Grouts',
    short: 'Construction material designed for tile installation, bonding and joint finishing.',
    overview: 'tile installation, bonding or joint finishing, as indicated by its product name',
    applications: 'tile installation and joint-finishing projects where the product label confirms suitability'
  },
  'marble-and-granite-cutting-accessories': {
    name: 'Marble and Granite Cutting Accessories',
    short: 'Professional cutting accessory designed for marble, granite and ceramic cutting applications.',
    overview: 'cutting work involving stone or ceramic materials, as indicated by its product name',
    applications: 'marble, granite or ceramic cutting work when confirmed suitable for the tool and material'
  },
  machines: {
    name: 'Machines and Equipment',
    short: 'Professional equipment designed for construction, cutting, drilling, grinding and polishing applications.',
    overview: 'construction or workshop work associated with its listed equipment type',
    applications: 'construction and workshop tasks appropriate to the named machine'
  },
  'floor-covering-materials': {
    name: 'Floor Covering Materials',
    short: 'Practical flooring and surface protection material for construction and interior finishing work.',
    overview: 'floor covering, surface protection or interior finishing, as indicated by its product name',
    applications: 'flooring, surface protection and interior-finishing projects where suitable'
  },
  'other-items': {
    name: 'Other Items',
    short: 'Useful construction and maintenance accessory designed for everyday professional applications.',
    overview: 'construction or maintenance work associated with its listed product type',
    applications: 'professional construction and maintenance tasks appropriate to the named item'
  }
};

const normalizeCategory = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

export const getProductDescriptionCopy = product => {
  const categoryKey = normalizeCategory(product.category?.slug || product.category);
  const description = descriptionByCategory[categoryKey];
  if (!description) {
    const error = new Error(`No product description template exists for category "${product.category || ''}"`);
    error.status = 400;
    throw error;
  }

  const productName = String(product.name || '').trim();
  if (!productName) {
    const error = new Error('Product name is required to generate a description');
    error.status = 400;
    throw error;
  }

  const fullDescription = [
    'Product Overview',
    `${productName} is listed in ${description.name} and is intended for ${description.overview}. Confirm the product label and supplier information for details specific to this item.`,
    '',
    'Key Features',
    `This description identifies ${productName} by its listed product type and category. No unprovided composition, dimensions, certifications or performance claims are assumed.`,
    '',
    'Applications',
    `Suitable applications include ${description.applications}. Check product compatibility for the specific project before use.`,
    '',
    'Usage',
    'Follow the instructions supplied with the product and use appropriate site safety practices.'
  ].join('\n');

  return {
    shortDescription: description.short,
    description: fullDescription
  };
};
