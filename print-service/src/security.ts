import { timingSafeEqual } from 'crypto';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CONFIG_KEYS = new Set([
  'mode', 'usbPort', 'netHost', 'netPort', 'netTimeout', 'charsPerLine',
  'autoCut', 'openCashDrawer', 'encoding', 'ticketSlogan', 'ticketWebsite',
  'ticketShowQr', 'allowedOrigins',
]);

function parseHttpOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string | undefined, configuredOrigins: string[]): boolean {
  if (!origin) return true;
  const parsed = parseHttpOrigin(origin);
  if (!parsed) return false;
  if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return true;
  return configuredOrigins.some((configured) => {
    const allowed = parseHttpOrigin(configured);
    return Boolean(allowed && allowed.origin === parsed.origin);
  });
}

export function createCorsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-MarketPOS-Token',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function isAuthorizedToken(received: string | string[] | undefined, expected: string): boolean {
  const candidate = Array.isArray(received) ? received[0] : received;
  if (!candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${key} debe ser booleano`);
  return value;
}

function requireString(value: unknown, key: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${key} debe ser texto de hasta ${maxLength} caracteres`);
  }
  if (/\0|[\r\n]/.test(value)) throw new Error(`${key} contiene caracteres no permitidos`);
  return value;
}

function requireInteger(value: unknown, key: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${key} debe ser un entero entre ${min} y ${max}`);
  }
  return value as number;
}

export function isSafePrinterPort(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(value);
}

export function validateConfigPatch(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('La configuracion debe ser un objeto JSON');
  }
  const source = input as Record<string, unknown>;
  const unknown = Object.keys(source).filter((key) => !CONFIG_KEYS.has(key));
  if (unknown.length > 0) throw new Error(`Campos de configuracion no permitidos: ${unknown.join(', ')}`);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    switch (key) {
      case 'mode':
        if (value !== 'USB' && value !== 'NET') throw new Error('mode debe ser USB o NET');
        result[key] = value;
        break;
      case 'usbPort': {
        const port = requireString(value, key, 64);
        if (!isSafePrinterPort(port)) throw new Error('usbPort contiene caracteres no permitidos');
        result[key] = port;
        break;
      }
      case 'netHost': {
        const host = requireString(value, key, 253);
        if (host && !/^[A-Za-z0-9.-]+$/.test(host)) throw new Error('netHost no es valido');
        result[key] = host;
        break;
      }
      case 'netPort':
        result[key] = requireInteger(value, key, 1, 65535);
        break;
      case 'netTimeout':
        result[key] = requireInteger(value, key, 250, 30000);
        break;
      case 'charsPerLine':
        if (value !== 32 && value !== 42 && value !== 48) throw new Error('charsPerLine debe ser 32, 42 o 48');
        result[key] = value;
        break;
      case 'autoCut':
      case 'openCashDrawer':
      case 'ticketShowQr':
        result[key] = requireBoolean(value, key);
        break;
      case 'encoding': {
        const encoding = requireString(value, key, 32);
        if (!/^[A-Za-z0-9_-]+$/.test(encoding)) throw new Error('encoding no es valido');
        result[key] = encoding;
        break;
      }
      case 'ticketSlogan':
        result[key] = requireString(value, key, 200);
        break;
      case 'ticketWebsite': {
        const website = requireString(value, key, 300);
        if (website && !parseHttpOrigin(website)) throw new Error('ticketWebsite debe ser una URL HTTP(S) valida');
        result[key] = website;
        break;
      }
      case 'allowedOrigins': {
        if (!Array.isArray(value) || value.length > 20) throw new Error('allowedOrigins debe ser una lista de hasta 20 origenes');
        result[key] = value.map((origin) => {
          const text = requireString(origin, key, 300);
          const parsed = parseHttpOrigin(text);
          if (!parsed || parsed.origin !== text) throw new Error(`Origen no valido: ${text}`);
          return parsed.origin;
        });
        break;
      }
    }
  }
  return result;
}
