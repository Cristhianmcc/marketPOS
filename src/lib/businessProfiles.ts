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
// FLAGS DE PLAN (gestionados EXCLUSIVAMENTE por syncFeatureFlagsFromPlan)
// ══════════════════════════════════════════════════════════════════════════════
// IMPORTANTE: ALLOW_FIADO, ALLOW_COUPONS, ENABLE_PROMOTIONS, ENABLE_VOLUME_PROMOS,
// ENABLE_NTH_PROMOS y ENABLE_CATEGORY_PROMOS son flags de PLAN, no de perfil.
// Solo se activan cuando el SUPERADMIN asigna una suscripción (DEMO, PRO, BUSINESS).
// Con plan STARTER quedan desactivados. NO incluirlos en los presets de perfil.
export const CORE_FLAGS: FeatureFlagKey[] = [];

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
      // Bodega no necesita flags de perfil. Los flags de plan (fiado, cupones, promos)
      // los activa syncFeatureFlagsFromPlan() al asignar la suscripción.
    ],
    suggestedCategories: ['Bebidas', 'Snacks', 'Lácteos', 'Limpieza', 'Abarrotes', 'Congelados'],
  },

  FERRETERIA: {
    profile: 'FERRETERIA' as BusinessProfile,
    name: 'Ferretería',
    description: 'Venta de materiales por metro cuadrado, metro lineal, kg fraccionados. Conversiones de unidades.',
    icon: '🔧',
    enabledFlags: [
      'ENABLE_ADVANCED_UNITS' as FeatureFlagKey,    // Unidades avanzadas (m², ml, kg)
      'ENABLE_CONVERSIONS' as FeatureFlagKey,        // Conversiones automáticas (1 caja = 12 unidades)
      'ENABLE_SELLUNIT_PRICING' as FeatureFlagKey,   // Precio especial por rollo/caja/pack
      // NOTA: ENABLE_CATEGORY_PROMOS y ENABLE_VOLUME_PROMOS son flags de PLAN → los controla syncFeatureFlagsFromPlan
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
      // Pollería no necesita flags de perfil. Promos/combos via plan.
    ],
    suggestedCategories: ['Pollos', 'Combos', 'Bebidas', 'Acompañamientos', 'Extras'],
  },

  HOSTAL: {
    profile: 'HOSTAL' as BusinessProfile,
    name: 'Hostal / Hotel',
    description: 'Gestión de reservaciones, check-in/check-out, disponibilidad de habitaciones.',
    icon: '🏨',
    enabledFlags: [
      'ENABLE_RESERVATIONS' as FeatureFlagKey, // Reservaciones
      'ENABLE_SERVICES' as FeatureFlagKey,     // Servicios adicionales (lavandería, etc)
    ],
    suggestedCategories: ['Habitaciones', 'Servicios', 'Minibar', 'Extras'],
  },

  BOTICA: {
    profile: 'BOTICA' as BusinessProfile,
    name: 'Botica',
    description: 'Pequeña farmacia, control de lotes y vencimientos, FEFO automático.',
    icon: '💊',
    enabledFlags: [
      'ENABLE_BATCH_EXPIRY' as FeatureFlagKey,  // Lotes y vencimientos
      'ENABLE_FEFO_SALES' as FeatureFlagKey,    // FEFO: el que vence antes sale primero
      'ENABLE_PHARMA_FIELDS' as FeatureFlagKey, // Campos: principio activo, concentración
      'ENABLE_MEDICINE_SEARCH' as FeatureFlagKey, // Búsqueda por DCI
      'ENABLE_SUPPLIERS' as FeatureFlagKey,     // Proveedores y órdenes de compra
      'ENABLE_PATIENTS' as FeatureFlagKey,      // Historial de pacientes e interacciones
      'ENABLE_CONTROLLED_BOOK' as FeatureFlagKey, // Libro de controlados
    ],
    suggestedCategories: ['Medicamentos', 'Genéricos', 'Cuidado Personal', 'Vitaminas', 'Bebés'],
  },

  FARMACIA: {
    profile: 'FARMACIA' as BusinessProfile,
    name: 'Farmacia',
    description: 'Farmacia completa: lotes, FEFO, campos clínicos, productos controlados con registro sanitario.',
    icon: '⚕️',
    enabledFlags: [
      'ENABLE_BATCH_EXPIRY' as FeatureFlagKey,          // Lotes y vencimientos
      'ENABLE_FEFO_SALES' as FeatureFlagKey,            // FEFO automático en ventas
      'ENABLE_PHARMA_FIELDS' as FeatureFlagKey,         // Principio activo, concentración, forma farm.
      'ENABLE_MEDICINE_SEARCH' as FeatureFlagKey,       // Búsqueda DCI / principio activo
      'ENABLE_RESTRICTED_PRODUCTS' as FeatureFlagKey,  // Productos controlados / registro sanitario
      'ENABLE_SUPPLIERS' as FeatureFlagKey,             // Proveedores y órdenes de compra
      'ENABLE_PATIENTS' as FeatureFlagKey,              // Historial de pacientes e interacciones
      'ENABLE_CONTROLLED_BOOK' as FeatureFlagKey,       // Libro de controlados (DIGEMID)
    ],
    suggestedCategories: [
      'Medicamentos',
      'Genéricos',
      'Controlados',
      'Inyectables',
      'Vitaminas y Suplementos',
      'Cuidado Personal',
      'Bebés',
      'Material Médico',
      'Cosméticos',
    ],
  },

  ACCESORIOS: {
    profile: 'ACCESORIOS' as BusinessProfile,
    name: 'Accesorios / Tech',
    description: 'Tienda de celulares, accesorios tecnológicos. Configuración base.',
    icon: '📱',
    enabledFlags: [
      // Accesorios no necesita flags de perfil. Flags de plan via suscripción.
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

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS PREDETERMINADAS POR PERFIL
// ══════════════════════════════════════════════════════════════════════════════

export interface DefaultCategory {
  name: string;
  slug: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const BODEGA_DEFAULT_CATS: DefaultCategory[] = [
  { name: 'Abarrotes',              slug: 'abarrotes',              color: '#F59E0B', icon: '🛒', sortOrder: 1 },
  { name: 'Bebidas',                slug: 'bebidas',                color: '#3B82F6', icon: '🥤', sortOrder: 2 },
  { name: 'Lácteos y Derivados',    slug: 'lacteos-derivados',      color: '#BFDBFE', icon: '🥛', sortOrder: 3 },
  { name: 'Panadería y Pastelería', slug: 'panaderia-pasteleria',   color: '#D97706', icon: '🍞', sortOrder: 4 },
  { name: 'Carnes y Embutidos',     slug: 'carnes-embutidos',       color: '#EF4444', icon: '🥩', sortOrder: 5 },
  { name: 'Frutas y Verduras',      slug: 'frutas-verduras',        color: '#10B981', icon: '🥦', sortOrder: 6 },
  { name: 'Limpieza del Hogar',     slug: 'limpieza-hogar',         color: '#6366F1', icon: '🧹', sortOrder: 7 },
  { name: 'Cuidado Personal',       slug: 'cuidado-personal',       color: '#EC4899', icon: '🧴', sortOrder: 8 },
  { name: 'Golosinas y Snacks',     slug: 'golosinas-snacks',       color: '#F97316', icon: '🍬', sortOrder: 9 },
  { name: 'Congelados',             slug: 'congelados',             color: '#60A5FA', icon: '🧊', sortOrder: 10 },
  { name: 'Farmacia',               slug: 'farmacia',               color: '#34D399', icon: '💊', sortOrder: 11 },
  { name: 'Otros',                  slug: 'otros',                  color: '#9CA3AF', icon: '📦', sortOrder: 12 },
];

const FERRETERIA_DEFAULT_CATS: DefaultCategory[] = [
  { name: 'Herramientas',           slug: 'herramientas',           color: '#F59E0B', icon: '🔨', sortOrder: 1 },
  { name: 'Electricidad',           slug: 'electricidad',           color: '#3B82F6', icon: '💡', sortOrder: 2 },
  { name: 'Plomería',               slug: 'plomeria',               color: '#0EA5E9', icon: '🔧', sortOrder: 3 },
  { name: 'Pinturas',               slug: 'pinturas',               color: '#A855F7', icon: '🎨', sortOrder: 4 },
  { name: 'Tornillería',            slug: 'tornilleria',            color: '#6B7280', icon: '🔩', sortOrder: 5 },
  { name: 'Materiales',             slug: 'materiales',             color: '#78716C', icon: '🏗️', sortOrder: 6 },
  { name: 'Seguridad',              slug: 'seguridad',              color: '#22C55E', icon: '🔒', sortOrder: 7 },
  { name: 'Jardinería',             slug: 'jardineria',             color: '#84CC16', icon: '🌱', sortOrder: 8 },
  { name: 'Automotriz',             slug: 'automotriz',             color: '#EF4444', icon: '🚗', sortOrder: 9 },
  { name: 'Adhesivos',              slug: 'adhesivos',              color: '#F97316', icon: '📎', sortOrder: 10 },
  { name: 'Otros',                  slug: 'otros',                  color: '#9CA3AF', icon: '📦', sortOrder: 11 },
];

const BOTICA_DEFAULT_CATS: DefaultCategory[] = [
  { name: 'Analgésicos',            slug: 'analgesicos',            color: '#EF4444', icon: '💊', sortOrder: 1 },
  { name: 'Antibióticos',           slug: 'antibioticos',           color: '#8B5CF6', icon: '💊', sortOrder: 2 },
  { name: 'Antigripales y Tos',     slug: 'antigripales-tos',       color: '#3B82F6', icon: '🤧', sortOrder: 3 },
  { name: 'Antiácidos y Digestivos',slug: 'antiacidos-digestivos',  color: '#F59E0B', icon: '🫶', sortOrder: 4 },
  { name: 'Vitaminas y Suplementos',slug: 'vitaminas-suplementos',  color: '#10B981', icon: '💪', sortOrder: 5 },
  { name: 'Genéricos',              slug: 'genericos',              color: '#6366F1', icon: '💊', sortOrder: 6 },
  { name: 'Uso Tópico',             slug: 'uso-topico',             color: '#F97316', icon: '🧴', sortOrder: 7 },
  { name: 'Infantil y Bebés',       slug: 'infantil-bebes',         color: '#EC4899', icon: '👶', sortOrder: 8 },
  { name: 'Cuidado Personal',       slug: 'cuidado-personal-bot',   color: '#22C55E', icon: '✨', sortOrder: 9 },
  { name: 'Otros Medicamentos',     slug: 'otros-medicamentos',     color: '#9CA3AF', icon: '📦', sortOrder: 10 },
];

const FARMACIA_DEFAULT_CATS: DefaultCategory[] = [
  { name: 'Analgésicos',            slug: 'analgesicos',            color: '#EF4444', icon: '💊', sortOrder: 1 },
  { name: 'Antibióticos',           slug: 'antibioticos',           color: '#8B5CF6', icon: '💊', sortOrder: 2 },
  { name: 'Antigripales y Tos',     slug: 'antigripales-tos',       color: '#3B82F6', icon: '🤧', sortOrder: 3 },
  { name: 'Antiácidos y Digestivos',slug: 'antiacidos-digestivos',  color: '#F59E0B', icon: '🫶', sortOrder: 4 },
  { name: 'Vitaminas y Suplementos',slug: 'vitaminas-suplementos',  color: '#10B981', icon: '💪', sortOrder: 5 },
  { name: 'Controlados (Rx)',        slug: 'controlados-rx',         color: '#DC2626', icon: '⚠️', sortOrder: 6 },
  { name: 'Inyectables y Ampollas', slug: 'inyectables-ampollas',   color: '#7C3AED', icon: '💉', sortOrder: 7 },
  { name: 'Genéricos',              slug: 'genericos',              color: '#6366F1', icon: '💊', sortOrder: 8 },
  { name: 'Uso Tópico',             slug: 'uso-topico',             color: '#F97316', icon: '🧴', sortOrder: 9 },
  { name: 'Infantil y Bebés',       slug: 'infantil-bebes',         color: '#EC4899', icon: '👶', sortOrder: 10 },
  { name: 'Material Médico',        slug: 'material-medico',        color: '#0EA5E9', icon: '🏥', sortOrder: 11 },
  { name: 'Cosméticos',             slug: 'cosmeticos',             color: '#F472B6', icon: '💄', sortOrder: 12 },
  { name: 'Cuidado Personal',       slug: 'cuidado-personal-far',   color: '#22C55E', icon: '✨', sortOrder: 13 },
  { name: 'Otros Medicamentos',     slug: 'otros-medicamentos',     color: '#9CA3AF', icon: '📦', sortOrder: 14 },
];

const DEFAULT_CATEGORIES_BY_PROFILE: Record<BusinessProfile, DefaultCategory[]> = {
  BODEGA:     BODEGA_DEFAULT_CATS,
  FERRETERIA: FERRETERIA_DEFAULT_CATS,
  TALLER:     [
    { name: 'Repuestos',     slug: 'repuestos',     color: '#F59E0B', icon: '⚙️', sortOrder: 1 },
    { name: 'Mano de Obra',  slug: 'mano-de-obra',  color: '#3B82F6', icon: '🔧', sortOrder: 2 },
    { name: 'Diagnóstico',   slug: 'diagnostico',   color: '#10B981', icon: '🔍', sortOrder: 3 },
    { name: 'Accesorios',    slug: 'accesorios',    color: '#8B5CF6', icon: '🔌', sortOrder: 4 },
    { name: 'Otros',         slug: 'otros',         color: '#9CA3AF', icon: '📦', sortOrder: 5 },
  ],
  LAVANDERIA: [
    { name: 'Lavado',        slug: 'lavado',        color: '#3B82F6', icon: '👕', sortOrder: 1 },
    { name: 'Planchado',     slug: 'planchado',     color: '#6366F1', icon: '♨️', sortOrder: 2 },
    { name: 'Tintorería',    slug: 'tintoreria',    color: '#8B5CF6', icon: '🧺', sortOrder: 3 },
    { name: 'Express',       slug: 'express',       color: '#F97316', icon: '⚡',  sortOrder: 4 },
    { name: 'Otros',         slug: 'otros',         color: '#9CA3AF', icon: '📦', sortOrder: 5 },
  ],
  POLLERIA:   [
    { name: 'Pollos',        slug: 'pollos',        color: '#F59E0B', icon: '🍗', sortOrder: 1 },
    { name: 'Combos',        slug: 'combos',        color: '#EF4444', icon: '🍽️', sortOrder: 2 },
    { name: 'Bebidas',       slug: 'bebidas',       color: '#3B82F6', icon: '🥤', sortOrder: 3 },
    { name: 'Acompañamientos',slug: 'acompanamientos',color:'#10B981',icon:'🥗', sortOrder: 4 },
    { name: 'Extras',        slug: 'extras',        color: '#9CA3AF', icon: '➕',  sortOrder: 5 },
  ],
  HOSTAL:     [
    { name: 'Habitaciones',  slug: 'habitaciones',  color: '#3B82F6', icon: '🛏️', sortOrder: 1 },
    { name: 'Servicios',     slug: 'servicios',     color: '#10B981', icon: '✅',  sortOrder: 2 },
    { name: 'Minibar',       slug: 'minibar',       color: '#F59E0B', icon: '🍹', sortOrder: 3 },
    { name: 'Extras',        slug: 'extras',        color: '#9CA3AF', icon: '➕',  sortOrder: 4 },
  ],
  BOTICA:     BOTICA_DEFAULT_CATS,
  FARMACIA:   FARMACIA_DEFAULT_CATS,
  ACCESORIOS: [
    { name: 'Celulares',     slug: 'celulares',     color: '#3B82F6', icon: '📱', sortOrder: 1 },
    { name: 'Fundas y Vidrios',slug:'fundas-vidrios',color:'#6366F1', icon: '📲', sortOrder: 2 },
    { name: 'Cargadores',    slug: 'cargadores',    color: '#F59E0B', icon: '🔋', sortOrder: 3 },
    { name: 'Audífonos',     slug: 'audifonos',     color: '#8B5CF6', icon: '🎧', sortOrder: 4 },
    { name: 'Cables',        slug: 'cables',        color: '#EC4899', icon: '🔌', sortOrder: 5 },
    { name: 'Reparación',    slug: 'reparacion',    color: '#10B981', icon: '🔧', sortOrder: 6 },
    { name: 'Otros',         slug: 'otros',         color: '#9CA3AF', icon: '📦', sortOrder: 7 },
  ],
};

/**
 * Devuelve las categorías predeterminadas para un perfil de negocio.
 * Úsalo al crear tienda para sembrar categorías correctas.
 */
export function getDefaultCategoriesForProfile(profile: BusinessProfile): DefaultCategory[] {
  return DEFAULT_CATEGORIES_BY_PROFILE[profile] ?? BODEGA_DEFAULT_CATS;
}
