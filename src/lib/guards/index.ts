/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — GUARDS INDEX
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Re-exporta todos los guards para uso conveniente.
 * 
 * Uso:
 * ```ts
 * import { requireFlag, requireStoreActive, requireRole } from '@/lib/guards';
 * ```
 */

export {
  // Guards principales
  requireFlag,
  requireStoreActive,
  requireRole,
  
  // Errores
  FeatureDisabledError,
  StoreArchivedError,
  ForbiddenRoleError,
  StoreNotFoundError,
  
  // Helpers
  guardErrorToResponse,
  isGuardError,
  
  // Constantes
  MODULE_FLAG_MAP,
  MODULE_DESCRIPTIONS,
} from './requireFlag';
