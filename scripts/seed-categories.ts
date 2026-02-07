/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F2.2 — SEED CATEGORÍAS POR TIENDA
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Crea categorías predeterminadas para una tienda según su perfil de negocio.
 * 
 * Ejecutar:
 *   npx ts-node scripts/seed-categories.ts <storeId>
 *   # o para todas las tiendas sin categorías:
 *   npx ts-node scripts/seed-categories.ts --all
 */

import { PrismaClient, BusinessProfile } from '@prisma/client';

const prisma = new PrismaClient();

interface CategorySeed {
  name: string;
  slug: string;
  color?: string;
  icon?: string;
  children?: CategorySeed[];
}

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGOS POR PERFIL DE NEGOCIO
// ════════════════════════════════════════════════════════════════════════════

const BODEGA_CATEGORIES: CategorySeed[] = [
  {
    name: 'Abarrotes',
    slug: 'abarrotes',
    icon: 'Package',
    color: '#f59e0b',
    children: [
      { name: 'Arroz y Menestras', slug: 'arroz-menestras' },
      { name: 'Aceites y Mantecas', slug: 'aceites-mantecas' },
      { name: 'Azúcar y Endulzantes', slug: 'azucar-endulzantes' },
      { name: 'Harinas y Pastas', slug: 'harinas-pastas' },
      { name: 'Conservas', slug: 'conservas' },
      { name: 'Condimentos y Especias', slug: 'condimentos-especias' },
    ],
  },
  {
    name: 'Bebidas',
    slug: 'bebidas',
    icon: 'Coffee',
    color: '#3b82f6',
    children: [
      { name: 'Gaseosas', slug: 'gaseosas' },
      { name: 'Aguas y Jugos', slug: 'aguas-jugos' },
      { name: 'Cervezas', slug: 'cervezas' },
      { name: 'Vinos y Licores', slug: 'vinos-licores' },
      { name: 'Bebidas Calientes', slug: 'bebidas-calientes' },
    ],
  },
  {
    name: 'Lácteos y Huevos',
    slug: 'lacteos-huevos',
    icon: 'Milk',
    color: '#22c55e',
    children: [
      { name: 'Leches', slug: 'leches' },
      { name: 'Yogures', slug: 'yogures' },
      { name: 'Quesos', slug: 'quesos' },
      { name: 'Huevos', slug: 'huevos' },
    ],
  },
  {
    name: 'Limpieza',
    slug: 'limpieza',
    icon: 'Sparkles',
    color: '#06b6d4',
    children: [
      { name: 'Detergentes', slug: 'detergentes' },
      { name: 'Jabones', slug: 'jabones' },
      { name: 'Desinfectantes', slug: 'desinfectantes' },
      { name: 'Papeles', slug: 'papeles' },
    ],
  },
  {
    name: 'Cuidado Personal',
    slug: 'cuidado-personal',
    icon: 'User',
    color: '#ec4899',
    children: [
      { name: 'Shampoo y Acondicionador', slug: 'shampoo-acondicionador' },
      { name: 'Higiene Bucal', slug: 'higiene-bucal' },
      { name: 'Desodorantes', slug: 'desodorantes' },
    ],
  },
  {
    name: 'Snacks y Dulces',
    slug: 'snacks-dulces',
    icon: 'Cookie',
    color: '#f97316',
    children: [
      { name: 'Galletas', slug: 'galletas' },
      { name: 'Chocolates', slug: 'chocolates' },
      { name: 'Caramelos', slug: 'caramelos' },
      { name: 'Snacks Salados', slug: 'snacks-salados' },
    ],
  },
  {
    name: 'Panadería',
    slug: 'panaderia',
    icon: 'Croissant',
    color: '#a855f7',
  },
  {
    name: 'Frutas y Verduras',
    slug: 'frutas-verduras',
    icon: 'Apple',
    color: '#84cc16',
  },
  {
    name: 'Carnes y Embutidos',
    slug: 'carnes-embutidos',
    icon: 'Beef',
    color: '#ef4444',
  },
  {
    name: 'Otros',
    slug: 'otros',
    icon: 'MoreHorizontal',
    color: '#6b7280',
  },
];

