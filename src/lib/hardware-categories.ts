/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F5 — CATEGORÍAS SUGERIDAS POR RUBRO
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Categorías predefinidas para diferentes tipos de negocios.
 * Se usan como sugerencias en el UI (autocomplete, dropdown).
 * El usuario puede crear categorías personalizadas.
 */

export type BusinessType = 'BODEGA' | 'FERRETERIA' | 'MINIMARKET' | 'RESTAURANTE' | 'FARMACIA' | 'LIBRERIA' | 'OTRO';

export interface CategoryGroup {
  name: string;
  categories: string[];
}

// ════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS BODEGA / MINIMARKET
// ════════════════════════════════════════════════════════════════════════════
export const BODEGA_CATEGORIES: CategoryGroup[] = [
  {
    name: 'Bebidas',
    categories: [
      'Gaseosas',
      'Aguas',
      'Jugos y Néctares',
      'Bebidas Energéticas',
      'Cervezas',
      'Vinos y Licores',
    ],
  },
  {
    name: 'Abarrotes',
    categories: [
      'Arroz y Menestras',
      'Aceites',
      'Azúcar y Endulzantes',
      'Fideos y Pastas',
      'Conservas',
      'Salsas y Condimentos',
      'Harinas y Panificación',
    ],
  },
  {
    name: 'Lácteos y Huevos',
    categories: [
      'Leches',
      'Yogures',
      'Quesos',
      'Mantequilla y Margarina',
      'Huevos',
    ],
  },
  {
    name: 'Panadería',
    categories: [
      'Panes',
      'Galletas',
      'Pasteles y Tortas',
    ],
  },
  {
    name: 'Snacks y Golosinas',
    categories: [
      'Chocolates',
      'Caramelos',
      'Snacks Salados',
      'Helados',
    ],
  },
  {
    name: 'Limpieza',
    categories: [
      'Detergentes',
      'Lejías y Desinfectantes',
      'Jabones',
      'Papel Higiénico',
    ],
  },
  {
    name: 'Cuidado Personal',
    categories: [
      'Shampoo y Acondicionador',
      'Jabones Personales',
      'Desodorantes',
      'Pasta Dental',
    ],
  },
  {
    name: 'Otros',
    categories: ['Otros'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS FERRETERÍA
// ════════════════════════════════════════════════════════════════════════════
export const FERRETERIA_CATEGORIES: CategoryGroup[] = [
  {
    name: 'Construcción',
    categories: [
      'Cemento y Agregados',
      'Ladrillos y Bloques',
      'Fierros y Varillas',
      'Alambre y Mallas',
      'Arena y Piedra',
    ],
  },
  {
    name: 'Plomería',
    categories: [
      'Tubos PVC',
      'Accesorios PVC',
      'Tubos CPVC',
      'Grifería',
      'Válvulas',
      'Tanques y Cisternas',
      'Pegamento PVC',
    ],
  },
  {
    name: 'Electricidad',
    categories: [
      'Cables Eléctricos',
      'Interruptores',
      'Tomacorrientes',
      'Luminarias',
      'Focos y Fluorescentes',
      'Tableros Eléctricos',
      'Breakers',
      'Canaletas y Tubos Conduit',
    ],
  },
  {
    name: 'Pinturas',
    categories: [
      'Pinturas Látex',
      'Esmaltes',
      'Thinner y Solventes',
      'Brochas',
      'Rodillos',
      'Lijas',
      'Masillas',
      'Impermeabilizantes',
    ],
  },
  {
    name: 'Herramientas',
    categories: [
      'Martillos',
      'Destornilladores',
      'Llaves',
      'Alicates',
      'Serruchos',
      'Taladros',
      'Amoladoras',
      'Combas y Cinceles',
      'Metros y Niveles',
    ],
  },
  {
    name: 'Carpintería',
    categories: [
      'Madera Machihembrada',
      'Tableros',
      'Melamina',
      'MDF',
      'Triplay',
      'Tornillos',
      'Clavos',
      'Bisagras',
      'Cerraduras',
      'Jaladores',
    ],
  },
  {
    name: 'Seguridad',
    categories: [
      'Candados',
      'Chapas',
      'Cadenas',
      'Guantes',
      'Cascos',
      'Lentes de Seguridad',
      'Mascarillas',
      'Botas de Seguridad',
    ],
  },
  {
    name: 'Acabados',
    categories: [
      'Cerámicos',
      'Porcelanatos',
      'Pegamento para Cerámico',
      'Fraguas',
      'Crucetas',
    ],
  },
  {
    name: 'Adhesivos',
    categories: [
      'Pegamentos',
      'Siliconas',
      'Selladores',
      'Cintas Adhesivas',
      'Epóxicos',
    ],
  },
  {
    name: 'Jardinería',
    categories: [
      'Mangueras',
      'Aspersores',
      'Tijeras de Podar',
      'Macetas',
      'Abonos',
    ],
  },
  {
    name: 'Otros',
    categories: ['Otros'],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las categorías como lista plana
 */
export function getFlatCategories(groups: CategoryGroup[]): string[] {
  return groups.flatMap(g => g.categories);
}

/**
 * Obtiene categorías según tipo de negocio
 */
export function getCategoriesForBusiness(type: BusinessType): CategoryGroup[] {
  switch (type) {
    case 'BODEGA':
    case 'MINIMARKET':
      return BODEGA_CATEGORIES;
    case 'FERRETERIA':
      return FERRETERIA_CATEGORIES;
    default:
      return [{ name: 'General', categories: ['Otros'] }];
  }
}

/**
 * Categorías planas para ferretería (para CSV/import)
 */
export const FLAT_FERRETERIA_CATEGORIES = getFlatCategories(FERRETERIA_CATEGORIES);

/**
 * Categorías planas para bodega (para CSV/import)
 */
export const FLAT_BODEGA_CATEGORIES = getFlatCategories(BODEGA_CATEGORIES);

/**
 * Todas las categorías combinadas
 */
export const ALL_CATEGORIES = [
  ...new Set([...FLAT_FERRETERIA_CATEGORIES, ...FLAT_BODEGA_CATEGORIES]),
].sort();
