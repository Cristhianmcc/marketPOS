/**
 * MÓDULO 16.1 - Idempotency
 * 
 * Sistema de idempotencia para prevenir doble submit en checkout.
 * Guarda el resultado de operaciones exitosas por un TTL y devuelve el mismo resultado si llega repetido.
 */

interface IdempotencyEntry {
  result: any;
  expiresAt: number;
}

// Cache en memoria: key = idempotency key
const idempotencyStore = new Map<string, IdempotencyEntry>();

// TTL por defecto: 60 segundos
const DEFAULT_TTL_SECONDS = 60;

// Limpieza periódica de entradas expiradas (cada 30 segundos)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt < now) {
      idempotencyStore.delete(key);
    }
  }
}, 30000);

/**
 * Guarda un resultado para una idempotency key
 * @param key - Idempotency key (UUID del frontend)
 * @param result - Resultado a guardar
 * @param ttlSeconds - TTL en segundos (default: 60)
 */
export function saveIdempotentResult(
  key: string,
  result: any,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): void {
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  idempotencyStore.set(key, { result, expiresAt });
}

/**
 * Obtiene un resultado guardado para una idempotency key
 * @param key - Idempotency key
 * @returns Resultado guardado o null si no existe o expiró
 */
export function getIdempotentResult(key: string): any | null {
  const entry = idempotencyStore.get(key);
  
  if (!entry) {
    return null;
  }

  // Verificar si expiró
  if (entry.expiresAt < Date.now()) {
    idempotencyStore.delete(key);
    return null;
  }

  return entry.result;
}

/**
 * Elimina una idempotency key del store (para testing)
 */
export function deleteIdempotencyKey(key: string): void {
  idempotencyStore.delete(key);
}

/**
 * Verifica si existe una idempotency key
 */
export function hasIdempotencyKey(key: string): boolean {
  const entry = idempotencyStore.get(key);
  if (!entry) return false;
  
  // Verificar si expiró
  if (entry.expiresAt < Date.now()) {
    idempotencyStore.delete(key);
    return false;
  }
  
  return true;
}