const FERRETERIA_CATEGORIES: CategorySeed[] = [
  {
    name: 'Herramientas Manuales',
    slug: 'herramientas-manuales',
    icon: 'Hammer',
    color: '#f59e0b',
    children: [
      { name: 'Martillos y Combos', slug: 'martillos-combos' },
      { name: 'Destornilladores', slug: 'destornilladores' },
      { name: 'Alicates y Pinzas', slug: 'alicates-pinzas' },
      { name: 'Llaves', slug: 'llaves' },
      { name: 'Sierras y Serruchos', slug: 'sierras-serruchos' },
      { name: 'Cinceles y Formones', slug: 'cinceles-formones' },
    ],
  },
  {
    name: 'Herramientas Eléctricas',
    slug: 'herramientas-electricas',
    icon: 'Zap',
    color: '#eab308',
    children: [
      { name: 'Taladros', slug: 'taladros' },
      { name: 'Amoladoras', slug: 'amoladoras' },
      { name: 'Lijadoras', slug: 'lijadoras' },
      { name: 'Sierras Eléctricas', slug: 'sierras-electricas' },
      { name: 'Soldadoras', slug: 'soldadoras' },
    ],
  },
  {
    name: 'Tornillería y Fijaciones',
    slug: 'tornilleria-fijaciones',
    icon: 'Anchor',
    color: '#6b7280',
    children: [
      { name: 'Tornillos', slug: 'tornillos' },
      { name: 'Tuercas y Arandelas', slug: 'tuercas-arandelas' },
      { name: 'Pernos', slug: 'pernos' },
      { name: 'Clavos', slug: 'clavos' },
      { name: 'Tarugos y Anclas', slug: 'tarugos-anclas' },
      { name: 'Grapas', slug: 'grapas' },
    ],
  },
  {
    name: 'Electricidad',
    slug: 'electricidad',
    icon: 'Lightbulb',
    color: '#3b82f6',
    children: [
      { name: 'Cables', slug: 'cables' },
      { name: 'Interruptores y Tomacorrientes', slug: 'interruptores-tomacorrientes' },
      { name: 'Focos y Luminarias', slug: 'focos-luminarias' },
      { name: 'Tableros y Llaves', slug: 'tableros-llaves' },
      { name: 'Cintas y Aislantes', slug: 'cintas-aislantes' },
    ],
  },
  {
    name: 'Plomería',
    slug: 'plomeria',
    icon: 'Droplets',
    color: '#0ea5e9',
    children: [
      { name: 'Tubos PVC', slug: 'tubos-pvc' },
      { name: 'Conexiones PVC', slug: 'conexiones-pvc' },
      { name: 'Tubos Galvanizados', slug: 'tubos-galvanizados' },
      { name: 'Grifería', slug: 'griferia' },
      { name: 'Pegamentos y Selladores', slug: 'pegamentos-selladores' },
      { name: 'Válvulas', slug: 'valvulas' },
    ],
  },
  {
    name: 'Pinturas',
    slug: 'pinturas',
    icon: 'Palette',
    color: '#a855f7',
    children: [
      { name: 'Pinturas Látex', slug: 'pinturas-latex' },
      { name: 'Esmaltes', slug: 'esmaltes' },
      { name: 'Barnices y Lacas', slug: 'barnices-lacas' },
      { name: 'Brochas y Rodillos', slug: 'brochas-rodillos' },
      { name: 'Thinner y Solventes', slug: 'thinner-solventes' },
      { name: 'Masillas', slug: 'masillas' },
    ],
  },
  {
    name: 'Materiales de Construcción',
    slug: 'materiales-construccion',
    icon: 'Building2',
    color: '#78716c',
    children: [
      { name: 'Cemento', slug: 'cemento' },
      { name: 'Fierros', slug: 'fierros' },
      { name: 'Ladrillos', slug: 'ladrillos' },
      { name: 'Arena y Piedra', slug: 'arena-piedra' },
      { name: 'Drywall', slug: 'drywall' },
    ],
  },
  {
    name: 'Seguridad',
    slug: 'seguridad',
    icon: 'Shield',
    color: '#22c55e',
    children: [
      { name: 'Candados y Cerraduras', slug: 'candados-cerraduras' },
      { name: 'Cadenas', slug: 'cadenas' },
      { name: 'EPP', slug: 'epp' },
      { name: 'Señalización', slug: 'senalizacion' },
    ],
  },
  {
    name: 'Jardinería',
    slug: 'jardineria',
    icon: 'Flower2',
    color: '#84cc16',
    children: [
      { name: 'Mangueras', slug: 'mangueras' },
      { name: 'Herramientas de Jardín', slug: 'herramientas-jardin' },
      { name: 'Macetas', slug: 'macetas' },
      { name: 'Fertilizantes', slug: 'fertilizantes' },
    ],
  },
  {
    name: 'Automotriz',
    slug: 'automotriz',
    icon: 'Car',
    color: '#ef4444',
    children: [
      { name: 'Aceites y Lubricantes', slug: 'aceites-lubricantes' },
      { name: 'Accesorios', slug: 'accesorios-auto' },
      { name: 'Herramientas Auto', slug: 'herramientas-auto' },
    ],
  },
  {
    name: 'Adhesivos y Pegamentos',
    slug: 'adhesivos-pegamentos',
    icon: 'Paperclip',
    color: '#f97316',
  },
  {
    name: 'Otros',
    slug: 'otros',
    icon: 'MoreHorizontal',
    color: '#6b7280',
  },
];

