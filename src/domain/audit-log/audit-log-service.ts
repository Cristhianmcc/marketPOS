// src/domain/audit-log/audit-log-service.ts
// MÓDULO 16: Wrapper para audit log (compatibility layer)

import { logAudit, type AuditLogParams } from '@/lib/auditLog';

/**
 * Alias para mantener compatibilidad con diferentes nombres
 */
export async function createAuditLog(params: AuditLogParams): Promise<boolean> {
  return logAudit(params);
}

export { logAudit, type AuditLogParams };
