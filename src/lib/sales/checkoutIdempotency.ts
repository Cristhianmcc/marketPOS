import { createHash } from 'crypto';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function parseCheckoutIdempotencyKey(value: string | null): string {
  const key = value?.trim() ?? '';
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error('La cabecera Idempotency-Key es obligatoria y debe tener entre 8 y 128 caracteres seguros');
  }
  return key;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function createCheckoutRequestHash(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(body)))
    .digest('hex');
}

export function createCheckoutSaleId(storeId: string, userId: string, key: string): string {
  const digest = createHash('sha256')
    .update(`${storeId}\0${userId}\0${key}`)
    .digest('hex');
  return `sale_${digest}`;
}

export function getCheckoutRequestHash(paymentDetails: unknown): string | null {
  if (!paymentDetails || typeof paymentDetails !== 'object' || Array.isArray(paymentDetails)) return null;
  const value = (paymentDetails as Record<string, unknown>).checkoutRequestHash;
  return typeof value === 'string' ? value : null;
}
