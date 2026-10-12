/**
 * MÓDULO 18.4 + 18.7 — PROCESAMIENTO DE JOBS SUNAT
 * 
 * Pipeline que toma un SunatJob de la base de datos y ejecuta el envío a SUNAT.
 * Incluye locking, validaciones, construcción del ZIP, envío SOAP, procesamiento del CDR,
 * y actualización del estado del documento con backoff exponencial en caso de error.
 * 
 * IMPORTANTE: Este código NO bloquea el checkout. Los jobs se procesan de forma asíncrona.
 * 
 * MÓDULO 18.7: Usa credenciales aisladas por tienda en producción.
 */

import { PrismaClient, SunatStatus } from '@prisma/client';
import { sendBill, sendSummary, getStatus, getStatusCdr } from '../soap/sunatClient';
import { buildZip, buildSunatFilename, mapDocTypeToSunatCode } from '../zip/buildZip';
import { parseCdr, isAcceptedBysunat, getStatusMessage } from '../cdr/parseCdr';
import { loadSolCredentials, sanitizeCredentialsForLog } from '../credentials/loadSolCredentials';
import { parseAdjustmentMetadata } from '../adjustmentMetadata';
import { cancelSaleLocally } from '@/lib/sales/cancelSaleLocally';
import { repairLegacyBatchDocument } from './repairLegacyBatchDocument';

const prisma = new PrismaClient();

// Configuración de backoff exponencial
const BACKOFF_DELAYS = [
  1 * 60 * 1000,      // 1 minuto
  5 * 60 * 1000,      // 5 minutos
  15 * 60 * 1000,     // 15 minutos
  60 * 60 * 1000,     // 60 minutos
  120 * 60 * 1000,    // 120 minutos
];

const MAX_ATTEMPTS = 5;

// Identificador único del worker (para locking)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Resultado del procesamiento de un job.
 */
export interface ProcessResult {
  success: boolean;
  jobId: string;
  documentId: string;
  message: string;
  shouldRetry?: boolean;
}

/**
 * Procesa un SunatJob.
 * 
 * 1. Lock del job para evitar doble procesamiento
 * 2. Validar configuración SUNAT y documento
 * 3. Construir ZIP con XML firmado
 * 4. Enviar a SUNAT vía SOAP
 * 5. Procesar respuesta (CDR)
 * 6. Actualizar estado del documento
 * 7. Actualizar job (DONE o FAILED con backoff)
 * 
 * @param jobId - ID del SunatJob a procesar
 * @returns Resultado del procesamiento
 */
