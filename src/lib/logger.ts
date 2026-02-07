/**
 * MÓDULO S9 — Logger Estructurado
 * 
 * Sistema de logging estructurado para observabilidad.
 * Incluye requestId, contexto de usuario/tienda, y métricas de performance.
 * 
 * REGLAS:
 * - NO loguear PII (emails, nombres, passwords)
 * - SÍ loguear IDs (userId, storeId, saleId)
 * - Incluir siempre requestId para correlación
 */

import { nanoid } from 'nanoid';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  storeId?: string;
  userId?: string;
  action?: string;
  durationMs?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
}

/**
 * Genera un requestId único para correlacionar logs
 */
export function generateRequestId(): string {
  return nanoid(12);
}

/**
 * Formatea y envía log al stdout (capturado por plataforma cloud)
 */
function writeLog(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: {
      requestId: context.requestId || 'no-request-id',
      ...context,
    },
  };

  // En producción: JSON estructurado para parsing
  // En desarrollo: formato legible
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const contextStr = Object.entries(context)
      .filter(([k]) => k !== 'requestId')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    const reqId = context.requestId ? `[${context.requestId}]` : '';
    console.log(`${prefix} ${reqId} ${message} ${contextStr}`.trim());
  }
}

/**
 * Logger principal con métodos por nivel
 */
export const logger = {
  debug: (message: string, context?: LogContext) => writeLog('debug', message, context),
  info: (message: string, context?: LogContext) => writeLog('info', message, context),
  warn: (message: string, context?: LogContext) => writeLog('warn', message, context),
  error: (message: string, context?: LogContext) => writeLog('error', message, context),
};

/**
 * Mide duración de una operación async
 */
export async function withTiming<T>(
  operation: () => Promise<T>,
  context: LogContext & { action: string }
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  try {
    const result = await operation();
    const durationMs = Math.round(performance.now() - start);
    logger.info(`${context.action} completed`, { ...context, durationMs });
    return { result, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logger.error(`${context.action} failed`, { 
      ...context, 
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Crea un logger con contexto pre-establecido (para requests)
 */
export function createRequestLogger(baseContext: LogContext) {
  return {
    debug: (message: string, extra?: LogContext) => 
      logger.debug(message, { ...baseContext, ...extra }),
    info: (message: string, extra?: LogContext) => 
      logger.info(message, { ...baseContext, ...extra }),
    warn: (message: string, extra?: LogContext) => 
      logger.warn(message, { ...baseContext, ...extra }),
    error: (message: string, extra?: LogContext) => 
      logger.error(message, { ...baseContext, ...extra }),
  };
}

/**
 * Extrae contexto básico de un request (para API routes)
 */
export function getRequestContext(request: Request, session?: { userId?: string; storeId?: string }): LogContext {
  const requestId = request.headers.get('x-request-id') || generateRequestId();
  
  return {
    requestId,
    userId: session?.userId,
    storeId: session?.storeId,
    method: request.method,
    path: new URL(request.url).pathname,
  };
}
