import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';

dotenv.config({ path: './server/.env' });

const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const catalogData = [
  {
    category: {
      name: 'Marble and Granite Polishing Materials',
      slug: 'marble-and-granite-polishing-materials',
      description: 'Professional Italian stone sealers, polishes, buffing powders, densifiers, adhesives and diamond pads.',
      image: '/api/images/6b054d20045a6920b5a19ddd',
      imageId: new mongoose.Types.ObjectId('6b054d20045a6920b5a19ddd'),
      displayOrder: 1
    },
    brands: [
      { name: 'AKEMI', products: [] },
      {
        name: 'TENAX',
        products: [
          { name: 'AGER' },
          { name: 'CERAFLUIDA' },
          { name: 'SOLID PAGL' },
          { name: 'LIQUID PAGLE' },
          { name: 'SOLID WHITE' },
          { name: 'LIQUID WHITE' },
          { name: 'SOLID TRANSPARENT' },
          { name: 'THASSOS' },
          { name: 'PROSEAL' },
          { name: 'DURASTONE 200' },
          { name: 'DURASTONE 800' },
          { name: 'STONEFILL UNIVERSAL' },
          { name: 'STONE FILL XTRA CLEAR' },
          { name: 'MARVEL SHINE PRO' },
          { name: 'HYDREX' },
          { name: 'ELIOX 2.25 KG' }
        ]
      },
      {
        name: 'SURIE POLEX',
        products: [
          { name: 'HIGH GLOSS MARBLE DENSIFIER' },
          { name: 'MARBLE STAR' },
          { name: 'DIAMOND ABRASIVES PAD' },
          { name: '7U2 XD PADS' },
          { name: '5U1XD PADS' },
          { name: '1080 EPOXY 2+1' },
          { name: 'TRANSPARENT RESIN' },
          { name: 'DCRPD MIRREX' },
          { name: 'GRANITE TILE CLEANER' },
          { name: 'GRANITE TILE CLEANER ECO' },
          { name: 'RUST REMOVER' },
          { name: 'TAP AND TILE CLEANER' },
          { name: 'POLISHING STONES Frank furt' },
          { name: 'polishing stone CRB' },
          { name: 'MUDGUARD' },
          { name: 'marble cleaner' },
          { name: 'floor cleaner' },
          { name: 'wiper 16"' },
          { name: 'mini wiper' },
          { name: 'z xtra plus' },
          { name: 'mpz' },
          { name: 'silicon brushes' },
          { name: 'cleaning brushes nylon' },
          { name: 'cleaning brushes wire' },
          { name: 'hi gloss powder' }
        ]
      },
      { name: 'ARALDITE', products: [] },
      {
        name: 'JOLLY',
        products: [
          { name: 'TIXO STRAW' },
          { name: 'LIQUID STRAW' },
          { name: 'SOLID TRANSPARENT' },
          { name: 'TIXO GLASS' },
          { name: 'BRILLO' },
          { name: 'GRANILUX' }
        ]
      },
      {
        name: 'WILBER (ADESIVA)',
        products: [
          { name: 'SOLID CREAM' },
          { name: 'LIQUID CREAM' },
          { name: 'SOLID WHITE' },
          { name: 'LIQUID WHITE' },
          { name: 'SOLID TRANSPARENT' },
          { name: 'SOLID CRYSTAL' },
          { name: 'WS SHINER' }
        ]
      },
      {
        name: 'ENDURA',
        products: [
          { name: 'HEAVY DUTY SEALER' }
        ]
      },
      {
        name: 'VITO',
        products: [
          { name: 'solid cream' },
          { name: 'liquid cream' },
          { name: 'solid white' },
          { name: 'liquid white' },
          { name: 'solid crystal' },
          { name: 'solid transparent' },
          { name: 'wonder' },
          { name: 'marble polishing powder glosso pro' },
          { name: 'vito5xtar powder' }
        ]
      },
      {
        name: '3M',
        products: [
          { name: '17" buffing pads' }
        ]
      },
      {
        name: 'Sand X Papers',
        products: [
          { name: 'water papers' }
        ]
      },
      {
        name: 'KLINDEX',
        products: [
          { name: 'klindex kp85' }
        ]
      },
      {
        name: 'TECHQNIQUE',
        products: [
          { name: 'techqnique powder' }
        ]
      }
    ],
    unassignedProducts: []
  },
  {
    category: {
      name: 'Tile Adhesives and Epoxy Grouts',
      slug: 'tile-adhesives-and-epoxy-grouts',
      description: 'High performance tile adhesives, epoxy grouts, latex additives, cleaners and levelling tools.',
      image: '/api/images/6b054d20045a6920b5a19de3',
      imageId: new mongoose.Types.ObjectId('6b054d20045a6920b5a19de3'),
      displayOrder: 2
    },
    brands: [
      {
        name: 'MYK LATICRETE',
        products: [
          { name: '305 ADHESIVE GREY 30 KG' },
          { name: '307' }
        ]
      },
      {
        name: 'KERAKOL',
        products: [
          { name: 'SUPER FLEX 4KG' },
          { name: 'H40 GEL 20 KG' },
          { name: 'FUGASHOCK 1LTR' },
          { name: 'BIO FLEX 20 KG WHITE' },
          { name: 'FUGALITE EPOXY GROUT 4KG' }
        ]
      },
      {
        name: 'MAPIE',
        products: [
          { name: 'KERALSTIC T in 5kg' },
          { name: 'keraset' },
          { name: 'kerabond plus' },
          { name: 'adesilex p9' },
          { name: 'easy s1' },
          { name: 'keraflec maxi S1' }
        ]
      },
      {
        name: 'ROFF',
        products: [
          { name: 'HOME RUN' }
        ]
      }
    ],
    unassignedProducts: [
      { name: 'clips' },
      { name: 'wedges', notes: 'original Excel spelling: wages' },
      { name: 'spinners' },
      { name: 'jack' }
    ]
  },
  {
    category: {
      name: 'Marble and Granite Cutting Accessories',
      slug: 'marble-and-granite-cutting-accessories',
      description: 'High-grade diamond cutting blades, core bits, granite blades, ceramic cutters, and profile wheels.',
      image: '/api/images/6b054d21045a6920b5a19de8',
      imageId: new mongoose.Types.ObjectId('6b054d21045a6920b5a19de8'),
      displayOrder: 3
    },
    brands: [
      {
        name: 'RAINBOW',
        products: [
          { name: '110G+' },
          { name: 'THIN CERAMIC' },
          { name: '5" H+' }
        ]
      },
      {
        name: 'COBRA',
        products: [
          { name: 'CUTTING' },
          { name: 'CERAMIC CUTTING' },
          { name: 'FLAT TYPE' }
        ]
      },
      {
        name: 'OXI',
        products: [
          { name: 'CUTTING' },
          { name: 'CERAMIC CUTTING' },
          { name: 'FLAT TYPE' }
        ]
      },
      {
        name: 'BANDARI',
        products: [
          { name: 'CD BLADE' },
          { name: 'GLASS CUTTING BLADE' }
        ]
      },
      {
        name: 'BGM',
        products: [
          { name: 'GRANITE CUTTING' }
        ]
      },
      {
        name: 'COVINA',
        products: [
          { name: 'GRANITE CUTTING' }
        ]
      }
    ],
    unassignedProducts: [
      {
        name: 'Design Blades Marble',
        variants: [
          { name: 'C TYPE' },
          { name: 'U TYPE' },
          { name: 'V TYPE' },
          { name: 'FULL ROUND' },
          { name: 'HALF ROUND' }
        ]
      },
      {
        name: 'Diamond Core Bits for Marble Granite and Tiles',
        variants: [
          { name: '6MM', size: '6MM' },
          { name: '8MM', size: '8MM' },
          { name: '10MM', size: '10MM' },
          { name: '1/2"', size: '1/2"' },
          { name: '16MM', size: '16MM' },
          { name: '1"', size: '1"' },
          { name: '1.1/4"', size: '1.1/4"' },
          { name: '1.1/2"', size: '1.1/2"' },
          { name: '45MM', size: '45MM' },
          { name: '2"', size: '2"' },
          { name: '2.1/4"', size: '2.1/4"' },
          { name: '2.1/2"', size: '2.1/2"' },
          { name: '3"', size: '3"' }
        ]
      }
    ]
  },
  {
    category: {
      name: 'Machines',
      slug: 'machines',
      description: 'Industrial heavy duty stone cutters, marble polishers, angle grinders, tile vibrators, blowers and drills.',
      image: '/api/images/6b054d21045a6920b5a19ded',
      imageId: new mongoose.Types.ObjectId('6b054d21045a6920b5a19ded'),
      displayOrder: 4
    },
    brands: [
      {
        name: 'DONGCHENG',
        products: [
          { name: '02-110 CUTTER' },
          { name: '03-110 CUTTER' },
          { name: '04-100 GRINDER' },
          { name: '03-125 CUTTER' },
          { name: 'DQU160' },
          { name: '6MM DRILL' },
          { name: '10MM DRILL' }
        ]
      },
      {
        name: 'ACCURATE',
        products: [
          { name: 'AC4' },
          { name: 'AC5SB' },
          { name: 'AD10' },
          { name: 'AD10 POLISHER', notes: 'Appeared in same Excel cell as AD10; preserved for confirmation' },
          { name: 'AB400 BLOWER' },
          { name: 'heat gun' }
        ]
      },
      {
        name: 'MAKITA',
        products: [
          { name: 'MT410' }
        ]
      },
      {
        name: 'HiKOKI',
        products: [
          { name: 'hikoki pd100m grinder' }
        ]
      }
    ],
    unassignedProducts: [
      { name: '0810 MACHINE' },
      { name: 'tile vibrator' }
    ]
  },
  {
    category: {
      name: 'Floor Covering Materials',
      slug: 'floor-covering-materials',
      description: 'Protective floor coverings, corrugated PP sheets, foam rolls, gum tapes, masking and surface protection.',
      image: '/api/images/6b054d21045a6920b5a19df2',
      imageId: new mongoose.Types.ObjectId('6b054d21045a6920b5a19df2'),
      displayOrder: 5
    },
    brands: [
      {
        name: 'WILLIAM',
        products: [
          { name: '2 FEET GUM TAPE WILLIAM' }
        ]
      }
    ],
    unassignedProducts: [
      { name: 'PVC FLOORING' },
      {
        name: 'PP CORRUGATED SHEETS',
        variants: [
          { name: '2MM', size: '2MM' },
          { name: '3MM', size: '3MM' },
          { name: '4MM', size: '4MM' },
          { name: '5MM', size: '5MM' }
        ]
      },
      {
        name: 'FOAM ROLL',
        variants: [
          { name: '2MM', size: '2MM' },
          { name: '3MM', size: '3MM' }
        ]
      },
      {
        name: 'MASKING TAPES',
        variants: [
          { name: '1"', size: '1"' },
          { name: '2"', size: '2"' }
        ]
      },
      {
        name: 'CELLO TAPE 2"',
        variants: [
          { name: 'BROWN', color: 'BROWN' },
          { name: 'WHITE', color: 'WHITE' }
        ]
      },
      {
        name: 'double tapes',
        variants: [
          { name: '1"', size: '1"' },
          { name: '2"', size: '2"' }
        ]
      },
      {
        name: 'foam tape',
        variants: [
          { name: '1"', size: '1"' },
          { name: '2"', size: '2"' }
        ]
      }
    ]
  },
  {
    category: {
      name: 'Other Items',
      slug: 'other-items',
      description: 'Essential stone fabrication accessories, suction cups, metal pastes, stain removers, adapters and waxes.',
      image: '/api/images/6b054d21045a6920b5a19df7',
      imageId: new mongoose.Types.ObjectId('6b054d21045a6920b5a19df7'),
      displayOrder: 6
    },
    brands: [
      {
        name: 'FEVIKWIK',
        products: [
          { name: 'fevikwik 203' }
        ]
      },
      {
        name: 'MY-T-LOOK',
        products: [
          { name: 'my t look 743' }
        ]
      },
      {
        name: 'MANSION',
        products: [
          { name: 'mansion wax' }
        ]
      }
    ],
    unassignedProducts: [
      { name: 'metal paste' },
      { name: 'stain remover' },
      {
        name: 'suction cup power grip',
        variants: [
          { name: '2 HEAD', size: '2 HEAD' },
          { name: '3 HEAD', size: '3 HEAD' }
        ]
      },
      { name: 'mixer rods' },
      { name: 'velcro adapters' }
    ]
  }
];