export async function processSunatJob(jobId: string): Promise<ProcessResult> {
  try {
    // PASO 1: Lock del job
    const job = await lockJob(jobId);
    
    if (!job) {
      return {
        success: false,
        jobId,
        documentId: '',
        message: 'Job no encontrado o ya está siendo procesado',
      };
    }

    // PASO 2: Cargar documento y configuración
    const document = await prisma.electronicDocument.findUnique({
      where: { id: job.documentId },
      include: {
        store: {
          include: {
            sunatSettings: true,
          },
        },
      },
    });

    if (!document) {
      await markJobFailed(jobId, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado', false);
      return {
        success: false,
        jobId,
        documentId: job.documentId,
        message: 'Documento no encontrado',
      };
    }

    // PASO 3: Validaciones
    const validation = await validateJobExecution(document, job.type);
    if (!validation.valid) {
      await markJobFailed(jobId, validation.code!, validation.message!, false);
      return {
        success: false,
        jobId,
        documentId: job.documentId,
        message: validation.message!,
      };
    }

    const settings = document.store.sunatSettings!;

    // PASO 4: Ejecutar según tipo de job
    let result: ProcessResult;
    
    if (job.type === 'SEND_CPE') {
      result = await processSendCpe(job, document, settings);
    } else if (job.type === 'SEND_SUMMARY') {
      result = await processSendSummary(job, document, settings);
    } else if (job.type === 'QUERY_TICKET') {
      result = await processQueryTicket(job, document, settings);
    } else if (job.type === 'LOCAL_CANCEL') {
      result = await processLocalCancel(job, document);
    } else {
      result = {
        success: false,
        jobId,
        documentId: job.documentId,
        message: `Tipo de job no soportado: ${job.type}`,
      };
    }

    return result;

  } catch (error: any) {
    console.error(`Error procesando job ${jobId}:`, error.message);
    
    await markJobFailed(
      jobId,
      'UNEXPECTED_ERROR',
      error.message || 'Error inesperado',
      true // retry
    );

    return {
      success: false,
      jobId,
      documentId: '',
      message: error.message || 'Error inesperado',
      shouldRetry: true,
    };
  }
}

/**
 * Procesa un job de tipo SEND_CPE (Factura, Boleta, NC, ND).
 */
async function processSendCpe(job: any, document: any, settings: any): Promise<ProcessResult> {
  const { id: jobId, documentId, attempts } = job;

  try {
    // Validar que el XML esté firmado
    if (!document.xmlSigned) {
      await markJobFailed(jobId, 'XML_NOT_SIGNED', 'XML no está firmado', false);
      return {
        success: false,
        jobId,
        documentId,
        message: 'XML no está firmado',
      };
    }

    // BETA usa MODDATOS; PROD carga las credenciales exclusivas de la tienda.
    const solCredentials = await loadSolCredentials(prisma, document.storeId);
    
    // Log sanitizado (sin password)
    console.log('[SUNAT] Usando credenciales SOL:', sanitizeCredentialsForLog(solCredentials));

    // Construir nombre de archivo SUNAT
    const sunatCode = mapDocTypeToSunatCode(document.docType);
    const filename = buildSunatFilename(
      settings.ruc,
      sunatCode,
      document.series,
      String(document.number).padStart(8, '0')
    );

    // Construir ZIP
    const zipBase64 = buildZip(filename, document.xmlSigned);

    // Guardar ZIP enviado (opcional, solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      await prisma.electronicDocument.update({
        where: { id: documentId },
        data: { zipSentBase64: zipBase64 },
      });
    }

    const soapConfig = {
      solUser: solCredentials.solUser,
      solPass: solCredentials.solPass,
      environment: settings.env || 'BETA',
    } as const;

    // Si un intento anterior pudo llegar a SUNAT pero se perdio la respuesta,
    // recuperar primero el CDR evita reenviar el mismo comprobante a ciegas.
    let recoveredCdr: string | undefined;
    if (attempts > 0 && soapConfig.environment === 'PROD') {
      const recovery = await getStatusCdr(soapConfig, {
        ruc: settings.ruc,
        docTypeCode: sunatCode,
        series: document.series,
        number: document.number,
      });
      if (!recovery.success) {
        await markJobFailed(jobId, recovery.errorCode || 'CDR_QUERY_ERROR', recovery.errorMessage || 'No se pudo reconciliar el envio anterior', true);
        return { success: false, jobId, documentId, message: recovery.errorMessage || 'No se pudo reconciliar el envio anterior', shouldRetry: true };
      }
      recoveredCdr = recovery.cdrZipBase64;
    }

    const sendResult = recoveredCdr
      ? { success: true, cdrZipBase64: recoveredCdr }
      : await sendBill(soapConfig, filename, zipBase64);

    if (!sendResult.success) {
      // Error de SUNAT o red
      await markJobFailed(
        jobId,
        sendResult.errorCode!,
        sendResult.errorMessage!,
        true // retry
      );

      return {
        success: false,
        jobId,
        documentId,
        message: sendResult.errorMessage!,
        shouldRetry: true,
      };
    }

    // Procesar CDR
    const cdr = await parseCdr(sendResult.cdrZipBase64!);

    if (!cdr) {
      await markJobFailed(jobId, 'CDR_PARSE_ERROR', 'No se pudo parsear el CDR', false);
      return {
        success: false,
        jobId,
        documentId,
        message: 'No se pudo parsear el CDR',
      };
    }

    // Actualizar documento según respuesta SUNAT
    const newStatus: SunatStatus = cdr.isObserved
      ? 'OBSERVED'
      : cdr.isAccepted
        ? 'ACCEPTED'
        : 'REJECTED';

    const adjustment = parseAdjustmentMetadata(document.voidReason);
    const shouldCancelLocally =
      newStatus === 'ACCEPTED' &&
      document.docType === 'NOTA_CREDITO' &&
      adjustment?.cancelSaleOnAcceptance &&
      !!document.saleId;

    // Registrar la respuesta, completar el envío y programar la reversión local
    // en una sola transacción. Así nunca se reenvía un CPE ya aceptado porque
    // falló la creación del trabajo local posterior.
    await prisma.$transaction(async (tx) => {
      await tx.electronicDocument.update({
        where: { id: documentId },
        data: {
          status: newStatus,
          cdrZip: sendResult.cdrZipBase64,
          sunatCode: cdr.responseCode,
          sunatMessage: cdr.notes.length > 0
            ? `${cdr.description} | ${cdr.notes.join(' | ')}`
            : cdr.description,
          sunatResponseAt: new Date(),
        },
      });

      await tx.sunatJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      if (shouldCancelLocally) {
        const existingLocalJob = await tx.sunatJob.findFirst({
          where: { documentId, type: 'LOCAL_CANCEL', status: { in: ['QUEUED', 'RUNNING', 'DONE'] } },
        });
        if (!existingLocalJob) await tx.sunatJob.create({
          data: {
            storeId: document.storeId,
            documentId,
            type: 'LOCAL_CANCEL',
            status: 'QUEUED',
            nextRunAt: new Date(),
          },
        });
      }
    });

    return {
      success: true,
      jobId,
      documentId,
      message: `Documento ${newStatus.toLowerCase()}: ${cdr.description}`,
    };

  } catch (error: any) {
    console.error(`Error en processSendCpe:`, error.message);
    
    await markJobFailed(
      jobId,
      'SEND_ERROR',
      error.message || 'Error al enviar a SUNAT',
      true
    );

    return {
      success: false,
      jobId,
      documentId,
      message: error.message || 'Error al enviar a SUNAT',
      shouldRetry: true,
    };
  }
}

