/**
 * MÓDULO 15 — Auditoría
 * 
 * Helper para registrar eventos de auditoría.
 * 
 * REGLA CRÍTICA:
 * AuditLog NUNCA debe romper la operación principal.
 * Si falla el insert del log → console.error pero continuar.
 */

import { prisma } from '@/infra/db/prisma';
import type { AuditSeverity, AuditEntityType, Prisma } from '@prisma/client';

export interface AuditLogParams {
  storeId?: string | null; // nullable para acciones SUPERADMIN globales
  userId?: string | null; // nullable si es sistema
  action: string; // SALE_CHECKOUT_SUCCESS, SHIFT_OPENED, etc.
  entityType: AuditEntityType;
  entityId?: string | null;
  severity?: AuditSeverity;
  meta?: Record<string, any> | null; // JSON, sin datos sensibles
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Registra un evento de auditoría.
 * Tolerante a fallos: si falla, solo registra error pero no lanza excepción.
 * 
 * @param params - Parámetros del log de auditoría
 * @returns Promise<boolean> - true si se registró correctamente, false si falló
 */
export async function logAudit(params: AuditLogParams): Promise<boolean> {
  try {
    const {
      storeId = null,
      userId = null,
      action,
      entityType,
      entityId = null,
      severity = 'INFO',
      meta = null,
      ip = null,
      userAgent = null,
    } = params;

    // Sanitizar meta: eliminar datos sensibles si existen
    const sanitizedMeta = sanitizeMeta(meta);

    await prisma.auditLog.create({
      data: {
        storeId,
        userId,
        action,
        entityType,
        entityId,
        severity,
        meta: sanitizedMeta as Prisma.InputJsonValue,
        ip,
        userAgent,
      },
    });

    return true;
  } catch (error) {
    // NO lanzar error, solo registrar
    console.error('❌ [AuditLog] Failed to create audit log:', {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Registra un log de auditoría dentro de una transacción de Prisma.
 * 
 * @param tx - Transacción de Prisma
 * @param params - Parámetros del log de auditoría
 * @returns Promise<boolean>
 */
export async function logAuditInTransaction(
  tx: Prisma.TransactionClient,
  params: AuditLogParams
): Promise<boolean> {
  try {
    const {
      storeId = null,
      userId = null,
      action,
      entityType,
      entityId = null,
      severity = 'INFO',
      meta = null,
      ip = null,
      userAgent = null,
    } = params;

    const sanitizedMeta = sanitizeMeta(meta);

    await tx.auditLog.create({
      data: {
        storeId,
        userId,
        action,
        entityType,
        entityId,
        severity,
        meta: sanitizedMeta as Prisma.InputJsonValue,
        ip,
        userAgent,
      },
    });

    return true;
  } catch (error) {
    console.error('❌ [AuditLog] Failed to create audit log in transaction:', {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
    });
    // En transacciones, devolver false pero NO lanzar error
    // La operación principal debe continuar
    return false;
  }
}

/**
 * Sanitiza el objeto meta para eliminar datos sensibles.
 * 
 * @param meta - Objeto JSON con metadatos
 * @returns Objeto sanitizado
 */
function sanitizeMeta(meta: Record<string, any> | null): Record<string, any> | null {
  if (!meta) return null;

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'apiKey',
    'privateKey',
    'creditCard',
    'cvv',
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(meta)) {
    // Verificar si la clave es sensible
    const isSensitive = sensitiveKeys.some(k => 
      key.toLowerCase().includes(k.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      // Recursivo para objetos anidados
      sanitized[key] = sanitizeMeta(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper para obtener IP y User-Agent desde Next.js Request
 */
export function getRequestMetadata(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             null;
  
  const userAgent = request.headers.get('user-agent') || null;

  return { ip, userAgent };
}
