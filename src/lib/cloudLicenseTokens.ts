import crypto from 'crypto';
import { requireSessionSecret } from '@/lib/sessionConfig';

type TokenAudience = 'license-registration' | 'license-verify';

interface LicenseTokenClaims {
  v: 1;
  aud: TokenAudience;
  sub: string;
  iat: number;
  exp?: number;
  email?: string;
  role?: 'SUPERADMIN';
  storeId?: string;
}

const TOKEN_PREFIX = 'mp1';
const ADMIN_TOKEN_TTL_SECONDS = 4 * 60 * 60;

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', requireSessionSecret())
    .update(`${TOKEN_PREFIX}.${payload}`)
    .digest('base64url');
}

function createToken(claims: LicenseTokenClaims): string {
  const payload = encode(JSON.stringify(claims));
  return `${TOKEN_PREFIX}.${payload}.${sign(payload)}`;
}

function verifyToken(token: string, audience: TokenAudience): LicenseTokenClaims | null {
  try {
    const [prefix, payload, signature, extra] = token.split('.');
    if (prefix !== TOKEN_PREFIX || !payload || !signature || extra) return null;

    const expected = sign(payload);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LicenseTokenClaims;
    if (claims.v !== 1 || claims.aud !== audience || !claims.sub || !claims.iat) return null;
    if (claims.exp && claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function createCloudAdminLicenseToken(input: { userId: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  return createToken({
    v: 1,
    aud: 'license-registration',
    sub: input.userId,
    email: input.email.toLowerCase(),
    role: 'SUPERADMIN',
    iat: now,
    exp: now + ADMIN_TOKEN_TTL_SECONDS,
  });
}

export function verifyCloudAdminLicenseToken(token: string): LicenseTokenClaims | null {
  const claims = verifyToken(token, 'license-registration');
  return claims?.role === 'SUPERADMIN' && claims.email ? claims : null;
}

export function createStoreLicenseToken(storeId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createToken({
    v: 1,
    aud: 'license-verify',
    sub: storeId,
    storeId,
    iat: now,
  });
}

export function verifyStoreLicenseToken(token: string, storeId: string): boolean {
  const claims = verifyToken(token, 'license-verify');
  return claims?.sub === storeId && claims.storeId === storeId;
}