async function processLocalCancel(job: any, document: any): Promise<ProcessResult> {
  const metadata = parseAdjustmentMetadata(document.voidReason);
  if (
    document.docType !== 'NOTA_CREDITO' ||
    document.status !== 'ACCEPTED' ||
    !metadata?.cancelSaleOnAcceptance ||
    !document.saleId
  ) {
    await markJobFailed(job.id, 'LOCAL_CANCEL_INVALID', 'La nota no habilita una anulación local', false);
    return { success: false, jobId: job.id, documentId: document.id, message: 'La nota no habilita una anulación local' };
  }

  const sale = await prisma.sale.findUnique({ where: { id: document.saleId }, select: { userId: true } });
  if (!sale) {
    await markJobFailed(job.id, 'SALE_NOT_FOUND', 'Venta no encontrada para revertir', false);
    return { success: false, jobId: job.id, documentId: document.id, message: 'Venta no encontrada para revertir' };
  }

  await cancelSaleLocally(prisma, document.saleId, sale.userId, metadata.reason);
  await prisma.sunatJob.update({
    where: { id: job.id },
    data: { status: 'DONE', completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
  });
  return { success: true, jobId: job.id, documentId: document.id, message: 'Venta e inventario revertidos' };
}

/**
 * Procesa un job de tipo SEND_SUMMARY (Resumen Diario o Comunicación de Baja).
 * 
 * Este proceso:
 * 1. Genera el XML del Summary o Voided desde el documento
 * 2. Firma el XML
 * 3. Construye el ZIP
 * 4. Envía a SUNAT vía sendSummary
 * 5. Recibe ticket
 * 6. Crea job QUERY_TICKET para consultar resultado
 * 
 * MÓDULO 18.6: Resumen Diario + Comunicación de Baja
 */
async function processSendSummary(job: any, document: any, settings: any): Promise<ProcessResult> {
  const { id: jobId, documentId, attempts } = job;

  try {
    const legacyRepair = await repairLegacyBatchDocument(prisma, job, document, settings);
    const currentDocument = legacyRepair.document;
    // Validar que el XML esté firmado
    if (!currentDocument.xmlSigned) {
      await markJobFailed(jobId, 'XML_NOT_SIGNED', 'XML no está firmado', false);
      return {
        success: false,
        jobId,
        documentId,
        message: 'XML del resumen no está firmado',
      };
    }

    if (attempts > 0 && settings.env === 'PROD' && !currentDocument.sunatTicket && !legacyRepair.repaired) {
      await markJobFailed(
        jobId,
        'AMBIGUOUS_SUMMARY_RETRY',
        'No se reenviará el resumen o baja: el intento anterior pudo generar un ticket que no fue recibido.',
        false
      );
      return {
        success: false,
        jobId,
        documentId,
        message: 'Reintento detenido para evitar duplicar un resumen o comunicación de baja',
      };
    }

    // BETA usa MODDATOS; PROD carga las credenciales de la tienda.
    const solCredentials = await loadSolCredentials(prisma, currentDocument.storeId);

    // Construir nombre de archivo según tipo (SUMMARY o VOIDED)
    // fullNumber fue calculado antes de firmar. Debe ser tambien el nombre del ZIP.
    const filename = currentDocument.fullNumber;

    // Construir ZIP
    const zipBase64 = buildZip(filename, currentDocument.xmlSigned);

    // Guardar ZIP enviado (opcional, solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      await prisma.electronicDocument.update({
        where: { id: documentId },
        data: { zipSentBase64: zipBase64 },
      });
    }

    // Enviar a SUNAT vía sendSummary (devuelve ticket)
    const sendResult = await sendSummary(
      {
        solUser: solCredentials.solUser,
        solPass: solCredentials.solPass,
        environment: settings.env || 'BETA',
      },
      filename,
      zipBase64
    );

    if (!sendResult.success) {
      // Error de SUNAT o red
      await markJobFailed(
        jobId,
        sendResult.errorCode!,
        sendResult.errorMessage!,
        true // retry
      );

      return {
        success: false,
        jobId,
        documentId,
        message: sendResult.errorMessage!,
        shouldRetry: true,
      };
    }

    const nextRunAt = new Date(Date.now() + 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.electronicDocument.update({
        where: { id: documentId },
        data: { status: 'SENT', sunatTicket: sendResult.ticket },
      });
      await tx.sunatJob.update({
        where: { id: jobId },
        data: { status: 'DONE', completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
      });
      const existingQuery = await tx.sunatJob.findFirst({
        where: { documentId, type: 'QUERY_TICKET', status: { in: ['QUEUED', 'RUNNING', 'DONE'] } },
      });
      if (!existingQuery) await tx.sunatJob.create({
        data: { storeId: currentDocument.storeId, documentId, type: 'QUERY_TICKET', status: 'QUEUED', nextRunAt },
      });
    });

    return {
      success: true,
      jobId,
      documentId,
      message: `Resumen enviado. Ticket: ${sendResult.ticket}. Job QUERY_TICKET creado.`,
    };

  } catch (error: any) {
    console.error(`Error en processSendSummary:`, error.message);
    
    await markJobFailed(
      jobId,
      'SEND_SUMMARY_ERROR',
      error.message || 'Error al enviar resumen a SUNAT',
      true
    );

    return {
      success: false,
      jobId,
      documentId,
      message: error.message || 'Error al enviar resumen a SUNAT',
      shouldRetry: true,
    };
  }
}

