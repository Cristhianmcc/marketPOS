/**
 * MÓDULO 18.7 — Carga de credenciales SOL SUNAT
 * 
 * Prioridad de credenciales:
 * 1. Variables de entorno (recomendado para PROD)
 * 2. SunatSettings en DB
 * 
 * ⚠️ SEGURIDAD:
 * - Nunca loguear solPass
 * - Nunca incluir en respuestas API
 * - Nunca auditar credenciales
 */

import { PrismaClient } from '@prisma/client';

export interface SolCredentials {
  solUser: string;
  solPass: string;
  source: 'ENV' | 'DB';
}

export class SolCredentialsError extends Error {
  constructor(message: string, public code: string = 'SOL_ERROR') {
    super(message);
    this.name = 'SolCredentialsError';
  }
}

/**
 * Carga las credenciales SOL desde ENV o DB
 * Prioridad: ENV > SunatSettings
 * 
 * @param prisma - Cliente de Prisma
 * @param storeId - ID de la tienda
 * @returns Credenciales SOL con fuente
 * @throws SolCredentialsError si no se encuentran
 */
export async function loadSolCredentials(
  prisma: PrismaClient,
  storeId: string
): Promise<SolCredentials> {
  // 1. Intentar cargar desde ENV (recomendado para producción)
  const envUser = process.env.SUNAT_SOL_USER;
  const envPass = process.env.SUNAT_SOL_PASS;

  if (envUser && envPass) {
    return {
      solUser: envUser,
      solPass: envPass,
      source: 'ENV',
    };
  }

  // 2. Cargar desde SunatSettings
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
    select: {
      solUser: true,
      solPass: true,
      ruc: true,
    },
  });

  if (!settings?.solUser || !settings?.solPass) {
    throw new SolCredentialsError(
      'Credenciales SOL no configuradas. Configure SUNAT_SOL_USER y SUNAT_SOL_PASS en ENV o en SunatSettings.',
      'SOL_NOT_CONFIGURED'
    );
  }

  return {
    solUser: settings.solUser,
    solPass: settings.solPass,
    source: 'DB',
  };
}

/**
 * Verifica si hay credenciales SOL disponibles (sin cargarlas)
 * Útil para validaciones de UI
 */
export async function hasSolCredentials(
  prisma: PrismaClient,
  storeId: string
): Promise<{ available: boolean; source?: 'ENV' | 'DB' }> {
  // Verificar ENV primero
  if (process.env.SUNAT_SOL_USER && process.env.SUNAT_SOL_PASS) {
    return { available: true, source: 'ENV' };
  }

  // Verificar DB
  const settings = await prisma.sunatSettings.findUnique({
    where: { storeId },
    select: {
      solUser: true,
      solPass: true,
    },
  });

  if (settings?.solUser && settings?.solPass) {
    return { available: true, source: 'DB' };
  }

  return { available: false };
}

/**
 * Construye el usuario SOL completo (RUC + usuario)
 * Formato: {RUC}{USUARIO}
 * 
 * @param ruc - RUC de 11 dígitos
 * @param user - Usuario SOL (sin RUC)
 * @returns Usuario SOL completo
 */
export function buildSolUser(ruc: string, user: string): string {
  // Si ya incluye el RUC, retornar tal cual
  if (user.startsWith(ruc)) {
    return user;
  }
  return `${ruc}${user}`;
}

/**
 * Sanitiza datos de credenciales para logging/auditoría
 * NUNCA incluir passwords
 */
export function sanitizeCredentialsForLog(credentials: SolCredentials): {
  solUserMasked: string;
  source: 'ENV' | 'DB';
} {
  // Mostrar solo primeros 4 caracteres del usuario
  const masked = credentials.solUser.length > 4 
    ? credentials.solUser.substring(0, 4) + '***' 
    : '***';

  return {
    solUserMasked: masked,
    source: credentials.source,
  };
}
