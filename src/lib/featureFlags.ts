// lib/featureFlags.ts
// ✅ MÓDULO 15 - FASE 2: Feature Flags
// ✅ MÓDULO S3: TTL Cache + Invalidación
// Helper centralizado para verificar flags por tienda

import { prisma } from '@/infra/db/prisma';
import { FeatureFlagKey } from '@prisma/client';

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO S3: CACHE CON TTL POR TIENDA
// ════════════════════════════════════════════════════════════════════════════

/**
 * TTL configurable vía env (default: 60 segundos)
 */
const CACHE_TTL_MS = (parseInt(process.env.FEATURE_FLAGS_TTL_SECONDS || '60', 10)) * 1000;

/**
 * Estructura del cache con timestamp
 */
interface CacheEntry {
  value: boolean;
  timestamp: number;
}

/**
 * Cache en memoria con TTL para flags
 * Formato: "storeId:flagKey" => { value, timestamp }
 */
const flagCache = new Map<string, CacheEntry>();

/**
 * Cache de todos los flags por tienda (para getAllFeatureFlags)
 */
interface StoreFlagsCache {
  flags: Map<FeatureFlagKey, boolean>;
  timestamp: number;
}
const storeFlagsCache = new Map<string, StoreFlagsCache>();

/**
 * Verifica si una entrada de cache está expirada
 */
function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL_MS;
}

/**
 * Verifica si una feature está habilitada para una tienda
 * MÓDULO S3: Usa cache con TTL para reducir queries
 * @param storeId - ID de la tienda
 * @param flagKey - Clave del flag
 * @returns true si está habilitado, false si está deshabilitado o no existe
 */
export async function isFeatureEnabled(
  storeId: string,
  flagKey: FeatureFlagKey
): Promise<boolean> {
  try {
    const cacheKey = `${storeId}:${flagKey}`;
    
    // Verificar cache con TTL
    const cached = flagCache.get(cacheKey);
    if (cached && !isCacheExpired(cached.timestamp)) {
      return cached.value;
    }

    // Buscar en DB
    const flag = await prisma.featureFlag.findUnique({
      where: {
        storeId_key: {
          storeId,
          key: flagKey,
        },
      },
    });

    // Si no existe, default = false (seguro)
    const enabled = flag?.enabled ?? false;
    
    // Guardar en cache con timestamp
    flagCache.set(cacheKey, { value: enabled, timestamp: Date.now() });
    
    return enabled;
  } catch (error) {
    console.error(`[FeatureFlags] Error checking ${flagKey} for store ${storeId}:`, error);
    // En caso de error, default seguro = false
    return false;
  }
}

/**
 * Verifica si una feature está habilitada, lanzando error 403 si no lo está
 * @param storeId - ID de la tienda
 * @param flagKey - Clave del flag
 * @throws Error con código FEATURE_DISABLED si flag está deshabilitado
 */
export async function requireFeature(
  storeId: string,
  flagKey: FeatureFlagKey
): Promise<void> {
  const enabled = await isFeatureEnabled(storeId, flagKey);
  
  if (!enabled) {
    throw new FeatureDisabledError(flagKey);
  }
}

/**
 * Error personalizado para features deshabilitadas
 */
export class FeatureDisabledError extends Error {
  code = 'FEATURE_DISABLED';
  statusCode = 403;
  flagKey: FeatureFlagKey;

  constructor(flagKey: FeatureFlagKey) {
    super(`La funcionalidad ${flagKey} está deshabilitada para esta tienda`);
    this.name = 'FeatureDisabledError';
    this.flagKey = flagKey;
  }
}

/**
 * Obtiene todas las flags de una tienda
 * MÓDULO S3: Usa cache con TTL
 * @param storeId - ID de la tienda
 * @returns Array de flags con su estado
 */
export async function getAllFeatureFlags(storeId: string) {
  try {
    // Verificar cache por tienda
    const cached = storeFlagsCache.get(storeId);
    if (cached && !isCacheExpired(cached.timestamp)) {
      const allKeys = Object.values(FeatureFlagKey);
      return allKeys.map(key => ({
        key,
        enabled: cached.flags.get(key) ?? false,
      }));
    }

    // Consultar DB
    const flags = await prisma.featureFlag.findMany({
      where: { storeId },
      orderBy: { key: 'asc' },
    });

    // Construir mapa de flags
    const flagsMap = new Map<FeatureFlagKey, boolean>();
    for (const flag of flags) {
      flagsMap.set(flag.key, flag.enabled);
    }

    // Guardar en cache
    storeFlagsCache.set(storeId, {
      flags: flagsMap,
      timestamp: Date.now(),
    });

    // También actualizar flagCache individual
    for (const [key, enabled] of flagsMap) {
      flagCache.set(`${storeId}:${key}`, { value: enabled, timestamp: Date.now() });
    }

    // Retornar todas las flags posibles, con default false si no existen
    const allKeys = Object.values(FeatureFlagKey);
    return allKeys.map(key => {
      const existing = flags.find(f => f.key === key);
      return {
        key,
        enabled: existing?.enabled ?? false,
        id: existing?.id,
        updatedAt: existing?.updatedAt,
      };
    });
  } catch (error) {
    console.error(`[FeatureFlags] Error getting flags for store ${storeId}:`, error);
    return [];
  }
}

