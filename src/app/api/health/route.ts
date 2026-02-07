/**
 * MÓDULO S9 — Health Check Endpoint
 * 
 * Endpoint para monitoreo de uptime (UptimeRobot, BetterStack, etc.)
 * 
 * Checks:
 * - API running (always)
 * - Database connection (optional, via ?deep=true)
 * 
 * Respuestas:
 * - 200 OK: Todo funcionando
 * - 503 Service Unavailable: DB down (solo en deep check)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    api: 'ok';
    database?: 'ok' | 'error';
  };
  latency?: {
    database?: number;
  };
}

// Tiempo de inicio del servidor
const startTime = Date.now();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep') === 'true';
  
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      api: 'ok',
    },
  };

  // Deep check: verificar conexión a DB
  if (deep) {
    try {
      const dbStart = performance.now();
      await prisma.$queryRaw`SELECT 1`;
      const dbLatency = Math.round(performance.now() - dbStart);
      
      response.checks.database = 'ok';
      response.latency = { database: dbLatency };
    } catch (error) {
      response.status = 'degraded';
      response.checks.database = 'error';
      
      // En producción, no exponer detalles del error
      console.error('[Health] Database check failed:', error);
      
      return NextResponse.json(response, { status: 503 });
    }
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
