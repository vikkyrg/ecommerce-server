import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const parseWebsiteExcel = (filePath = path.join(__dirname, '../data/WEBSITE.xlsx')) => {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // 6 Main Target Categories
  const categories = [
    {
      name: 'Marble and Granite Polishing Materials',
      slug: 'marble-and-granite-polishing-materials',
      description: 'Professional Italian stone sealers, polishes, buffing powders, densifiers, adhesives and diamond pads.',
      displayOrder: 1,
      image: '/categories/polishing.jpg',
      seoTitle: 'Marble & Granite Polishing Materials | NS Stone Chemicals',
      seoDescription: 'High gloss densifiers, polishing powders, epoxy resins, and polishing pads for Italian marble and granite.',
      isActive: true
    },
    {
      name: 'Tile Adhesives and Epoxy Grouts',
      slug: 'tile-adhesives-and-epoxy-grouts',
      description: 'High performance tile adhesives, epoxy grouts, latex additives, cleaners and levelling tools.',
      displayOrder: 2,
      image: '/categories/adhesives.jpg',
      seoTitle: 'Tile Adhesives & Epoxy Grouts | NS Stone Chemicals',
      seoDescription: 'Premium flexible tile adhesives, bio flex polymer adhesives, and chemical-resistant epoxy grouts.',
      isActive: true
    },
    {
      name: 'Marble and Granite Cutting Accessories',
      slug: 'marble-and-granite-cutting-accessories',
      description: 'High-grade diamond cutting blades, core bits, granite blades, ceramic cutters, and profile wheels.',
      displayOrder: 3,
      image: '/categories/cutting.jpg',
      seoTitle: 'Marble & Granite Cutting Accessories | NS Stone Chemicals',
      seoDescription: 'Diamond blades, circular saw blades, thin ceramic cutters, and core bits for precision stone cutting.',
      isActive: true
    },
    {
      name: 'Machines',
      slug: 'machines',
      description: 'Industrial heavy duty stone cutters, marble polishers, angle grinders, tile vibrators, blowers and drills.',
      displayOrder: 4,
      image: '/categories/machines.jpg',
      seoTitle: 'Stone Cutting & Polishing Machines | NS Stone Chemicals',
      seoDescription: 'Heavy-duty stone cutters, variable speed polishers, angle grinders, and demolition hammers.',
      isActive: true
    },
    {
      name: 'Floor Covering Materials',
      slug: 'floor-covering-materials',
      description: 'Protective floor coverings, corrugated PP sheets, foam rolls, gum tapes, masking and surface protection.',
      displayOrder: 5,
      image: '/categories/flooring.jpg',
      seoTitle: 'Floor Covering & Protection Materials | NS Stone Chemicals',
      seoDescription: 'PP corrugated protection sheets, heavy-duty floor protection rolls, self-adhesive tapes and films.',
      isActive: true
    },
    {
      name: 'Other Items',
      slug: 'other-items',
      description: 'Essential stone fabrication accessories, suction cups, metal pastes, stain removers, adapters and waxes.',
      displayOrder: 6,
      image: '/categories/other.jpg',
      seoTitle: 'Stone Fabrication Accessories & Other Items | NS Stone Chemicals',
      seoDescription: 'Heavy duty suction lifters, instant cyanoacrylate adhesives, stain extractors, mixer rods and waxes.',
      isActive: true
    }
  ];

  const brands = new Map();
  const products = [];
  const reviewList = [];

  const addBrand = (name, categorySlug) => {
    const clean = name.trim();
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!brands.has(slug)) {
      brands.set(slug, {
        name: clean,
        slug,
        categories: [categorySlug],
        isActive: true
      });
    } else {
      const b = brands.get(slug);
      if (!b.categories.includes(categorySlug)) {
        b.categories.push(categorySlug);
      }
    }
    return clean;
  };

  const addProduct = ({ name, brand, category, subcategory = '', variants = [], description = '', notes = '' }) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    const brandName = brand ? brand.trim() : 'NS Stone Chemicals';
    const brandSlug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    addBrand(brandName, category);

    const slug = `${cleanName}-${brandName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sku = `NSC-${brandName.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    products.push({
      name: cleanName,
      slug,
      brand: brandName,
      brandSlug,
      category,
      subcategory,
      description: description || `${cleanName} by ${brandName}. Formulated for premium performance in professional stone processing, tile installation, and surface protection.`,
      variants: variants.length > 0 ? variants : [{ name: 'Standard', size: 'Standard', unit: 'Piece' }],
      sku,
      isActive: true,
      notes
    });
  };

  // Helper to split comma/multiple items in string
  const splitItems = (str) => {
    if (!str) return [];
    return String(str)
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  };

  /* ================= 1. MARBLE & GRANITE POLISHING MATERIALS ================= */
  const catPolishing = 'marble-and-granite-polishing-materials';

  // AKEMI
  addProduct({
    name: 'Akemi Stone Care Chemical System',
    brand: 'AKEMI',
    category: catPolishing,
    notes: 'Referenced from Aravind Enterprises in catalog'
  });

  // TENAX
  const tenaxItems = [
    'AGER Stone Color Enhancer',
    'CERAFLUIDA Liquid Wax',
    'SOLID PAGL Solid Mastic',
    'LIQUID PAGLE Liquid Mastic',
    'SOLID WHITE Mastic',
    'LIQUID WHITE Mastic',
    'SOLID TRANSPARENT Mastic',
    'THASSOS White Adhesive',
    'PROSEAL Nano Stain Impregnator',
    'DURASTONE 200 Epoxy System',
    'DURASTONE 800 Premium Resin',
    'STONEFILL UNIVERSAL Filler',
    'STONE FILL XTRA CLEAR Extra Clear Resin',
    'MARVEL SHINE PRO Crystallizer',
    'HYDREX Water & Oil Repellent'
  ];
  tenaxItems.forEach(item => {
    addProduct({ name: item, brand: 'TENAX', category: catPolishing });
  });
  addProduct({
    name: 'ELIOX Epoxy Adhesive',
    brand: 'TENAX',
    category: catPolishing,
    variants: [{ name: '2.25 KG Pack', size: '2.25 KG', weight: '2.25kg', unit: 'Pack' }]
  });

  // SURIE POLEX
  const surieItems = [
    'HIGH GLOSS MARBLE DENSIFIER',
    'MARBLE STAR Crystallizer',
    'DIAMOND ABRASIVES PAD',
    '7U2 XD Diamond Floor Polishing Pads',
    '5U1XD Hybrid Diamond Floor Pads',
    '1080 EPOXY 2+1 Resin System',
    'TRANSPARENT RESIN',
    'DCRPD MIRREX Diamond Polishing Disc',
    'GRANITE TILE CLEANER',
    'GRANITE TILE CLEANER ECO',
    'RUST REMOVER for Natural Stone',
    'TAP AND TILE CLEANER',
    'POLISHING STONES Frankfurt',
    'POLISHING STONE CRB',
    'MUDGUARD Stone Impregnator',
    'Marble Cleaner',
    'Floor Cleaner Heavy Duty',
    'Floor Wiper 16 Inch',
    'Mini Wiper',
    'Z XTRA PLUS Stone Polishing Powder',
    'MPZ Polishing Compound',
    'Silicon Brushes Antique Finish',
    'Cleaning Brushes Nylon',
    'Cleaning Brushes Wire'
  ];
  surieItems.forEach(item => {
    addProduct({ name: item, brand: 'SURIE POLEX', category: catPolishing });
  });

  // ARALDITE
  addProduct({
    name: 'Araldite Stone Bonding Epoxy System',
    brand: 'ARALDITE',
    category: catPolishing,
    notes: 'Material Hunt / Home Run Epoxy'
  });

  // JOLLY
  const jollyItems = [
    'TIXO STRAW Solid Adhesive',
    'LIQUID STRAW Liquid Adhesive',
    'SOLID TRANSPARENT Mastic',
    'TIXO GLASS Super Clear Adhesive',
    'BRILLO Liquid Polish Enhancer',
    'GRANILUX Stone Polish Sealer'
  ];
  jollyItems.forEach(item => {
    addProduct({ name: item, brand: 'JOLLY', category: catPolishing });
  });

  // WILBER (ADESIVA)
  const wilberItems = [
    'SOLID CREAM Mastic',
    'LIQUID CREAM Mastic',
    'SOLID WHITE Mastic',
    'LIQUID WHITE Mastic',
    'SOLID TRANSPARENT Mastic',
    'SOLID CRYSTAL Clear Resin',
    'WS SHINER Stone Polish'
  ];
  wilberItems.forEach(item => {
    addProduct({ name: item, brand: 'WILBER (ADESIVA)', category: catPolishing });
  });

  // ENDURA
  addProduct({
    name: 'HEAVY DUTY SEALER',
    brand: 'ENDURA',
    category: catPolishing
  });

  // VITO
  const vitoItems = [
    'Solid Cream Mastic',
    'Liquid Cream Mastic',
    'Solid White Mastic',
    'Liquid White Mastic',
    'Solid Crystal Clear Resin',
    'Solid Transparent Mastic',
    'Wonder Stone Polish',
    'Marble Polishing Powder Glosso Pro',
    'Vito 5Xtar Polishing Powder'
  ];
  vitoItems.forEach(item => {
    addProduct({ name: item, brand: 'VITO', category: catPolishing });
  });

  // 3M
  addProduct({
    name: '17 Inch Buffing Floor Pads',
    brand: '3M',
    category: catPolishing,
    variants: [{ name: '17 Inch', size: '17"', unit: 'Piece' }]
  });

  // SAND X PAPERS
  addProduct({
    name: 'Water Sandpapers for Stone & Marble',
    brand: 'Sand X Papers',
    category: catPolishing,
    variants: [
      { name: 'Grit 120', size: '120 Grit', unit: 'Sheet' },
      { name: 'Grit 220', size: '220 Grit', unit: 'Sheet' },
      { name: 'Grit 400', size: '400 Grit', unit: 'Sheet' },
      { name: 'Grit 800', size: '800 Grit', unit: 'Sheet' }
    ]
  });

  // GENERAL POLISHING POWDERS
  const genericPowders = [
    { name: 'Klindex KP85 Marble Polishing Powder', brand: 'KLINDEX' },
    { name: 'Techqnique High Shine Powder', brand: 'TECHQNIQUE' },
    { name: 'Hi Gloss Crystallization Powder', brand: 'SURIE POLEX' }
  ];
  genericPowders.forEach(p => {
    addProduct({ name: p.name, brand: p.brand, category: catPolishing });
  });

  /* ================= 2. TILE ADHESIVES AND EPOXY GROUTS ================= */
  const catAdhesives = 'tile-adhesives-and-epoxy-grouts';

  // MYK LATICRETE
  addProduct({
    name: '305 ADHESIVE GREY 30 KG',
    brand: 'MYK LATICRETE',
    category: catAdhesives,
    variants: [{ name: '30 KG Bag', size: '30 KG', weight: '30kg', unit: 'Bag' }]
  });
  addProduct({
    name: '307 Premium Tile Adhesive',
    brand: 'MYK LATICRETE',
    category: catAdhesives,
    variants: [{ name: '20 KG Bag', size: '20 KG', weight: '20kg', unit: 'Bag' }]
  });

  // KERAKOLL
  addProduct({
    name: 'SUPER FLEX High Performance Adhesive',
    brand: 'KERAKOLL',
    category: catAdhesives,
    variants: [{ name: '4 KG Bucket', size: '4 KG', weight: '4kg', unit: 'Bucket' }]
  });
  addProduct({
    name: 'BIO FLEX Gel Tile Adhesive White',
    brand: 'KERAKOLL',
    category: catAdhesives,
    variants: [{ name: '20 KG Bag', size: '20 KG White', weight: '20kg', unit: 'Bag' }]
  });
  addProduct({
    name: 'H40 GEL Flexible Tile Adhesive',
    brand: 'KERAKOLL',
    category: catAdhesives,
    variants: [{ name: '20 KG Bag', size: '20 KG', weight: '20kg', unit: 'Bag' }]
  });
  addProduct({
    name: 'FUGALITE BIO Epoxy Grout',
    brand: 'KERAKOLL',
    category: catAdhesives,
    variants: [{ name: '4 KG Bucket', size: '4 KG', weight: '4kg', unit: 'Bucket' }]
  });
  addProduct({
    name: 'FUGASHOCK Eco Epoxy Grout Remover & Cleaner',
    brand: 'KERAKOLL',
    category: catAdhesives,
    variants: [{ name: '1 Litre Bottle', size: '1 LTR', unit: 'Bottle' }]
  });

  // MAPEI
  addProduct({
    name: 'KERALASTIC T Polyurethane Adhesive',
    brand: 'MAPEI',
    category: catAdhesives,
    variants: [{ name: '5 KG Bucket', size: '5 KG', weight: '5kg', unit: 'Bucket' }]
  });
  const mapeiAdhesives = [
    'Keraset Cementitious Adhesive',
    'Kerabond Plus Tile Adhesive',
    'Adesilex P9 High Performance Cementitious Adhesive',
    'Easy S1 Deformable Cementitious Adhesive',
    'Keraflex Maxi S1 Flexible Adhesive'
  ];
  mapeiAdhesives.forEach(item => {
    addProduct({ name: item, brand: 'MAPEI', category: catAdhesives });
  });

  // ROFF
  addProduct({
    name: 'Roff Home Run Tile Adhesive & Grout System',
    brand: 'ROFF',
    category: catAdhesives
  });

  // TILE ACCESSORIES / TILE SPACERS
  addProduct({
    name: 'Professional Tile Leveling System & Spacers',
    brand: 'NS Stone Chemicals',
    category: catAdhesives,
    variants: [
      { name: 'Tile Spacers Clips', size: 'Clips (Pack of 100)', unit: 'Pack' },
      { name: 'Reusable Wedges', size: 'Wedges (Pack of 100)', unit: 'Pack' },
      { name: 'Spinners Leveling Nut', size: 'Spinners (Pack of 50)', unit: 'Pack' },
      { name: 'Leveling Jack Plier', size: 'Jack Plier Tool', unit: 'Piece' }
    ]
  });

  /* ================= 3. MARBLE AND GRANITE CUTTING ACCESSORIES ================= */
  const catCutting = 'marble-and-granite-cutting-accessories';

  // BLADES BRANDS
  const bladeBrands = [
    { brand: 'RAINBOW', products: ['110G+ Diamond Blade', 'Thin Ceramic Cutting Blade', '5 Inch H+ Cutting Blade'] },
    { brand: 'COBRA', products: ['Cobra Stone Cutting Blade', 'Cobra Ceramic Cutting Blade', 'Cobra Flat Type Blade'] },
    { brand: 'OXI', products: ['OXI Stone Cutting Blade', 'OXI Ceramic Cutting Blade', 'OXI Flat Type Blade'] },
    { brand: 'BANDARI', products: ['Bandari CD Blade', 'Bandari Glass Cutting Blade'] },
    { brand: 'BGM', products: ['BGM Heavy Duty Granite Cutting Blade'] },
    { brand: 'COVINA', products: ['Covina Precision Granite Cutting Blade'] }
  ];

  bladeBrands.forEach(b => {
    b.products.forEach(pName => {
      addProduct({ name: pName, brand: b.brand, category: catCutting, subcategory: 'Blades' });
    });
  });

  // MARBLE DESIGN PROFILES BLADES
  const designBlades = [
    'Design Blade C Type Profile',
    'Design Blade U Type Profile',
    'Design Blade V Type Profile',
    'Design Blade Full Round Profile',
    'Design Blade Half Round Profile'
  ];
  designBlades.forEach(name => {
    addProduct({ name, brand: 'NS Stone Chemicals', category: catCutting, subcategory: 'Profile Blades' });
  });

  // DIAMOND CORE BITS
  const coreBitSizes = ['6mm', '8mm', '10mm', '1/2"', '16mm', '1"', '1.1/4"', '1.1/2"', '45mm', '2"', '2.1/4"', '2.1/2"', '3"'];
  addProduct({
    name: 'Diamond Core Bits for Marble, Granite & Tiles',
    brand: 'NS Stone Chemicals',
    category: catCutting,
    subcategory: 'Core Bits',
    variants: coreBitSizes.map(s => ({ name: `Core Bit ${s}`, size: s, unit: 'Piece' }))
  });

  /* ================= 4. MACHINES ================= */
  const catMachines = 'machines';

  // DONGCHENG
  const dongchengMachines = [
    '02-110 Marble Cutter',
    '03-110 Heavy Duty Marble Cutter',
    '04-100 Angle Grinder',
    '03-125 Big Marble Cutter',
    'DQU160 High Power Mixer Drill',
    '6mm Rotary Drill Machine',
    '10mm Impact Drill Machine'
  ];
  dongchengMachines.forEach(name => {
    addProduct({ name: `DongCheng ${name}`, brand: 'DONGCHENG', category: catMachines });
  });

  // ACCURATE
  const accurateMachines = [
    'AC4 Marble Cutter',
    'AC5SB Heavy Marble Cutter',
    'AD10 Polisher',
    'AB400 Air Blower',
    'Industrial Heat Gun'
  ];
  accurateMachines.forEach(name => {
    addProduct({ name: `Accurate ${name}`, brand: 'ACCURATE', category: catMachines });
  });

  // MAKITA
  addProduct({
    name: 'Makita MT410 Marble Cutter',
    brand: 'MAKITA',
    category: catMachines
  });

  // SPECIALTY MACHINES
  addProduct({
    name: '0810 Demolition Hammer Machine',
    brand: 'NS Stone Chemicals',
    category: catMachines
  });
  addProduct({
    name: 'Electric Tile Vibrator & Leveling Suction Machine',
    brand: 'NS Stone Chemicals',
    category: catMachines
  });
  addProduct({
    name: 'HiKOKI PD100M Angle Grinder',
    brand: 'HiKOKI',
    category: catMachines
  });

  /* ================= 5. FLOOR COVERING MATERIALS ================= */
  const catFlooring = 'floor-covering-materials';

  addProduct({
    name: 'Heavy Duty PVC Flooring Protection Sheet',
    brand: 'NS Stone Chemicals',
    category: catFlooring
  });

  addProduct({
    name: 'PP Corrugated Floor Protection Sheets',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: ['2MM', '3MM', '4MM', '5MM'].map(t => ({ name: `${t} Thickness Sheet (6x4 ft)`, size: t, unit: 'Sheet' }))
  });

  addProduct({
    name: 'EPE Foam Roll Floor Cushion Protection',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: ['2MM', '3MM'].map(t => ({ name: `${t} Foam Roll`, size: t, unit: 'Roll' }))
  });

  addProduct({
    name: '2 Feet Gum Tape William',
    brand: 'WILLIAM',
    category: catFlooring,
    variants: [{ name: '2 Feet Width Roll', size: '2 Feet', unit: 'Roll' }]
  });

  addProduct({
    name: 'Heavy Duty Masking Tape for Stone Protection',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: ['1 Inch', '2 Inch'].map(s => ({ name: `Masking Tape ${s}`, size: s, unit: 'Roll' }))
  });

  addProduct({
    name: '2 Inch Cello Packaging Tape',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: [
      { name: 'Brown 2 Inch', size: '2"', color: 'Brown', unit: 'Roll' },
      { name: 'White 2 Inch', size: '2"', color: 'White', unit: 'Roll' }
    ]
  });

  addProduct({
    name: 'High Strength Double Sided Tape',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: ['1 Inch', '2 Inch'].map(s => ({ name: `Double Tape ${s}`, size: s, unit: 'Roll' }))
  });

  addProduct({
    name: 'Heavy Duty Foam Tape',
    brand: 'NS Stone Chemicals',
    category: catFlooring,
    variants: ['1 Inch', '2 Inch'].map(s => ({ name: `Foam Tape ${s}`, size: s, unit: 'Roll' }))
  });

  /* ================= 6. OTHER ITEMS ================= */
  const catOther = 'other-items';

  const otherItems = [
    { name: 'Fevikwik 203 Instant Adhesive', brand: 'FEVIKWIK' },
    { name: 'My T Look 743 Anaerobic Threadlocker & Retaining Compound', brand: 'MY-T-LOOK' },
    { name: 'Metal Paste for Marble & Granite Repair', brand: 'NS Stone Chemicals' },
    { name: 'Stone Stain Remover Poultice Chemical', brand: 'NS Stone Chemicals' },
    { name: 'Suction Cup Power Grip Heavy Lifter (2-Head & 3-Head)', brand: 'NS Stone Chemicals', variants: [
      { name: 'Double Head (2-Head) Lifter', size: '2 Head', unit: 'Piece' },
      { name: 'Triple Head (3-Head) Lifter', size: '3 Head', unit: 'Piece' }
    ]},
    { name: 'Industrial Spiral Mixer Rods for Adhesives & Epoxy', brand: 'NS Stone Chemicals' },
    { name: 'Velcro Adapter Backing Pads (M14 Thread)', brand: 'NS Stone Chemicals', variants: [
      { name: '4 Inch Backer Pad', size: '4"', unit: 'Piece' },
      { name: '5 Inch Backer Pad', size: '5"', unit: 'Piece' }
    ]},
    { name: 'Mansion Wax Polish for Stone & Marble Surfaces', brand: 'MANSION' }
  ];

  otherItems.forEach(item => {
    addProduct({
      name: item.name,
      brand: item.brand,
      category: catOther,
      variants: item.variants
    });
  });

  return {
    categories,
    brands: Array.from(brands.values()),
    products,
    reviewList
  };
};
