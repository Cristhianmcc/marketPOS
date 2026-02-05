// src/domain/sunat/audit.ts
// ✅ MÓDULO 18.1: Auditoría para SUNAT (sin datos sensibles)

import { logAudit } from '@/lib/auditLog';

/**
 * Registra evento de creación/actualización de configuración SUNAT
 * NO debe incluir solPass ni certPassword
 */
export async function auditSunatSettingsUpdated(params: {
  storeId: string;
  userId?: string;
  action: 'CREATED' | 'UPDATED';
  changes?: {
    enabled?: boolean;
    env?: string;
    ruc?: string;
    series?: string[];
  };
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: `SUNAT_SETTINGS_${params.action}`,
    entityType: 'SUNAT',
    entityId: params.storeId,
    severity: 'INFO',
    meta: {
      changes: params.changes || {},
      // NUNCA incluir: solPass, certPassword
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra evento de creación de documento electrónico en DRAFT
 */
export async function auditSunatDocDraftCreated(params: {
  storeId: string;
  userId?: string;
  documentId: string;
  docType: string;
  fullNumber: string;
  saleId?: string;
  total: number;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_DOC_DRAFT_CREATED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: 'INFO',
    meta: {
      docType: params.docType,
      fullNumber: params.fullNumber,
      saleId: params.saleId,
      total: params.total,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra evento de cambio de estado de documento electrónico
 */
export async function auditSunatDocStatusChanged(params: {
  storeId: string;
  userId?: string;
  documentId: string;
  fullNumber: string;
  oldStatus: string;
  newStatus: string;
  sunatCode?: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_DOC_STATUS_CHANGED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.newStatus === 'REJECTED' || params.newStatus === 'ERROR' ? 'ERROR' : 'INFO',
    meta: {
      fullNumber: params.fullNumber,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      sunatCode: params.sunatCode,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * ✅ MÓDULO 18.2: Registra evento de construcción de payload fiscal
 */
export async function auditSunatPayloadBuilt(params: {
  storeId: string;
  userId?: string;
  saleId: string;
  docType: string;
  fullNumber: string;
  success: boolean;
  errorCode?: string;
  itemCount?: number;
  total?: number;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: params.success ? 'SUNAT_PAYLOAD_BUILT' : 'SUNAT_PAYLOAD_FAILED',
    entityType: 'SUNAT',
    entityId: params.saleId,
    severity: params.success ? 'INFO' : 'ERROR',
    meta: {
      saleId: params.saleId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      itemCount: params.itemCount,
      total: params.total,
      errorCode: params.errorCode,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * ✅ MÓDULO 18.3: Registra evento de generación de XML UBL
 */
export async function auditSunatXmlBuilt(params: {
  storeId: string;
  userId?: string;
  documentId: string;
  docType: string;
  fullNumber: string;
  success: boolean;
  errorCode?: string;
  xmlLength?: number;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: params.success ? 'SUNAT_XML_BUILT' : 'SUNAT_XML_FAILED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.success ? 'INFO' : 'ERROR',
    meta: {
      documentId: params.documentId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      xmlLength: params.xmlLength,
      errorCode: params.errorCode,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * ✅ MÓDULO 18.3: Registra evento de firma digital de XML
 */
export async function auditSunatXmlSigned(params: {
  storeId: string;
  userId?: string;
  documentId: string;
  docType: string;
  fullNumber: string;
  success: boolean;
  errorCode?: string;
  hash?: string;
  digestValue?: string;
  force?: boolean;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: params.success ? 'SUNAT_XML_SIGNED' : 'SUNAT_XML_SIGN_FAILED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.success ? 'INFO' : 'ERROR',
    meta: {
      documentId: params.documentId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      hash: params.hash,
      digestValue: params.digestValue,
      force: params.force,
      errorCode: params.errorCode,
      // NUNCA incluir: certPassword, privateKey, signatureValue completo
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * ✅ MÓDULO 18.4: Registra evento de job SUNAT encolado
 */
export async function auditSunatJobQueued(params: {
  storeId: string;
  userId: string;
  documentId: string;
  jobId: string;
  docType: string;
  fullNumber: string;
  isRetry?: boolean;
  previousJobId?: string;
  previousError?: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId,
    action: params.isRetry ? 'SUNAT_JOB_RETRY_QUEUED' : 'SUNAT_JOB_QUEUED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: 'INFO',
    meta: {
      documentId: params.documentId,
      jobId: params.jobId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      isRetry: params.isRetry || false,
      previousJobId: params.previousJobId,
      previousError: params.previousError,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * ✅ MÓDULO 18.4: Registra evento de job SUNAT iniciado por el worker
 */
export async function auditSunatJobStarted(params: {
  storeId: string;
  documentId: string;
  jobId: string;
  docType: string;
  fullNumber: string;
  attempts: number;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: null,
    action: 'SUNAT_JOB_STARTED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: 'INFO',
    meta: {
      documentId: params.documentId,
      jobId: params.jobId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      attempts: params.attempts,
    },
    ip: null,
    userAgent: null,
  });
}

/**
 * ✅ MÓDULO 18.4: Registra evento de job SUNAT completado exitosamente
 */
export async function auditSunatJobSuccess(params: {
  storeId: string;
  documentId: string;
  jobId: string;
  docType: string;
  fullNumber: string;
  attempts: number;
  sunatCode?: string;
  sunatMessage?: string;
  cdrReceived: boolean;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: null,
    action: 'SUNAT_JOB_SUCCESS',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: 'INFO',
    meta: {
      documentId: params.documentId,
      jobId: params.jobId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      attempts: params.attempts,
      sunatCode: params.sunatCode,
      sunatMessage: params.sunatMessage,
      cdrReceived: params.cdrReceived,
      // NUNCA incluir: solPass, XML completo, CDR completo
    },
    ip: null,
    userAgent: null,
  });
}

/**
 * ✅ MÓDULO 18.4: Registra evento de job SUNAT fallido
 */
export async function auditSunatJobFailed(params: {
  storeId: string;
  documentId: string;
  jobId: string;
  docType: string;
  fullNumber: string;
  attempts: number;
  errorCode: string;
  errorMessage: string;
  willRetry: boolean;
  nextRunAt?: Date;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: null,
    action: 'SUNAT_JOB_FAILED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.willRetry ? 'WARN' : 'ERROR',
    meta: {
      documentId: params.documentId,
      jobId: params.jobId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      attempts: params.attempts,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      willRetry: params.willRetry,
      nextRunAt: params.nextRunAt?.toISOString(),
      // NUNCA incluir: solPass, certificados, detalles de red internos
    },
    ip: null,
    userAgent: null,
  });
}

/**
 * ✅ MÓDULO 18.4: Registra evento de CDR recibido de SUNAT
 */
export async function auditSunatCdrReceived(params: {
  storeId: string;
  documentId: string;
  docType: string;
  fullNumber: string;
  responseCode: string;
  description: string;
  isAccepted: boolean;
  notes?: string[];
}) {
  return logAudit({
    storeId: params.storeId,
    userId: null,
    action: params.isAccepted ? 'SUNAT_CDR_ACCEPTED' : 'SUNAT_CDR_REJECTED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.isAccepted ? 'INFO' : 'ERROR',
    meta: {
      documentId: params.documentId,
      docType: params.docType,
      fullNumber: params.fullNumber,
      responseCode: params.responseCode,
      description: params.description,
      notes: params.notes || [],
      // NUNCA incluir: CDR completo, XML
    },
    ip: null,
    userAgent: null,
  });
}

/**
 * Registra solicitud de emisión de comprobante desde UI
 */
export async function auditSunatEmitRequested(
  userId: string,
  storeId: string,
  saleId: string,
  docType: string,
  fullNumber: string,
  customerDocType: string,
  customerDocNumber: string
) {
  return logAudit({
    storeId,
    userId,
    action: 'SUNAT_EMIT_REQUESTED',
    entityType: 'SALE',
    entityId: saleId,
    severity: 'INFO',
    meta: {
      docType,
      fullNumber,
      customerDocType,
      customerDocNumber,
    },
  });
}

/**
 * Registra emisión exitosa de comprobante
 */
export async function auditSunatEmitSuccess(
  userId: string,
  storeId: string,
  saleId: string,
  docType: string,
  fullNumber: string,
  documentId: string,
  jobId: string
) {
  return logAudit({
    storeId,
    userId,
    action: 'SUNAT_EMIT_SUCCESS',
    entityType: 'SUNAT',
    entityId: documentId,
    severity: 'INFO',
    meta: {
      saleId,
      docType,
      fullNumber,
      jobId,
    },
  });
}

/**
 * Registra fallo en emisión de comprobante
 */
export async function auditSunatEmitFailed(
  userId: string,
  storeId: string,
  saleId: string,
  docType: string,
  errorMessage: string,
  documentId: string | null,
  jobId: string | null
) {
  return logAudit({
    storeId,
    userId,
    action: 'SUNAT_EMIT_FAILED',
    entityType: 'SALE',
    entityId: saleId,
    severity: 'ERROR',
    meta: {
      docType,
      errorMessage,
      documentId,
      jobId,
    },
  });
}

/**
 * Registra descarga de archivo SUNAT (XML, CDR, PDF)
 */
export async function auditSunatDownload(
  userId: string,
  storeId: string,
  saleId: string | null,
  documentId: string,
  fileType: 'XML' | 'CDR' | 'PDF',
  docType: string,
  fullNumber: string
) {
  return logAudit({
    storeId,
    userId,
    action: 'SUNAT_DOWNLOAD',
    entityType: 'SUNAT',
    entityId: documentId,
    severity: 'INFO',
    meta: {
      saleId,
      fileType,
      docType,
      fullNumber,
    },
  });
}

// ✅ MÓDULO 18.6: Funciones de auditoría para Summary y Voided

/**
 * Registra creación de Resumen Diario
 */
export async function auditSunatSummaryCreated(params: {
  storeId: string;
  userId: string;
  summaryId: string;
  fullNumber: string;
  referenceDate: string;
  boletasCount: number;
  totalAmount: number;
  jobId: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId,
    action: 'SUNAT_SUMMARY_CREATED',
    entityType: 'SUNAT',
    entityId: params.summaryId,
    severity: 'INFO',
    meta: {
      fullNumber: params.fullNumber,
      referenceDate: params.referenceDate,
      boletasCount: params.boletasCount,
      totalAmount: params.totalAmount,
      jobId: params.jobId,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra aceptación de Resumen Diario
 */
export async function auditSunatSummaryAccepted(params: {
  storeId: string;
  userId?: string;
  summaryId: string;
  fullNumber: string;
  sunatCode: string;
  boletasMarked: number;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_SUMMARY_ACCEPTED',
    entityType: 'SUNAT',
    entityId: params.summaryId,
    severity: 'INFO',
    meta: {
      fullNumber: params.fullNumber,
      sunatCode: params.sunatCode,
      boletasMarked: params.boletasMarked,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra rechazo de Resumen Diario
 */
export async function auditSunatSummaryRejected(params: {
  storeId: string;
  userId?: string;
  summaryId: string;
  fullNumber: string;
  sunatCode: string;
  sunatMessage: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_SUMMARY_REJECTED',
    entityType: 'SUNAT',
    entityId: params.summaryId,
    severity: 'ERROR',
    meta: {
      fullNumber: params.fullNumber,
      sunatCode: params.sunatCode,
      sunatMessage: params.sunatMessage,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra creación de Comunicación de Baja
 */
export async function auditSunatVoidedCreated(params: {
  storeId: string;
  userId: string;
  voidedId: string;
  fullNumber: string;
  documentsAffected: string[];
  voidReason: string;
  jobId: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId,
    action: 'SUNAT_VOIDED_CREATED',
    entityType: 'SUNAT',
    entityId: params.voidedId,
    severity: 'WARN',
    meta: {
      fullNumber: params.fullNumber,
      documentsAffected: params.documentsAffected,
      documentsCount: params.documentsAffected.length,
      voidReason: params.voidReason,
      jobId: params.jobId,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra aceptación de Comunicación de Baja
 */
export async function auditSunatVoidedAccepted(params: {
  storeId: string;
  userId?: string;
  voidedId: string;
  fullNumber: string;
  sunatCode: string;
  documentsCanceled: string[];
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_VOIDED_ACCEPTED',
    entityType: 'SUNAT',
    entityId: params.voidedId,
    severity: 'WARN',
    meta: {
      fullNumber: params.fullNumber,
      sunatCode: params.sunatCode,
      documentsCanceled: params.documentsCanceled,
      canceledCount: params.documentsCanceled.length,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra rechazo de Comunicación de Baja
 */
export async function auditSunatVoidedRejected(params: {
  storeId: string;
  userId?: string;
  voidedId: string;
  fullNumber: string;
  sunatCode: string;
  sunatMessage: string;
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_VOIDED_REJECTED',
    entityType: 'SUNAT',
    entityId: params.voidedId,
    severity: 'ERROR',
    meta: {
      fullNumber: params.fullNumber,
      sunatCode: params.sunatCode,
      sunatMessage: params.sunatMessage,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}

/**
 * Registra consulta de ticket SUNAT
 */
export async function auditSunatTicketPolled(params: {
  storeId: string;
  userId?: string;
  documentId: string;
  ticket: string;
  statusCode: string;
  result: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  ip?: string;
  userAgent?: string;
}) {
  return logAudit({
    storeId: params.storeId,
    userId: params.userId || null,
    action: 'SUNAT_TICKET_POLLED',
    entityType: 'SUNAT',
    entityId: params.documentId,
    severity: params.result === 'REJECTED' ? 'ERROR' : 'INFO',
    meta: {
      ticket: params.ticket,
      statusCode: params.statusCode,
      result: params.result,
    },
    ip: params.ip || null,
    userAgent: params.userAgent || null,
  });
}