export async function seedCatalog() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('Connected to MongoDB Atlas');

  let categoriesCreated = 0;
  let categoriesReused = 0;
  let brandsCreated = 0;
  let brandsReused = 0;
  let productsCreated = 0;
  let productsReused = 0;
  let totalVariantsCreated = 0;
  let unassignedProductsCount = 0;

  for (const group of catalogData) {
    const catPayload = group.category;
    let category = await Category.findOne({
      $or: [{ slug: catPayload.slug }, { name: catPayload.name }]
    });

    if (!category) {
      category = await Category.create({
        name: catPayload.name,
        slug: catPayload.slug,
        description: catPayload.description,
        image: catPayload.image,
        imageId: catPayload.imageId,
        displayOrder: catPayload.displayOrder,
        isActive: true
      });
      categoriesCreated++;
      console.log(`[Category Created] ${category.name}`);
    } else {
      categoriesReused++;
      category.image = catPayload.image;
      category.imageId = catPayload.imageId;
      category.isActive = true;
      await category.save();
      console.log(`[Category Reused] ${category.name}`);
    }

    // Process Brands under Category
    for (const b of group.brands) {
      const brandSlug = slugify(b.name);
      let brand = await Brand.findOne({
        $or: [{ slug: brandSlug }, { name: b.name }]
      });

      if (!brand) {
        brand = await Brand.create({
          name: b.name,
          slug: brandSlug,
          categories: [category._id],
          isActive: true
        });
        brandsCreated++;
        console.log(`  [Brand Created] ${brand.name}`);
      } else {
        brandsReused++;
        if (!brand.categories.some(cId => String(cId) === String(category._id))) {
          brand.categories.push(category._id);
          await brand.save();
        }
        console.log(`  [Brand Reused] ${brand.name}`);
      }

      // Process Products under Brand
      for (const p of b.products) {
        const prodSlug = slugify(`${p.name}-${b.name}`);
        let product = await Product.findOne({
          $or: [
            { slug: prodSlug },
            { name: p.name, categoryRef: category._id, brandRef: brand._id }
          ]
        });

        if (!product) {
          product = await Product.create({
            name: p.name,
            slug: prodSlug,
            brand: brand.name,
            brandRef: brand._id,
            category: category.slug,
            categoryRef: category._id,
            description: p.notes || '',
            notes: p.notes || '',
            image: '', // Zero product images as specified
            imageId: null,
            productImages: [],
            variants: p.variants || [],
            isActive: true,
            inStock: null
          });
          productsCreated++;
          if (p.variants?.length) totalVariantsCreated += p.variants.length;
        } else {
          productsReused++;
        }
      }
    }

    // Process Unassigned Products under Category
    for (const up of group.unassignedProducts) {
      const prodSlug = slugify(`${up.name}-${category.slug}`);
      let product = await Product.findOne({
        $or: [
          { slug: prodSlug },
          { name: up.name, categoryRef: category._id, brandRef: null }
        ]
      });

      if (!product) {
        product = await Product.create({
          name: up.name,
          slug: prodSlug,
          brand: '',
          brandRef: null,
          category: category.slug,
          categoryRef: category._id,
          description: up.notes || '',
          notes: up.notes || '',
          image: '', // Zero product images as specified
          imageId: null,
          productImages: [],
          variants: up.variants || [],
          isActive: true,
          inStock: null
        });
        productsCreated++;
        unassignedProductsCount++;
        if (up.variants?.length) totalVariantsCreated += up.variants.length;
      } else {
        productsReused++;
        unassignedProductsCount++;
      }
    }
  }

  // Update Category item counts
  for (const group of catalogData) {
    const cat = await Category.findOne({ slug: group.category.slug });
    if (cat) {
      const count = await Product.countDocuments({ categoryRef: cat._id });
      cat.itemCount = count;
      await cat.save();
    }
  }

  console.log('\n--- SEEDING COMPLETED SUCCESSFULLY ---');
  console.log(`Categories Created: ${categoriesCreated}, Reused: ${categoriesReused}`);
  console.log(`Brands Created: ${brandsCreated}, Reused: ${brandsReused}`);
  console.log(`Products Created: ${productsCreated}, Reused: ${productsReused}`);
  console.log(`Unassigned Products: ${unassignedProductsCount}`);
  console.log(`Product Variants Created: ${totalVariantsCreated}`);
}

seedCatalog()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
