/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÓDULO V0 — HOOK PARA FEATURE FLAGS EN UI
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Hook para verificar flags en el cliente.
 * Si un flag está OFF, el componente NO debe renderizarse.
 * 
 * Uso:
 * ```tsx
 * const { isOn, isLoading } = useFlags();
 * 
 * if (isLoading) return <Skeleton />;
 * if (!isOn('ENABLE_ADVANCED_UNITS')) return null;
 * 
 * return <AdvancedUnitSelector />;
 * ```
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FeatureFlagKey } from '@prisma/client';

// ══════════════════════════════════════════════════════════════════════════════
// TIPOS
// ══════════════════════════════════════════════════════════════════════════════

interface FlagState {
  flags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

interface UseFlagsReturn {
  /** Verifica si un flag está habilitado */
  isOn: (flagKey: FeatureFlagKey | string) => boolean;
  /** Verifica si un flag está deshabilitado */
  isOff: (flagKey: FeatureFlagKey | string) => boolean;
  /** Estado de carga */
  isLoading: boolean;
  /** Error si falló la carga */
  error: string | null;
  /** Recarga los flags manualmente */
  refetch: () => Promise<void>;
  /** Todos los flags cargados */
  allFlags: Record<string, boolean>;
  /** True si la app está corriendo en modo desktop (Electron) */
  isDesktop: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// CACHE GLOBAL (evita refetch en cada componente)
// ══════════════════════════════════════════════════════════════════════════════

let globalFlagCache: FlagState = {
  flags: {},
  isLoading: false,
  error: null,
  lastFetched: null,
};
let globalIsDesktop = false;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// Listeners para actualizar componentes cuando cambie el cache
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

// ══════════════════════════════════════════════════════════════════════════════
// FETCH DE FLAGS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchFlags(): Promise<Record<string, boolean>> {
  const response = await fetch('/api/flags', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Error al cargar feature flags');
  }

  const data = await response.json();
  
  // Guardar isDesktop globalmente
  globalIsDesktop = data.isDesktop === true;

  // Convertir array a objeto { flagKey: enabled }
  const flagMap: Record<string, boolean> = {};
  if (Array.isArray(data.flags)) {
    data.flags.forEach((flag: { key: string; enabled: boolean }) => {
      flagMap[flag.key] = flag.enabled;
    });
  }
  
  return flagMap;
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOK PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

export function useFlags(): UseFlagsReturn {
  const [, forceUpdate] = useState({});

  // Suscribirse a cambios del cache global
  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Cargar flags al montar (si no están en cache o cache expirado)
  useEffect(() => {
    const shouldFetch =
      !globalFlagCache.lastFetched ||
      Date.now() - globalFlagCache.lastFetched > CACHE_TTL;

    if (shouldFetch && !globalFlagCache.isLoading) {
      loadFlags();
    }
  }, []);

  const loadFlags = useCallback(async () => {
    if (globalFlagCache.isLoading) return;

    globalFlagCache = { ...globalFlagCache, isLoading: true, error: null };
    notifyListeners();

    try {
      const flags = await fetchFlags();
      globalFlagCache = {
        flags,
        isLoading: false,
        error: null,
        lastFetched: Date.now(),
      };
    } catch (error) {
      globalFlagCache = {
        ...globalFlagCache,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }

    notifyListeners();
  }, []);

  const isOn = useCallback((flagKey: FeatureFlagKey | string): boolean => {
    // Default seguro: si no existe o hay error, retorna false
    return globalFlagCache.flags[flagKey] ?? false;
  }, []);

  const isOff = useCallback((flagKey: FeatureFlagKey | string): boolean => {
    return !isOn(flagKey);
  }, [isOn]);

  const refetch = useCallback(async () => {
    globalFlagCache = { ...globalFlagCache, lastFetched: null };
    await loadFlags();
  }, [loadFlags]);

  return {
    isOn,
    isOff,
    isLoading: globalFlagCache.isLoading,
    error: globalFlagCache.error,
    refetch,
    allFlags: globalFlagCache.flags,
    isDesktop: globalIsDesktop,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTES HELPER
// ══════════════════════════════════════════════════════════════════════════════

interface FeatureGateProps {
  /** Flag requerido para mostrar el contenido */
  flag: FeatureFlagKey | string;
  /** Contenido a mostrar si el flag está ON */
  children: React.ReactNode;
  /** Contenido alternativo si el flag está OFF (opcional) */
  fallback?: React.ReactNode;
  /** Mostrar skeleton mientras carga (opcional) */
  loadingFallback?: React.ReactNode;
}

/**
 * Componente que renderiza children solo si el flag está ON.
 * 
 * Uso:
 * ```tsx
 * <FeatureGate flag="ENABLE_ADVANCED_UNITS">
 *   <AdvancedUnitSelector />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({ 
  flag, 
  children, 
  fallback = null,
  loadingFallback = null 
}: FeatureGateProps) {
  const { isOn, isLoading } = useFlags();

  if (isLoading && loadingFallback) {
    return <>{loadingFallback}</>;
  }

  if (!isOn(flag)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDAD PARA PÁGINAS (REDIRECT SI FLAG OFF)
// ══════════════════════════════════════════════════════════════════════════════

interface FeaturePageGuardProps {
  /** Flag requerido para acceder a la página */
  flag: FeatureFlagKey | string;
  /** Contenido de la página */
  children: React.ReactNode;
  /** Mensaje cuando el flag está OFF */
  disabledMessage?: string;
}

/**
 * Guard para páginas completas.
 * Muestra mensaje "función no disponible" si el flag está OFF.
 */
export function FeaturePageGuard({
  flag,
  children,
  disabledMessage = 'Esta función no está disponible en tu plan actual',
}: FeaturePageGuardProps) {
  const { isOn, isLoading } = useFlags();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!isOn(flag)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Función no disponible
        </h2>
        <p className="text-gray-600 text-center max-w-md">
          {disabledMessage}
        </p>
        <p className="text-sm text-gray-500 mt-4">
          Contacta a soporte para habilitar esta funcionalidad.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export default useFlags;