const MINIMARKET_CATEGORIES: CategorySeed[] = [
  ...BODEGA_CATEGORIES,
  // Minimarket tiene categorías extra
  {
    name: 'Congelados',
    slug: 'congelados',
    icon: 'Snowflake',
    color: '#0ea5e9',
  },
  {
    name: 'Productos Frescos',
    slug: 'productos-frescos',
    icon: 'Leaf',
    color: '#22c55e',
  },
];

// Mapeo de perfil a categorías
const CATEGORIES_BY_PROFILE: Record<BusinessProfile, CategorySeed[]> = {
  BODEGA: BODEGA_CATEGORIES,
  FERRETERIA: FERRETERIA_CATEGORIES,
  TALLER: FERRETERIA_CATEGORIES, // Taller usa categorías de ferretería
  LAVANDERIA: BODEGA_CATEGORIES,
  POLLERIA: BODEGA_CATEGORIES,
  HOSTAL: BODEGA_CATEGORIES,
  BOTICA: BODEGA_CATEGORIES,
  ACCESORIOS: FERRETERIA_CATEGORIES, // Accesorios tech
};

// ════════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

async function seedCategoriesForStore(storeId: string): Promise<number> {
  // Obtener tienda y verificar que existe
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { categories: true },
  });

  if (!store) {
    throw new Error(`Tienda no encontrada: ${storeId}`);
  }

  // Si ya tiene categorías, no hacer nada
  if (store.categories.length > 0) {
    console.log(`  ⏭️  Tienda ${store.name} ya tiene ${store.categories.length} categorías`);
    return 0;
  }

  const profile = store.businessProfile || 'BODEGA';
  const categories = CATEGORIES_BY_PROFILE[profile] || BODEGA_CATEGORIES;

  console.log(`  📦 Creando categorías para ${store.name} (${profile})...`);

  let count = 0;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    
    // Crear categoría padre
    const parent = await prisma.category.create({
      data: {
        storeId,
        name: cat.name,
        slug: cat.slug,
        color: cat.color || null,
        icon: cat.icon || null,
        sortOrder: i + 1,
        active: true,
      },
    });
    count++;

    // Crear subcategorías si existen
    if (cat.children && cat.children.length > 0) {
      for (let j = 0; j < cat.children.length; j++) {
        const child = cat.children[j];
        await prisma.category.create({
          data: {
            storeId,
            name: child.name,
            slug: child.slug,
            parentId: parent.id,
            color: child.color || null,
            icon: child.icon || null,
            sortOrder: j + 1,
            active: true,
          },
        });
        count++;
      }
    }
  }

  console.log(`  ✅ ${count} categorías creadas para ${store.name}`);
  return count;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Uso:');
    console.log('  npx ts-node scripts/seed-categories.ts <storeId>');
    console.log('  npx ts-node scripts/seed-categories.ts --all');
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('MÓDULO F2.2 — SEED CATEGORÍAS POR TIENDA');
  console.log('══════════════════════════════════════════════════════════════\n');

  let totalCreated = 0;

  if (args[0] === '--all') {
    // Obtener todas las tiendas sin categorías
    const stores = await prisma.store.findMany({
      where: {
        categories: { none: {} },
        status: { not: 'ARCHIVED' },
      },
    });

    console.log(`Encontradas ${stores.length} tiendas sin categorías\n`);

    for (const store of stores) {
      try {
        totalCreated += await seedCategoriesForStore(store.id);
      } catch (error) {
        console.error(`  ❌ Error en tienda ${store.id}:`, error);
      }
    }
  } else {
    // Seed para una tienda específica
    try {
      totalCreated = await seedCategoriesForStore(args[0]);
    } catch (error) {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`✅ COMPLETADO: ${totalCreated} categorías creadas en total`);
  console.log('══════════════════════════════════════════════════════════════\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
