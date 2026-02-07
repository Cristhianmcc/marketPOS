/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — GUARDS REUTILIZABLES PARA AISLAMIENTO POR FEATURE FLAGS
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Guards centralizados para proteger endpoints de módulos.
 * Si un flag está OFF, el módulo NO debe ejecutarse.
 * 
 * Uso en route.ts:
 * ```ts
 * const session = await getSessionOrThrow();
 * await requireStoreActive(session.storeId);
 * await requireFlag(session.storeId, 'ENABLE_ADVANCED_UNITS');
 * requireRole(session.role, ['ADMIN', 'OWNER']);
 * ```
 */

import { prisma } from '@/infra/db/prisma';
import { FeatureFlagKey, StoreStatus } from '@prisma/client';
import { UserRole } from '@/domain/types';
import { isFeatureEnabled } from '@/lib/featureFlags';

// ══════════════════════════════════════════════════════════════════════════════
// ERRORES PERSONALIZADOS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Error cuando un feature flag está deshabilitado
 */
export class FeatureDisabledError extends Error {
  code = 'FEATURE_DISABLED' as const;
  statusCode = 403;
  flagKey: FeatureFlagKey;

  constructor(flagKey: FeatureFlagKey) {
    super(`La funcionalidad ${flagKey} no está habilitada para esta tienda`);
    this.name = 'FeatureDisabledError';
    this.flagKey = flagKey;
  }
}

/**
 * Error cuando la tienda está archivada
 */
export class StoreArchivedError extends Error {
  code = 'STORE_ARCHIVED' as const;
  statusCode = 403;
  storeId: string;

  constructor(storeId: string) {
    super('La tienda está archivada y no puede realizar operaciones');
    this.name = 'StoreArchivedError';
    this.storeId = storeId;
  }
}

/**
 * Error cuando el usuario no tiene el rol requerido
 */
export class ForbiddenRoleError extends Error {
  code = 'FORBIDDEN' as const;
  statusCode = 403;
  userRole: UserRole;
  requiredRoles: UserRole[];

  constructor(userRole: UserRole, requiredRoles: UserRole[]) {
    super(`Rol ${userRole} no tiene permiso. Roles requeridos: ${requiredRoles.join(', ')}`);
    this.name = 'ForbiddenRoleError';
    this.userRole = userRole;
    this.requiredRoles = requiredRoles;
  }
}

/**
 * Error cuando la tienda no existe
 */
export class StoreNotFoundError extends Error {
  code = 'STORE_NOT_FOUND' as const;
  statusCode = 404;
  storeId: string;

  constructor(storeId: string) {
    super(`Tienda ${storeId} no encontrada`);
    this.name = 'StoreNotFoundError';
    this.storeId = storeId;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GUARDS PRINCIPALES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica que un feature flag esté habilitado para la tienda.
 * Si está OFF, lanza FeatureDisabledError (403).
 * 
 * @param storeId - ID de la tienda
 * @param flagKey - Clave del flag a verificar
 * @throws FeatureDisabledError si el flag está deshabilitado
 */
export async function requireFlag(
  storeId: string,
  flagKey: FeatureFlagKey
): Promise<void> {
  const enabled = await isFeatureEnabled(storeId, flagKey);
  
  if (!enabled) {
    throw new FeatureDisabledError(flagKey);
  }
}

/**
 * Verifica que la tienda esté activa (no archivada).
 * Si está ARCHIVED, lanza StoreArchivedError (403).
 * 
 * @param storeId - ID de la tienda
 * @throws StoreArchivedError si la tienda está archivada
 * @throws StoreNotFoundError si la tienda no existe
 */
export async function requireStoreActive(storeId: string): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { status: true },
  });

  if (!store) {
    throw new StoreNotFoundError(storeId);
  }

  if (store.status === StoreStatus.ARCHIVED) {
    throw new StoreArchivedError(storeId);
  }
}

