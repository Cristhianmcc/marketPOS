/**
 * D9 - License Checker (Híbrido)
 *
 * Verifica la licencia del desktop de forma híbrida:
 * - Con internet: consulta el cloud y guarda en caché local (7 días)
 * - Sin internet: usa el caché local
 * - Si el caché expiró y no hay internet: gracia de 3 días extra
 *
 * Flujo:
 * 1. Al arrancar → intenta verificar online
 * 2. Si OK online → guarda estado local con TTL de 7 días
 * 3. Si offline → usa estado guardado local
 * 4. Si estado local expirado + offline → permite operar 3 días de gracia
 * 5. Si no puede operar → main.ts muestra pantalla de bloqueo
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// Se inyectan en build time o via env
// ⚠️ Funciones lazy: process.env se llena DESPUÉS de que server.ts carga .env
function getCloudUrl(): string {
  return process.env.CLOUD_URL || process.env.CATALOG_CLOUD_URL || '';
}
function getLicenseApiKey(): string {
  return process.env.LICENSE_API_KEY || '';
}
const CACHE_TTL_MS   = 7  * 24 * 60 * 60 * 1000; // 7 días
const GRACE_EXTRA_MS = 3  * 24 * 60 * 60 * 1000; // 3 días de gracia offline

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type LicenseStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'NO_SUBSCRIPTION'
  | 'OFFLINE_GRACE';   // sin internet pero dentro de gracia

export interface LicenseState {
  canOperate: boolean;
  status: LicenseStatus;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  planCode: string | null;
  daysRemaining: number;
  source: 'cloud' | 'cache' | 'grace' | 'no_config';
  checkedAt: string;
}

interface CachedLicense {
  storeId: string;
  state: LicenseState;
  cachedAt: number;       // epoch ms
  hash: string;           // integridad
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getCachePath(): string {
  return path.join(app.getPath('userData'), 'license-cache.json');
}

function hashData(data: object): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16);
}

function loadCache(storeId: string): CachedLicense | null {
  try {
    const p = getCachePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    const cached: CachedLicense = JSON.parse(raw);
    if (cached.storeId !== storeId) return null;

    // Verificar integridad
    const { hash, ...rest } = cached;
    if (hashData(rest) !== hash) {
      console.warn('[LicenseChecker] Cache hash mismatch — ignorando');
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function saveCache(storeId: string, state: LicenseState): void {
  try {
    const data: Omit<CachedLicense, 'hash'> = {
      storeId,
      state,
      cachedAt: Date.now(),
    };
    const cache: CachedLicense = { ...data, hash: hashData(data) };
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[LicenseChecker] No se pudo guardar caché:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICACIÓN ONLINE
// ─────────────────────────────────────────────────────────────────────────────

async function verifyOnline(storeId: string): Promise<LicenseState | null> {
  const cloudUrl = getCloudUrl();
  const apiKey = getLicenseApiKey();
  if (!cloudUrl || !apiKey) {
    console.log('[LicenseChecker] Sin CLOUD_URL o LICENSE_API_KEY en process.env — skip online');
    return null;
  }

  try {
    const url = `${cloudUrl}/api/license/verify?storeId=${encodeURIComponent(storeId)}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as Omit<LicenseState, 'source' | 'checkedAt'>;
    return {
      ...data,
      source: 'cloud',
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return null; // offline o error de red
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICACIÓN LOCAL (BD propia del desktop)
// ─────────────────────────────────────────────────────────────────────────────

async function verifyLocal(serverUrl: string): Promise<LicenseState | null> {
  try {
    const res = await fetch(`${serverUrl}/api/settings/billing`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      hasSubscription: boolean;
      subscription?: {
        planCode: string;
        status: string;
        currentPeriodEnd: string;
        trialEndsAt: string | null;
      };
      effectiveStatus?: string;
      canOperate?: boolean;
      daysUntilExpiration?: number;
    };

    if (!data.hasSubscription || !data.subscription) {
      return {
        canOperate: false,
        status: 'NO_SUBSCRIPTION',
        currentPeriodEnd: null,
        trialEndsAt: null,
        planCode: null,
        daysRemaining: 0,
        source: 'cache',
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      canOperate: data.canOperate ?? false,
      status: (data.effectiveStatus ?? data.subscription.status) as LicenseStatus,
      currentPeriodEnd: data.subscription.currentPeriodEnd,
      trialEndsAt: data.subscription.trialEndsAt,
      planCode: data.subscription.planCode,
      daysRemaining: data.daysUntilExpiration ?? 0,
      source: 'cache',
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica la licencia de forma híbrida.
 * @param storeId - ID de la tienda local
 * @param serverUrl - URL del servidor Next.js local (ej: http://localhost:43110)
 */
export async function checkLicense(storeId: string, serverUrl: string): Promise<LicenseState> {
  console.log(`[LicenseChecker] Verificando licencia para storeId: ${storeId}`);

  // 1. Si no hay CLOUD_URL configurado → verificar solo en BD local
  if (!getCloudUrl() || !getLicenseApiKey()) {
    console.log('[LicenseChecker] Sin CLOUD_URL — usando BD local');
    const local = await verifyLocal(serverUrl);
    if (local) return local;

    // Sin suscripción local → permitir operar (modo sin licencia)
    return {
      canOperate: true,
      status: 'NO_SUBSCRIPTION',
      currentPeriodEnd: null,
      trialEndsAt: null,
      planCode: null,
      daysRemaining: 0,
      source: 'no_config',
      checkedAt: new Date().toISOString(),
    };
  }

  // 2. Intentar verificar online
  const online = await verifyOnline(storeId);
  if (online) {
    console.log(`[LicenseChecker] Online OK — status: ${online.status}, canOperate: ${online.canOperate}`);
    // Guardar en caché y también actualizar BD local vía API
    saveCache(storeId, online);
    return online;
  }

  // 3. Offline — usar caché local
  console.log('[LicenseChecker] Offline — usando caché local');
  const cached = loadCache(storeId);

  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < CACHE_TTL_MS) {
      // Caché válida
      console.log(`[LicenseChecker] Caché válida (${Math.round(age / 86400000)} días)`);
      return { ...cached.state, source: 'cache' };
    }

    // Caché expirada pero dentro de gracia offline
    if (age < CACHE_TTL_MS + GRACE_EXTRA_MS && cached.state.canOperate) {
      console.log('[LicenseChecker] Caché expirada — gracia offline activa');
      return {
        ...cached.state,
        status: 'OFFLINE_GRACE',
        canOperate: true,
        source: 'grace',
      };
    }
  }

  // 4. Sin caché válida y offline → verificar BD local como último recurso
  const local = await verifyLocal(serverUrl);
  if (local) {
    console.log(`[LicenseChecker] BD local — status: ${local.status}`);
    return local;
  }

  // 5. No se pudo verificar nada → bloquear
  return {
    canOperate: false,
    status: 'NO_SUBSCRIPTION',
    currentPeriodEnd: null,
    trialEndsAt: null,
    planCode: null,
    daysRemaining: 0,
    source: 'no_config',
    checkedAt: new Date().toISOString(),
  };
}
