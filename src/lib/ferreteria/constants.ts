/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO F0 — CONSTANTES DE FERRETERÍA
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Categorías, unidades y configuraciones base para negocios tipo ferretería.
 * Usadas por el preset de BusinessProfile y UI de productos.
 */

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS BASE FERRETERÍA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Categorías estándar para productos de ferretería.
 * Ordenadas alfabéticamente para fácil búsqueda.
 */
export const FERRETERIA_CATEGORIES = [
  'Acabados',
  'Adhesivos',
  'Cables',
  'Construcción',
  'Electricidad',
  'Fierros/Metales',
  'Gasfitería',
  'Herramientas',
  'Lubricantes',
  'Pinturas',
  'PVC',
  'Seguridad',
  'Tornillería',
  'Vidrios',
] as const;

export type FerreteriaCategory = typeof FERRETERIA_CATEGORIES[number];

// ══════════════════════════════════════════════════════════════════════════════
// UNIDADES RECOMENDADAS POR CATEGORÍA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Mapeo de categoría a unidades típicas.
 * Ayuda a sugerir unidad base al crear producto.
 */
export const CATEGORY_TYPICAL_UNITS: Record<FerreteriaCategory, string[]> = {
  'Acabados': ['UNIT', 'M2', 'BOX'],
  'Adhesivos': ['UNIT', 'KG', 'L'],
  'Cables': ['M', 'ROLL'],
  'Construcción': ['UNIT', 'M', 'M2', 'KG'],
  'Electricidad': ['UNIT', 'M', 'BOX'],
  'Fierros/Metales': ['UNIT', 'M', 'KG'],
  'Gasfitería': ['UNIT', 'M'],
  'Herramientas': ['UNIT', 'BOX'],
  'Lubricantes': ['UNIT', 'L', 'ML'],
  'Pinturas': ['UNIT', 'L', 'KG'],
  'PVC': ['UNIT', 'M'],
  'Seguridad': ['UNIT', 'PAIR', 'BOX'],
  'Tornillería': ['UNIT', 'BOX', 'KG', 'DOZEN'],
  'Vidrios': ['M2', 'UNIT'],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIDADES QUE PERMITEN DECIMALES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Unidades que aceptan cantidades fraccionarias.
 * Las demás solo aceptan enteros.
 */
export const DECIMAL_UNITS = ['KG', 'G', 'L', 'ML', 'M', 'CM', 'MM', 'M2', 'ROLL'] as const;

/**
 * Unidades que solo aceptan enteros.
 */
export const INTEGER_UNITS = ['UNIT', 'BOX', 'PACK', 'DOZEN', 'PAIR'] as const;

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica si una unidad permite decimales.
 */
export function isDecimalUnit(unitCode: string): boolean {
  return (DECIMAL_UNITS as readonly string[]).includes(unitCode);
}

/**
 * Obtiene las unidades típicas para una categoría.
 */
export function getTypicalUnits(category: string): string[] {
  return CATEGORY_TYPICAL_UNITS[category as FerreteriaCategory] || ['UNIT'];
}
