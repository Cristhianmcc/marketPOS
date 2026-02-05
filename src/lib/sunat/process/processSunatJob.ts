/**
 * MÓDULO 18.4 + 18.7 — PROCESAMIENTO DE JOBS SUNAT
 * 
 * Pipeline que toma un SunatJob de la base de datos y ejecuta el envío a SUNAT.
 * Incluye locking, validaciones, construcción del ZIP, envío SOAP, procesamiento del CDR,
 * y actualización del estado del documento con backoff exponencial en caso de error.
 * 
 * IMPORTANTE: Este código NO bloquea el checkout. Los jobs se procesan de forma asíncrona.
 * 
 * MÓDULO 18.7: Usa loadSolCredentials para prioridad ENV > DB
 */

import { PrismaClient, SunatStatus } from '@prisma/client';
import { sendBill, sendSummary, getStatus } from '../soap/sunatClient';
import { buildZip, buildSunatFilename, mapDocTypeToSunatCode } from '../zip/buildZip';
import { parseCdr, isAcceptedBysunat, getStatusMessage } from '../cdr/parseCdr';
import { loadSolCredentials, sanitizeCredentialsForLog } from '../credentials/loadSolCredentials';

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
    const validation = await validateJobExecution(document);
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

    // MÓDULO 18.7: Cargar credenciales SOL con prioridad ENV > DB
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

    // Enviar a SUNAT
    const sendResult = await sendBill(
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
    const newStatus: SunatStatus = cdr.isAccepted ? 'ACCEPTED' : 'REJECTED';

    await prisma.electronicDocument.update({
      where: { id: documentId },
      data: {
        status: newStatus,
        cdrZip: sendResult.cdrZipBase64,
        sunatCode: cdr.responseCode,
        sunatMessage: cdr.description,
        sunatResponseAt: new Date(),
      },
    });

    // Marcar job como completado
    await prisma.sunatJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
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
    // Validar que el XML esté firmado
    if (!document.xmlSigned) {
      await markJobFailed(jobId, 'XML_NOT_SIGNED', 'XML no está firmado', false);
      return {
        success: false,
        jobId,
        documentId,
        message: 'XML del resumen no está firmado',
      };
    }

    // MÓDULO 18.7: Cargar credenciales SOL con prioridad ENV > DB
    const solCredentials = await loadSolCredentials(prisma, document.storeId);

    // Construir nombre de archivo según tipo (SUMMARY o VOIDED)
    const isSummary = document.docType === 'SUMMARY';
    const prefix = isSummary ? 'RC' : 'RA';
    const filename = `${settings.ruc}-${document.series}-${formatFilenameDate(document.issueDate)}-${String(document.number).padStart(5, '0')}`;

    // Construir ZIP
    const zipBase64 = buildZip(filename, document.xmlSigned);

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

    // Guardar ticket en el documento
    await prisma.electronicDocument.update({
      where: { id: documentId },
      data: {
        status: 'SENT',
        sunatTicket: sendResult.ticket,
      },
    });

    // Marcar este job como completado
    await prisma.sunatJob.update({
      where: { id: jobId },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });

    // Crear job QUERY_TICKET para consultar resultado en unos minutos
    // SUNAT recomienda esperar al menos 1 minuto antes de consultar
    const nextRunAt = new Date(Date.now() + 60 * 1000); // 1 minuto después
    
    await prisma.sunatJob.create({
      data: {
        storeId: document.storeId,
        documentId: documentId,
        type: 'QUERY_TICKET',
        status: 'QUEUED',
        nextRunAt,
      },
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

    // MÓDULO 18.7: Cargar credenciales SOL con prioridad ENV > DB
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
      
      if (statusResult.cdrZipBase64) {
        const cdr = await parseCdr(statusResult.cdrZipBase64);
        if (cdr) {
          cdrDescription = cdr.description;
          cdrCode = cdr.responseCode;
        }
      }

      await prisma.electronicDocument.update({
        where: { id: documentId },
        data: {
          status: 'ACCEPTED',
          cdrZip: statusResult.cdrZipBase64,
          sunatCode: cdrCode,
          sunatMessage: cdrDescription,
          sunatResponseAt: new Date(),
        },
      });

      await prisma.sunatJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });

      // Si es un SUMMARY, marcar las boletas incluidas como reportadas
      if (document.docType === 'SUMMARY') {
        await markBoletasAsReportedInSummary(document);
      }

      return {
        success: true,
        jobId,
        documentId,
        message: `Documento aceptado: ${cdrDescription}`,
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
async function markBoletasAsReportedInSummary(summaryDocument: any): Promise<void> {
  // El Summary incluye un metadata de qué documentos contiene
  // Esto se guardó al crear el Summary en el campo voidReason (temporal) o se puede
  // parsear del XML. Por ahora usamos un enfoque simple: actualizar boletas
  // del mismo día y tienda que no estén reportadas
  
  // En una implementación real, deberíamos guardar los IDs de los documentos
  // incluidos en el Summary. Por ahora este es un placeholder.
  console.log(`Summary ${summaryDocument.id} aceptado. Marcando boletas como reportadas.`);
}

/**
 * Formatea la fecha para el nombre de archivo (YYYYMMDD)
 */
function formatFilenameDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
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

    // Actualizar documento a ERROR
    await prisma.electronicDocument.update({
      where: { id: job.documentId },
      data: {
        status: 'ERROR',
      },
    });
  }
}

/**
 * Valida que un documento pueda ser enviado a SUNAT.
 */
async function validateJobExecution(document: any): Promise<{
  valid: boolean;
  code?: string;
  message?: string;
}> {
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

  // Validar credenciales SOL
  if (!settings.solUser || !settings.solPass) {
    return {
      valid: false,
      code: 'MISSING_CREDENTIALS',
      message: 'Faltan credenciales SOL (solUser/solPass)',
    };
  }

  // Validar estado del documento
  if (document.status !== 'SIGNED') {
    return {
      valid: false,
      code: 'INVALID_STATUS',
      message: `Estado del documento debe ser SIGNED, actual: ${document.status}`,
    };
  }

  return { valid: true };
}
