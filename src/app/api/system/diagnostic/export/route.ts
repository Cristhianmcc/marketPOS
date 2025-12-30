// GET /api/system/diagnostic/export
// ✅ MÓDULO 16.2: Exportar Diagnóstico (Solo SUPERADMIN)

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/infra/db/prisma';
import { logAudit, getRequestMetadata } from '@/lib/auditLog';
import AdmZip from 'adm-zip';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

export async function GET(request: Request) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    // Solo OWNER puede exportar diagnóstico
    if (session.role !== 'OWNER') {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'Solo OWNER puede exportar diagnóstico' },
        { status: 403 }
      );
    }

    const storeId = session.storeId;

    // 1. Health Check
    let dbLatency = 0;
    let dbStatus = 'OK';
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
    } catch {
      dbStatus = 'DOWN';
    }

    const healthData = {
      status: dbStatus === 'OK' ? 'OK' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      appVersion: APP_VERSION,
      environment: ENVIRONMENT,
      database: {
        status: dbStatus,
        latencyMs: dbLatency,
      },
    };

    // 2. Store Status
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    const currentShift = await prisma.shift.findFirst({
      where: {
        storeId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: {
          select: {
            name: true,
          },
        },
      },
    });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const todaySales = await prisma.sale.findMany({
      where: {
        storeId,
        createdAt: { gte: startOfDay },
      },
      select: {
        total: true,
        paymentMethod: true,
      },
    });

    const storeStatusData = {
      storeId: store?.id,
      storeName: store?.name,
      storeStatus: store?.status,
      currentShift: currentShift ? {
        open: true,
        openedAt: currentShift.openedAt.toISOString(),
        openedBy: currentShift.openedBy.name,
      } : {
        open: false,
      },
      today: {
        salesCount: todaySales.length,
        salesTotal: todaySales.reduce((sum, s) => sum + s.total.toNumber(), 0),
      },
    };

    // 3. Config Snapshot
    const featureFlags = await prisma.featureFlag.findMany({
      where: { storeId },
      select: { key: true, enabled: true },
    });

    const operationalLimit = await prisma.operationalLimit.findUnique({
      where: { storeId },
    });

    const configSnapshotData = {
      storeId,
      featureFlags: Object.fromEntries(featureFlags.map(f => [f.key, f.enabled])),
      operationalLimits: operationalLimit ? {
        maxDiscountPercent: operationalLimit.maxDiscountPercent?.toNumber() || null,
        maxManualDiscountAmount: operationalLimit.maxManualDiscountAmount?.toNumber() || null,
        maxSaleTotal: operationalLimit.maxSaleTotal?.toNumber() || null,
        maxItemsPerSale: operationalLimit.maxItemsPerSale || null,
        maxReceivableBalance: operationalLimit.maxReceivableBalance?.toNumber() || null,
      } : null,
    };

    // 4. Últimos 50 audit logs (sin datos sensibles)
    const auditLogs = await prisma.auditLog.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityType: true,
        severity: true,
        meta: true,
        user: {
          select: {
            name: true,
            role: true,
          },
        },
      },
    });

    const auditLogsData = auditLogs.map(log => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      action: log.action,
      entityType: log.entityType,
      severity: log.severity,
      userName: log.user?.name || 'SYSTEM',
      userRole: log.user?.role || null,
      // Meta puede contener datos sensibles, lo filtramos
      meta: sanitizeMeta(log.meta as Record<string, any> | null),
    }));

    // 5. App Version
    const appVersionData = {
      version: APP_VERSION,
      environment: ENVIRONMENT,
      exportedAt: new Date().toISOString(),
      exportedBy: session.userId,
    };

    // Crear ZIP con todos los archivos
    const zip = new AdmZip();
    
    zip.addFile('health.json', Buffer.from(JSON.stringify(healthData, null, 2)));
    zip.addFile('store-status.json', Buffer.from(JSON.stringify(storeStatusData, null, 2)));
    zip.addFile('config-snapshot.json', Buffer.from(JSON.stringify(configSnapshotData, null, 2)));
    zip.addFile('last-50-audit-logs.json', Buffer.from(JSON.stringify(auditLogsData, null, 2)));
    zip.addFile('app-version.txt', Buffer.from(JSON.stringify(appVersionData, null, 2)));

    const zipBuffer = zip.toBuffer();

    // Auditoría de exportación
    const { ip, userAgent } = getRequestMetadata(request);
    logAudit({
      storeId,
      userId: session.userId,
      action: 'DIAGNOSTIC_EXPORT',
      entityType: 'SYSTEM',
      severity: 'WARN',
      meta: {
        exportSize: zipBuffer.length,
      },
      ip,
      userAgent,
    }).catch(() => {});

    // Generar nombre de archivo con timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `diagnostic-${store?.name.replace(/\s+/g, '-')}-${timestamp}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Diagnostic Export] Error:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al exportar diagnóstico' },
      { status: 500 }
    );
  }
}

/**
 * Sanitiza metadata para eliminar datos sensibles
 */
function sanitizeMeta(meta: Record<string, any> | null): Record<string, any> | null {
  if (!meta) return null;

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'authorization',
    'api_key',
    'apiKey',
    'credit_card',
    'creditCard',
    'hash',
    'email', // Eliminar emails completos
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(meta)) {
    const keyLower = key.toLowerCase();
    
    // Si la key contiene palabras sensibles, omitir
    if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursivo para objetos anidados
      sanitized[key] = sanitizeMeta(value as Record<string, any>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