/**
 * Procesa un job de tipo QUERY_TICKET (consultar estado de resumen).
 * 
 * Este proceso:
 * 1. Obtiene el ticket del documento
 * 2. Consulta estado a SUNAT vía getStatus
 * 3. Si está en proceso (98), re-encola el job
 * 4. Si fue aceptado (0), marca documento ACCEPTED
 * 5. Si fue rechazado (99+), marca documento REJECTED
 * 
 * MÓDULO 18.6: Polling de Ticket
 */
async function processQueryTicket(job: any, document: any, settings: any): Promise<ProcessResult> {
  const { id: jobId, documentId, attempts } = job;

  try {
    // Validar que exista el ticket
    if (!document.sunatTicket) {
      await markJobFailed(jobId, 'NO_TICKET', 'Documento no tiene ticket', false);
      return {
        success: false,
        jobId,
        documentId,
        message: 'Documento no tiene ticket para consultar',
      };
    }

    // BETA usa MODDATOS; PROD carga las credenciales de la tienda.
    const solCredentials = await loadSolCredentials(prisma, document.storeId);

    // Consultar estado del ticket
    const statusResult = await getStatus(
      {
        solUser: solCredentials.solUser,
        solPass: solCredentials.solPass,
        environment: settings.env || 'BETA',
      },
      document.sunatTicket
    );

    if (!statusResult.success) {
      // Error de red/SUNAT - reintentar
      await markJobFailed(
        jobId,
        statusResult.errorCode!,
        statusResult.errorMessage!,
        true
      );

      return {
        success: false,
        jobId,
        documentId,
        message: statusResult.errorMessage!,
        shouldRetry: true,
      };
    }

    const statusCode = statusResult.statusCode;

    // Código 98 = En proceso, debemos reintentar
    if (statusCode === '98') {
      // Re-encolar para consultar después
      const nextRunAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutos más
      
      await prisma.sunatJob.update({
        where: { id: jobId },
        data: {
          status: 'QUEUED',
          attempts: (job.attempts || 0) + 1,
          nextRunAt,
          lockedAt: null,
          lockedBy: null,
          lastError: `Ticket en proceso. Reintentando en 2 minutos.`,
        },
      });

      return {
        success: true,
        jobId,
        documentId,
        message: 'Ticket aún en proceso. Re-encolado para consultar después.',
      };
    }

    // Código 0 = Aceptado
    if (statusCode === '0' || statusCode === '00' || statusCode === '0000') {
      // Procesar CDR si existe
      let cdrDescription = 'Aceptado';
      let cdrCode = statusCode;
      let cdrObserved = false;
      
      if (statusResult.cdrZipBase64) {
        const cdr = await parseCdr(statusResult.cdrZipBase64);
        if (cdr) {
          cdrDescription = cdr.description;
          cdrCode = cdr.responseCode;
          cdrObserved = cdr.isObserved;
          if (cdr.notes.length > 0) {
            cdrDescription = `${cdrDescription}. Observaciones: ${cdr.notes.join(' | ')}`;
          }
        }
      }

      const summaryIds = document.docType === 'SUMMARY' ? getSummaryDocumentIds(document) : [];
      const voidedIds = document.docType === 'VOIDED' ? getVoidedDocumentIds(document) : [];
      await prisma.$transaction(async (tx) => {
        await tx.electronicDocument.update({
          where: { id: documentId },
          data: {
            status: cdrObserved ? 'OBSERVED' : 'ACCEPTED',
            cdrZip: statusResult.cdrZipBase64,
            sunatCode: cdrCode,
            sunatMessage: cdrDescription,
            sunatResponseAt: new Date(),
          },
        });
        await tx.sunatJob.update({
          where: { id: jobId },
          data: { status: 'DONE', completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
        });
        if (summaryIds.length > 0) await tx.electronicDocument.updateMany({
          where: { id: { in: summaryIds }, storeId: document.storeId, docType: 'BOLETA' },
          data: { reportedInSummary: true },
        });
        if (voidedIds.length > 0) await tx.electronicDocument.updateMany({
          where: { id: { in: voidedIds }, storeId: document.storeId },
          data: { status: 'CANCELED' },
        });
      });

      return {
        success: true,
        jobId,
        documentId,
        message: `Documento ${cdrObserved ? 'observado' : 'aceptado'}: ${cdrDescription}`,
      };
    }

    // Código 99+ = Rechazado
    let rejectDescription = `Rechazado por SUNAT (código: ${statusCode})`;
    
    if (statusResult.cdrZipBase64) {
      const cdr = await parseCdr(statusResult.cdrZipBase64);
      if (cdr) {
        rejectDescription = cdr.description;
      }
    }

    await prisma.electronicDocument.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        cdrZip: statusResult.cdrZipBase64,
        sunatCode: statusCode,
        sunatMessage: rejectDescription,
        sunatResponseAt: new Date(),
      },
    });

    if (document.docType === 'SUMMARY') {
      const summaryIds = getSummaryDocumentIds(document);
      if (summaryIds.length > 0) await prisma.electronicDocument.updateMany({
        where: { id: { in: summaryIds }, storeId: document.storeId, docType: 'BOLETA' },
        data: { reportedInSummary: false },
      });
    }

    await prisma.sunatJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: rejectDescription,
      },
    });

    return {
      success: false,
      jobId,
      documentId,
      message: rejectDescription,
    };

  } catch (error: any) {
    console.error(`Error en processQueryTicket:`, error.message);
    
    await markJobFailed(
      jobId,
      'QUERY_TICKET_ERROR',
      error.message || 'Error al consultar ticket',
      true
    );

    return {
      success: false,
      jobId,
      documentId,
      message: error.message || 'Error al consultar ticket',
      shouldRetry: true,
    };
  }
}

