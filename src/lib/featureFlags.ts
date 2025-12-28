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
