/**
 * MÓDULO S9 — Sentry Error Tracking (Preparado)
 * 
 * Configuración lista para activar Sentry cuando se instale.
 * 
 * INSTALACIÓN:
 * npm install @sentry/nextjs
 * 
 * Luego descomentar y configurar NEXT_PUBLIC_SENTRY_DSN en .env
 */

// import * as Sentry from '@sentry/nextjs';

interface ErrorContext {
  storeId?: string;
  userId?: string;
  action?: string;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Inicializa Sentry (llamar en instrumentation.ts o layout.tsx)
 * 
 * @example
 * // En src/instrumentation.ts
 * import { initSentry } from '@/lib/sentry';
 * export function register() {
 *   initSentry();
 * }
 */
export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  
  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  // Descomentar cuando se instale @sentry/nextjs:
  /*
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    
    // Performance: solo endpoints críticos
    tracesSampleRate: 0.1, // 10% de transacciones
    
    // Solo capturar errores reales, no warnings
    beforeSend(event) {
      // Filtrar errores de desarrollo
      if (process.env.NODE_ENV !== 'production') {
        return null;
      }
      return event;
    },
    
    // NO capturar PII
    sendDefaultPii: false,
  });
  */
  
  console.log('[Sentry] Would initialize with DSN:', dsn.substring(0, 20) + '...');
}

/**
 * Captura un error con contexto adicional
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   captureError(error, { storeId, userId, action: 'CHECKOUT' });
 * }
 */
export function captureError(error: Error, context?: ErrorContext): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  
  if (!dsn) {
    // Sin Sentry, solo log
    console.error('[Error]', error.message, context);
    return;
  }

  // Descomentar cuando se instale @sentry/nextjs:
  /*
  Sentry.withScope((scope) => {
    // Agregar contexto sin PII
    if (context?.storeId) scope.setTag('storeId', context.storeId);
    if (context?.userId) scope.setTag('userId', context.userId);
    if (context?.action) scope.setTag('action', context.action);
    if (context?.requestId) scope.setTag('requestId', context.requestId);
    
    // Agregar extras
    scope.setExtras(context || {});
    
    Sentry.captureException(error);
  });
  */
  
  console.error('[Sentry] Would capture:', error.message, context);
}

/**
 * Inicia una transacción de performance
 * 
 * @example
 * const transaction = startTransaction('checkout', { storeId });
 * try {
 *   await processCheckout();
 *   transaction.finish();
 * } catch (error) {
 *   transaction.setStatus('error');
 *   transaction.finish();
 * }
 */
export function startTransaction(name: string, context?: ErrorContext): { finish: () => void; setStatus: (status: string) => void } {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  
  if (!dsn) {
    // Sin Sentry, no-op
    return { 
      finish: () => {},
      setStatus: () => {},
    };
  }

  // Descomentar cuando se instale @sentry/nextjs:
  /*
  const transaction = Sentry.startTransaction({
    name,
    op: 'api',
  });
  
  if (context?.storeId) transaction.setTag('storeId', context.storeId);
  if (context?.userId) transaction.setTag('userId', context.userId);
  
  return {
    finish: () => transaction.finish(),
    setStatus: (status: string) => transaction.setStatus(status as any),
  };
  */
  
  const start = performance.now();
  return {
    finish: () => {
      const duration = Math.round(performance.now() - start);
      console.log(`[Perf] ${name} completed in ${duration}ms`, context);
    },
    setStatus: () => {},
  };
}

/**
 * Endpoints críticos que deben tener tracing
 */
export const TRACED_ENDPOINTS = [
  '/api/checkout',
  '/api/backups/restore',
  '/api/backups/export',
  '/api/sunat/emit',
  '/api/auth/login',
];

/**
 * Verifica si un endpoint debe tener tracing
 */
export function shouldTrace(pathname: string): boolean {
  return TRACED_ENDPOINTS.some(ep => pathname.startsWith(ep));
}