/**
 * Marca las boletas incluidas en un Summary como reportadas.
 * Esto evita que se vuelvan a incluir en otro resumen.
 */
function getSummaryDocumentIds(summaryDocument: any): string[] {
  try {
    const parsed = JSON.parse(summaryDocument.voidReason || '[]');
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    throw new Error(`El resumen ${summaryDocument.fullNumber} no conserva la lista de boletas`);
  }
  return [];
}

function getVoidedDocumentIds(voidedDocument: any): string[] {
  try {
    const parsed = JSON.parse(voidedDocument.voidReason || '{}');
    if (parsed?.kind === 'VOIDED' && Array.isArray(parsed.documentIds)) {
      return parsed.documentIds.filter((id: unknown): id is string => typeof id === 'string');
    }
  } catch {
    throw new Error(`La baja ${voidedDocument.fullNumber} no conserva la lista de documentos`);
  }
  return [];
}

/**
 * Intenta hacer lock de un job para procesarlo.
 * Usa lockedAt y lockedBy para evitar doble procesamiento.
 * 
 * @param jobId - ID del job a lockear
 * @returns Job si se pudo lockear, null si ya está locked o no existe
 */
async function lockJob(jobId: string): Promise<any | null> {
  try {
    const now = new Date();
    
    // Lockear solo si está QUEUED y no locked (o locked hace más de 5 minutos)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const job = await prisma.sunatJob.updateMany({
      where: {
        id: jobId,
        status: 'QUEUED',
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: fiveMinutesAgo } }, // Lock expirado
        ],
      },
      data: {
        lockedAt: now,
        lockedBy: WORKER_ID,
      },
    });

    if (job.count === 0) {
      return null; // Ya está locked o no existe
    }

    // Devolver el job actualizado
    return await prisma.sunatJob.findUnique({
      where: { id: jobId },
    });

  } catch (error) {
    console.error('Error en lockJob:', error);
    return null;
  }
}

