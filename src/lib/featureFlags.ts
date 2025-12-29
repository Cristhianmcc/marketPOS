// lib/featureFlags.ts
// ✅ MÓDULO 15 - FASE 2: Feature Flags
// Helper centralizado para verificar flags por tienda

import { prisma } from '@/infra/db/prisma';
import { FeatureFlagKey } from '@prisma/client';

/**
 * Cache en memoria (simple) para flags
 * Evita queries repetitivas en la misma request
 */
const flagCache = new Map<string, boolean>();

/**
 * Verifica si una feature está habilitada para una tienda
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
    
    // Verificar cache
    if (flagCache.has(cacheKey)) {
      return flagCache.get(cacheKey)!;
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
    
    // Guardar en cache
    flagCache.set(cacheKey, enabled);
    
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
 * @param storeId - ID de la tienda
 * @returns Array de flags con su estado
 */
export async function getAllFeatureFlags(storeId: string) {
  try {
    const flags = await prisma.featureFlag.findMany({
      where: { storeId },
      orderBy: { key: 'asc' },
    });

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
    // Limpiar cache
    const cacheKey = `${storeId}:${flagKey}`;
    flagCache.delete(cacheKey);

    // Upsert en DB
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

    return flag;
  } catch (error) {
    console.error(`[FeatureFlags] Error setting ${flagKey} for store ${storeId}:`, error);
    throw error;
  }
}

/**
 * Limpia el cache de flags (útil para testing o forzar reload)
 */
export function clearFlagCache() {
  flagCache.clear();
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