/**
 * Verifica que el usuario tenga uno de los roles requeridos.
 * Si no tiene el rol, lanza ForbiddenRoleError (403).
 * 
 * @param userRole - Rol actual del usuario
 * @param allowedRoles - Roles permitidos para la operación
 * @throws ForbiddenRoleError si el usuario no tiene un rol permitido
 */
export function requireRole(
  userRole: UserRole,
  allowedRoles: UserRole[]
): void {
  if (!allowedRoles.includes(userRole)) {
    throw new ForbiddenRoleError(userRole, allowedRoles);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS PARA RESPONSE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convierte errores de guards a respuestas HTTP
 */
export function guardErrorToResponse(error: unknown): Response {
  if (error instanceof FeatureDisabledError) {
    return Response.json(
      { 
        error: error.message, 
        code: error.code,
        flagKey: error.flagKey 
      },
      { status: 403 }
    );
  }

  if (error instanceof StoreArchivedError) {
    return Response.json(
      { 
        error: error.message, 
        code: error.code 
      },
      { status: 403 }
    );
  }

  if (error instanceof ForbiddenRoleError) {
    return Response.json(
      { 
        error: error.message, 
        code: error.code,
        requiredRoles: error.requiredRoles 
      },
      { status: 403 }
    );
  }

  if (error instanceof StoreNotFoundError) {
    return Response.json(
      { 
        error: error.message, 
        code: error.code 
      },
      { status: 404 }
    );
  }

  // Error genérico
  if (error instanceof Error && error.message === 'UNAUTHORIZED') {
    return Response.json(
      { error: 'No autenticado', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  // Error desconocido
  console.error('[Guard] Error desconocido:', error);
  return Response.json(
    { error: 'Error interno del servidor' },
    { status: 500 }
  );
}

/**
 * Verifica si un error es un error de guard conocido
 */
export function isGuardError(error: unknown): boolean {
  return (
    error instanceof FeatureDisabledError ||
    error instanceof StoreArchivedError ||
    error instanceof ForbiddenRoleError ||
    error instanceof StoreNotFoundError
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAPA DE FLAGS POR MÓDULO (para documentación y validación)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Mapeo de rutas a flags requeridos
 * Útil para middleware centralizado o documentación
 */
export const MODULE_FLAG_MAP: Record<string, FeatureFlagKey> = {
  '/api/units': 'ENABLE_ADVANCED_UNITS' as FeatureFlagKey,
  '/api/services': 'ENABLE_SERVICES' as FeatureFlagKey,
  '/api/work-orders': 'ENABLE_WORK_ORDERS' as FeatureFlagKey,
  '/api/reservations': 'ENABLE_RESERVATIONS' as FeatureFlagKey,
  '/api/batches': 'ENABLE_BATCH_EXPIRY' as FeatureFlagKey,
};

/**
 * Descripción de cada módulo multi-rubro
 */
export const MODULE_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  ENABLE_ADVANCED_UNITS: 'Unidades avanzadas para ferretería (m², ml, kg fraccionados)',
  ENABLE_SERVICES: 'Servicios para taller/lavandería (mano de obra, sin inventario)',
  ENABLE_WORK_ORDERS: 'Órdenes de trabajo para taller (recepción, seguimiento)',
  ENABLE_RESERVATIONS: 'Reservaciones para hostal/hotel (check-in, disponibilidad)',
  ENABLE_BATCH_EXPIRY: 'Lotes y vencimientos para botica/farmacia (trazabilidad)',
  // Flags core (ya existentes)
  ALLOW_FIADO: 'Permite ventas fiadas (cuentas por cobrar)',
  ALLOW_COUPONS: 'Permite uso de cupones de descuento',
  ENABLE_PROMOTIONS: 'Habilita sistema de promociones',
  ENABLE_VOLUME_PROMOS: 'Promociones por volumen (3x2, etc)',
  ENABLE_NTH_PROMOS: 'Promociones n-ésimo producto',
  ENABLE_CATEGORY_PROMOS: 'Promociones por categoría',
  ENABLE_SUNAT: 'Facturación electrónica SUNAT',
} as Record<FeatureFlagKey, string>;