/**
 * Marca un job como FAILED y programa el siguiente reintento con backoff.
 * 
 * @param jobId - ID del job
 * @param errorCode - Código de error
 * @param errorMessage - Mensaje de error
 * @param shouldRetry - Si debe reintentar o fallar definitivamente
 */
async function markJobFailed(
  jobId: string,
  errorCode: string,
  errorMessage: string,
  shouldRetry: boolean
): Promise<void> {
  const job = await prisma.sunatJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const newAttempts = (job.attempts || 0) + 1;
  const shouldRetryAgain = shouldRetry && newAttempts < MAX_ATTEMPTS;

  if (shouldRetryAgain) {
    // Calcular siguiente ejecución con backoff
    const delay = BACKOFF_DELAYS[Math.min(newAttempts - 1, BACKOFF_DELAYS.length - 1)];
    const nextRunAt = new Date(Date.now() + delay);

    await prisma.sunatJob.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED', // Volver a encolar
        attempts: newAttempts,
        lastError: `${errorCode}: ${errorMessage}`,
        nextRunAt,
        lockedAt: null,
        lockedBy: null,
      },
    });
  } else {
    // Fallo definitivo
    await prisma.sunatJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        attempts: newAttempts,
        lastError: `${errorCode}: ${errorMessage}`,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });

    // Un fallo al aplicar una consecuencia local no cambia el resultado fiscal
    // ya aceptado por SUNAT. Solo los trabajos de transmisión marcan el CPE ERROR.
    if (job.type !== 'LOCAL_CANCEL') {
      await prisma.electronicDocument.update({
        where: { id: job.documentId },
        data: {
          status: 'ERROR',
        },
      });
    }
  }
}

