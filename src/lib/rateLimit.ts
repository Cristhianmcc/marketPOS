/**
 * MÓDULO 16.1 - Rate Limiting
 * 
 * Sistema de rate limiting en memoria para proteger endpoints críticos.
 * Evita spam de requests, errores de red, loops de frontend o abuso accidental.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Cache en memoria: key = `${endpoint}:${identifier}`
const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpieza periódica de entradas expiradas (cada 60 segundos)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Configuraciones de rate limiting por endpoint
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // ✅ MÓDULO S8 - Login protection
  'login': { maxRequests: 5, windowSeconds: 300 }, // 5 intentos / 5 min
  
  // ✅ MÓDULO S8 - Admin sensitive endpoints
  'backup-export': { maxRequests: 3, windowSeconds: 60 },
  'backup-restore': { maxRequests: 1, windowSeconds: 120 },
  'admin-store-create': { maxRequests: 3, windowSeconds: 60 },
  'admin-user-create': { maxRequests: 5, windowSeconds: 60 },
  'sunat': { maxRequests: 10, windowSeconds: 60 },
  
  // Existing limits
  'checkout': { maxRequests: 5, windowSeconds: 10 },
  'cancel': { maxRequests: 3, windowSeconds: 30 },
  'shift-open': { maxRequests: 2, windowSeconds: 60 },
  'shift-close': { maxRequests: 2, windowSeconds: 60 },
  'receivable-pay': { maxRequests: 5, windowSeconds: 10 },
  'restore': { maxRequests: 1, windowSeconds: 60 },
  'admin': { maxRequests: 10, windowSeconds: 60 },
};

/**
 * Extrae la IP del request (soporta proxies)
 */
export function getClientIP(request: Request): string {
  const headers = request.headers;
  
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback
  return 'unknown';
}

/**
 * Verifica y actualiza el rate limit para un endpoint y usuario
 * @param endpointKey - Clave del endpoint (ej: 'checkout', 'shift-open')
 * @param identifier - Identificador único (userId, storeId, o IP)
 * @returns RateLimitResult con allowed, remaining y resetAt
 */
export function checkRateLimit(
  endpointKey: string,
  identifier: string
): RateLimitResult {
  const config = RATE_LIMITS[endpointKey];
  
  if (!config) {
    // Si no hay configuración, permitir por defecto
    return { allowed: true, remaining: 999, resetAt: Date.now() + 60000 };
  }

  const key = `${endpointKey}:${identifier}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  let entry = rateLimitStore.get(key);

  // Si no existe o ya expiró, crear nueva ventana
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(key, entry);
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    };
  }

  // Si ya alcanzó el límite
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Incrementar contador
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Resetea el rate limit para un identificador específico (solo para testing/admin)
 */
export function resetRateLimit(endpointKey: string, identifier: string): void {
  const key = `${endpointKey}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Obtiene estadísticas del rate limit (para debugging)
 */
export function getRateLimitStats(endpointKey: string, identifier: string): RateLimitEntry | null {
  const key = `${endpointKey}:${identifier}`;
  return rateLimitStore.get(key) || null;
}