/**
 * Actualiza o crea un flag para una tienda
 * MÓDULO S3: Invalida cache inmediatamente después del update
 * @param storeId - ID de la tienda
 * @param flagKey - Clave del flag
 * @param enabled - Nuevo estado
 * @returns Flag actualizado
 */
export async function setFeatureFlag(
  storeId: string,
  flagKey: FeatureFlagKey,
  enabled: boolean
) {
  try {
    // Upsert en DB primero
    const flag = await prisma.featureFlag.upsert({
      where: {
        storeId_key: {
          storeId,
          key: flagKey,
        },
      },
      create: {
        storeId,
        key: flagKey,
        enabled,
      },
      update: {
        enabled,
      },
    });

    // MÓDULO S3: Invalidar cache de esta tienda inmediatamente
    invalidateStoreFlags(storeId);

    return flag;
  } catch (error) {
    console.error(`[FeatureFlags] Error setting ${flagKey} for store ${storeId}:`, error);
    throw error;
  }
}

/**
 * MÓDULO S3: Invalida todo el cache de flags para una tienda específica
 * Esto fuerza a que la siguiente verificación consulte la DB
 * @param storeId - ID de la tienda a invalidar
 */
export function invalidateStoreFlags(storeId: string): void {
  // Eliminar todas las entradas de flagCache que pertenezcan a esta tienda
  for (const key of flagCache.keys()) {
    if (key.startsWith(`${storeId}:`)) {
      flagCache.delete(key);
    }
  }
  
  // Eliminar del cache de getAllFeatureFlags
  storeFlagsCache.delete(storeId);
  
  console.log(`[FeatureFlags] Cache invalidado para tienda ${storeId}`);
}

/**
 * Limpia TODO el cache de flags (útil para testing o forzar reload global)
 * MÓDULO S3: Limpia ambos caches
 */
export function clearFlagCache() {
  flagCache.clear();
  storeFlagsCache.clear();
  console.log('[FeatureFlags] Cache global limpiado');
}

/**
 * MÓDULO S3: Obtiene estadísticas del cache (para debug/monitoring)
 */
export function getCacheStats() {
  return {
    flagCacheSize: flagCache.size,
    storeFlagsCacheSize: storeFlagsCache.size,
    ttlSeconds: CACHE_TTL_MS / 1000,
  };
}

/**
 * ✅ MÓDULO 16: Sincroniza los feature flags de una tienda según su plan de suscripción
 * Esta función lee las capacidades del plan actual y actualiza TODOS los feature flags
 * para que coincidan con lo que el plan permite.
 * 
 * @param storeId - ID de la tienda
 * @returns Array de flags actualizados
 * 
 * Casos de uso:
 * - Al crear una suscripción DEMO → Activa TODAS las features
 * - Al cambiar de STARTER → PRO → Activa promociones, fiado, cupones
 * - Al cambiar de PRO → STARTER → Desactiva features avanzadas
 * - Al expirar trial → Mantiene features del plan pagado elegido
 */
export async function syncFeatureFlagsFromPlan(storeId: string) {
  try {
    // 1. Obtener suscripción actual de la tienda
    const subscription = await prisma.subscription.findUnique({
      where: { storeId },
      select: { planCode: true },
    });

    if (!subscription) {
      console.warn(`[FeatureFlags] No subscription found for store ${storeId}, skipping sync`);
      return [];
    }

    const { planCode } = subscription;
    
    // 2. Importar capacidades del plan (evita imports circulares)
    const { PLAN_CAPABILITIES } = await import('./planCapabilities');
    const planCapabilities = PLAN_CAPABILITIES[planCode];

    if (!planCapabilities) {
      console.error(`[FeatureFlags] Unknown plan code: ${planCode}`);
      return [];
    }

    // 3. Mapear feature flags a las keys de FeatureFlagKey enum
    // Solo incluimos los flags que existen en el enum de Prisma
    const featureFlagMapping: Partial<Record<string, FeatureFlagKey>> = {
      'ALLOW_FIADO': FeatureFlagKey.ALLOW_FIADO,
      'ALLOW_COUPONS': FeatureFlagKey.ALLOW_COUPONS,
      'ENABLE_PROMOTIONS': FeatureFlagKey.ENABLE_PROMOTIONS,
      'ENABLE_CATEGORY_PROMOS': FeatureFlagKey.ENABLE_CATEGORY_PROMOS,
      'ENABLE_VOLUME_PROMOS': FeatureFlagKey.ENABLE_VOLUME_PROMOS,
      'ENABLE_NTH_PROMOS': FeatureFlagKey.ENABLE_NTH_PROMOS,
      // ENABLE_ADVANCED_REPORTS y ENABLE_MULTI_BRANCH no están en el enum (futuro)
    };

    // 4. Actualizar cada feature flag según el plan
    const updatedFlags = [];
    for (const [capabilityKey, flagKey] of Object.entries(featureFlagMapping)) {
      if (!flagKey) continue; // Skip undefined flags
      
      const shouldBeEnabled = planCapabilities[capabilityKey] ?? false;
      
      const flag = await setFeatureFlag(storeId, flagKey, shouldBeEnabled);
      updatedFlags.push(flag);
    }

    console.log(`[FeatureFlags] ✅ Synced ${updatedFlags.length} flags for store ${storeId} with plan ${planCode}`);
    return updatedFlags;

  } catch (error) {
    console.error(`[FeatureFlags] Error syncing flags for store ${storeId}:`, error);
    throw error;
  }
}