/**
 * Valida que un documento pueda ser enviado a SUNAT.
 */
async function validateJobExecution(document: any, jobType: string): Promise<{
  valid: boolean;
  code?: string;
  message?: string;
}> {
  // La reversión local ocurre después de la aceptación y no depende de red,
  // credenciales ni del interruptor SUNAT. Debe terminar incluso si el owner
  // desactiva SUNAT inmediatamente después de recibir el CDR.
  if (jobType === 'LOCAL_CANCEL') {
    return document.status === 'ACCEPTED'
      ? { valid: true }
      : { valid: false, code: 'INVALID_STATUS', message: `Estado del documento debe ser ACCEPTED, actual: ${document.status}` };
  }

  // Validar feature flag
  if (process.env.ENABLE_SUNAT !== 'true') {
    return {
      valid: false,
      code: 'FEATURE_DISABLED',
      message: 'SUNAT está deshabilitado globalmente',
    };
  }

  // Validar configuración de tienda
  if (!document.store.sunatSettings?.enabled) {
    return {
      valid: false,
      code: 'SUNAT_DISABLED',
      message: 'SUNAT no está habilitado para esta tienda',
    };
  }

  const settings = document.store.sunatSettings;

  // SUNAT Beta usa las credenciales públicas MODDATOS (ver loadSolCredentials).
  // Las credenciales configuradas por la tienda solo son obligatorias en producción.
  if (settings.env !== 'BETA' && (!settings.solUser || !settings.solPass)) {
    return {
      valid: false,
      code: 'MISSING_CREDENTIALS',
      message: 'Faltan credenciales SOL (solUser/solPass)',
    };
  }

  const expectedStatus = jobType === 'QUERY_TICKET'
    ? 'SENT'
    : 'SIGNED';
  if (document.status !== expectedStatus) {
    return {
      valid: false,
      code: 'INVALID_STATUS',
      message: `Estado del documento debe ser ${expectedStatus}, actual: ${document.status}`,
    };
  }

  return { valid: true };
}
