/**
 * MÓDULO 16.1 - Checkout Lock
 * 
 * Sistema de lock para evitar que un cajero ejecute 2 checkouts simultáneamente.
 * Lock en memoria con TTL automático.
 */

interface LockEntry {
  lockedAt: number;
  expiresAt: number;
}

// Cache en memoria: key = `${storeId}:${userId}`
const checkoutLocks = new Map<string, LockEntry>();

// TTL por defecto: 15 segundos
const DEFAULT_LOCK_TTL_SECONDS = 15;

// Limpieza periódica de locks expirados (cada 10 segundos)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of checkoutLocks.entries()) {
    if (entry.expiresAt < now) {
      checkoutLocks.delete(key);
    }
  }
}, 10000);

/**
 * Intenta adquirir un lock de checkout
 * @param storeId - ID de la tienda
 * @param userId - ID del usuario
 * @param ttlSeconds - TTL del lock en segundos (default: 15)
 * @returns true si se adquirió el lock, false si ya existe
 */
export function acquireCheckoutLock(
  storeId: string,
  userId: string,
  ttlSeconds: number = DEFAULT_LOCK_TTL_SECONDS
): boolean {
  const key = `${storeId}:${userId}`;
  const now = Date.now();
  
  const existing = checkoutLocks.get(key);
  
  // Si existe y no ha expirado, no se puede adquirir
  if (existing && existing.expiresAt > now) {
    return false;
  }

  // Adquirir lock
  const expiresAt = now + (ttlSeconds * 1000);
  checkoutLocks.set(key, { lockedAt: now, expiresAt });
  
  return true;
}

/**
 * Libera un lock de checkout
 * @param storeId - ID de la tienda
 * @param userId - ID del usuario
 */
export function releaseCheckoutLock(storeId: string, userId: string): void {
  const key = `${storeId}:${userId}`;
  checkoutLocks.delete(key);
}

/**
 * Verifica si existe un lock activo
 * @param storeId - ID de la tienda
 * @param userId - ID del usuario
 * @returns true si existe un lock activo
 */
export function hasActiveCheckoutLock(storeId: string, userId: string): boolean {
  const key = `${storeId}:${userId}`;
  const now = Date.now();
  
  const entry = checkoutLocks.get(key);
  
  if (!entry) return false;
  
  // Si expiró, eliminar y retornar false
  if (entry.expiresAt < now) {
    checkoutLocks.delete(key);
    return false;
  }
  
  return true;
}

/**
 * Obtiene el tiempo restante de un lock en milisegundos
 */
export function getLockRemainingTime(storeId: string, userId: string): number {
  const key = `${storeId}:${userId}`;
  const now = Date.now();
  
  const entry = checkoutLocks.get(key);
  
  if (!entry || entry.expiresAt < now) {
    return 0;
  }
  
  return entry.expiresAt - now;
}
