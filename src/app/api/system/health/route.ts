// GET /api/system/health
// ✅ MÓDULO 16.2: Health Check del Sistema

import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { logAudit } from '@/lib/auditLog';

// Tiempo de inicio del proceso (en memoria)
const processStartTime = Date.now();

// Versión de la aplicación (puede venir de package.json o variable de entorno)
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // Verificar conexión a DB con query simple
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    const uptimeSeconds = Math.floor((Date.now() - processStartTime) / 1000);

    // Auditoría (fire-and-forget)
    logAudit({
      action: 'SYSTEM_HEALTH_CHECK',
      entityType: 'SYSTEM',
      severity: 'INFO',
      meta: {
        dbLatencyMs: dbLatency,
        responseTimeMs: Date.now() - startTime,
      },
    }).catch(() => {});

    return NextResponse.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      appVersion: APP_VERSION,
      environment: ENVIRONMENT,
      uptimeSeconds,
      database: {
        status: 'OK',
        latencyMs: dbLatency,
      },
    });
  } catch (error) {
    console.error('[Health Check] Database error:', error);

    // Auditoría de fallo (fire-and-forget)
    logAudit({
      action: 'SYSTEM_HEALTH_CHECK_FAILED',
      entityType: 'SYSTEM',
      severity: 'ERROR',
      meta: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        status: 'DEGRADED',
        timestamp: new Date().toISOString(),
        appVersion: APP_VERSION,
        environment: ENVIRONMENT,
        database: {
          status: 'DOWN',
          error: 'Database connection failed',
        },
      },
      { status: 503 }
    );
  }
}
