/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V1 — BUSINESS PROFILE PRESETS
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Define los flags recomendados para cada perfil de negocio.
 * Al crear/cambiar perfil, estos flags se aplican automáticamente.
 * 
 * REGLAS:
 * - Los flags core (ALLOW_FIADO, ALLOW_COUPONS, ENABLE_PROMOTIONS, etc.) 
 *   vienen ON por defecto en todos los perfiles.
 * - Los flags multi-rubro se activan según el perfil.
 * - Cambiar perfil NO borra datos, solo cambia flags.
 * - Los flags fuera del plan del usuario NO se activan (verificar licencia).
 */

import { BusinessProfile, FeatureFlagKey } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

export interface BusinessProfilePreset {
  profile: BusinessProfile;
  name: string;
  description: string;
  icon: string;
  /** Flags que se activan para este perfil */
  enabledFlags: FeatureFlagKey[];
  /** Categorías de productos sugeridas */
  suggestedCategories?: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// FLAGS CORE (siempre disponibles para todos los perfiles)
// ══════════════════════════════════════════════════════════════════════════════

export const CORE_FLAGS: FeatureFlagKey[] = [
  'ALLOW_FIADO',
  'ALLOW_COUPONS',
  'ENABLE_PROMOTIONS',
  'ENABLE_VOLUME_PROMOS',
  'ENABLE_NTH_PROMOS',
  'ENABLE_CATEGORY_PROMOS',
] as FeatureFlagKey[];

// ══════════════════════════════════════════════════════════════════════════════
// PRESETS POR PERFIL
// ══════════════════════════════════════════════════════════════════════════════

export const BUSINESS_PROFILE_PRESETS: Record<BusinessProfile, BusinessProfilePreset> = {
  BODEGA: {
    profile: 'BODEGA' as BusinessProfile,
    name: 'Bodega / Minimarket',
    description: 'Tienda de abarrotes, productos de consumo masivo. Configuración base sin módulos especiales.',
    icon: '🏪',
    enabledFlags: [
      ...CORE_FLAGS,
      // Bodega no necesita flags multi-rubro
    ],
    suggestedCategories: ['Bebidas', 'Snacks', 'Lácteos', 'Limpieza', 'Abarrotes', 'Congelados'],
  },

  FERRETERIA: {
    profile: 'FERRETERIA' as BusinessProfile,
    name: 'Ferretería',
    description: 'Venta de materiales por metro cuadrado, metro lineal, kg fraccionados. Conversiones de unidades.',
    icon: '🔧',
    enabledFlags: [
      ...CORE_FLAGS,
      'ENABLE_ADVANCED_UNITS' as FeatureFlagKey, // Unidades avanzadas (m², ml, kg)
      'ENABLE_CONVERSIONS' as FeatureFlagKey,    // Conversiones automáticas (1 caja = 12 unidades)
      'ENABLE_CATEGORY_PROMOS' as FeatureFlagKey, // Promos por categoría (opcional pero útil)
      'ENABLE_VOLUME_PROMOS' as FeatureFlagKey,   // Promos por volumen (compra más, paga menos)
      // NOTA: ENABLE_SERVICES y ENABLE_WORK_ORDERS se activan en F3/F4
    ],
    suggestedCategories: [
      'Tornillería',
      'Herramientas',
      'Pinturas',
      'Electricidad',
      'Gasfitería',
      'Construcción',
      'Acabados',
      'Seguridad',
      'Adhesivos',
      'PVC',
      'Cables',
      'Fierros/Metales',
      'Vidrios',
      'Lubricantes',
    ],
  },

  TALLER: {
    profile: 'TALLER' as BusinessProfile,
    name: 'Taller / Servicio Técnico',
    description: 'Reparaciones con mano de obra, órdenes de trabajo con seguimiento. Mecánico, electrónico, etc.',
    icon: '🔩',
    enabledFlags: [
      ...CORE_FLAGS,
      'ENABLE_SERVICES' as FeatureFlagKey,     // Servicios (mano de obra)
      'ENABLE_WORK_ORDERS' as FeatureFlagKey,  // Órdenes de trabajo
    ],
    suggestedCategories: ['Repuestos', 'Mano de Obra', 'Diagnóstico', 'Accesorios'],
  },

  LAVANDERIA: {
    profile: 'LAVANDERIA' as BusinessProfile,
    name: 'Lavandería',
    description: 'Servicios de lavado por prenda o kg. Sin inventario de productos, solo servicios.',
    icon: '🧺',
    enabledFlags: [
      ...CORE_FLAGS,
      'ENABLE_SERVICES' as FeatureFlagKey, // Servicios (lavado, planchado)
    ],
    suggestedCategories: ['Lavado', 'Planchado', 'Tintorería', 'Express'],
  },

  POLLERIA: {
    profile: 'POLLERIA' as BusinessProfile,
    name: 'Pollería / Restaurante',
    description: 'Venta de combos, platos preparados. Configuración base con promociones.',
    icon: '🍗',
    enabledFlags: [
      ...CORE_FLAGS,
      // Pollería usa solo flags core (promociones, combos vía volume promos)
    ],
    suggestedCategories: ['Pollos', 'Combos', 'Bebidas', 'Acompañamientos', 'Extras'],
  },

  HOSTAL: {
    profile: 'HOSTAL' as BusinessProfile,
    name: 'Hostal / Hotel',
    description: 'Gestión de reservaciones, check-in/check-out, disponibilidad de habitaciones.',
    icon: '🏨',
    enabledFlags: [
      ...CORE_FLAGS,
      'ENABLE_RESERVATIONS' as FeatureFlagKey, // Reservaciones
      'ENABLE_SERVICES' as FeatureFlagKey,     // Servicios adicionales (lavandería, etc)
    ],
    suggestedCategories: ['Habitaciones', 'Servicios', 'Minibar', 'Extras'],
  },

  BOTICA: {
    profile: 'BOTICA' as BusinessProfile,
    name: 'Botica / Farmacia',
    description: 'Control de lotes, fechas de vencimiento, trazabilidad. FIFO automático.',
    icon: '💊',
    enabledFlags: [
      ...CORE_FLAGS,
      'ENABLE_BATCH_EXPIRY' as FeatureFlagKey, // Lotes y vencimientos
    ],
    suggestedCategories: ['Medicamentos', 'Genéricos', 'Cuidado Personal', 'Vitaminas', 'Bebés'],
  },

  ACCESORIOS: {
    profile: 'ACCESORIOS' as BusinessProfile,
    name: 'Accesorios / Tech',
    description: 'Tienda de celulares, accesorios tecnológicos. Configuración base.',
    icon: '📱',
    enabledFlags: [
      ...CORE_FLAGS,
      // Accesorios usa configuración base
    ],
    suggestedCategories: ['Celulares', 'Fundas', 'Cargadores', 'Audífonos', 'Cables', 'Reparación'],
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene el preset para un perfil de negocio
 */
export function getProfilePreset(profile: BusinessProfile): BusinessProfilePreset {
  return BUSINESS_PROFILE_PRESETS[profile];
}

/**
 * Obtiene todos los presets disponibles
 */
export function getAllProfilePresets(): BusinessProfilePreset[] {
  return Object.values(BUSINESS_PROFILE_PRESETS);
}

/**
 * Obtiene los flags que deben estar habilitados para un perfil
 */
export function getProfileFlags(profile: BusinessProfile): FeatureFlagKey[] {
  return BUSINESS_PROFILE_PRESETS[profile].enabledFlags;
}

/**
 * Verifica si un flag es parte de un perfil
 */
export function isProfileFlag(profile: BusinessProfile, flag: FeatureFlagKey): boolean {
  return BUSINESS_PROFILE_PRESETS[profile].enabledFlags.includes(flag);
}

/**
 * Obtiene los flags multi-rubro (no core) de un perfil
 */
export function getProfileMultiRubroFlags(profile: BusinessProfile): FeatureFlagKey[] {
  const preset = BUSINESS_PROFILE_PRESETS[profile];
  return preset.enabledFlags.filter(flag => !CORE_FLAGS.includes(flag));
}

/**
 * Lista de todos los perfiles disponibles
 */
export function getAvailableProfiles(): BusinessProfile[] {
  return Object.keys(BUSINESS_PROFILE_PRESETS) as BusinessProfile[];
}
