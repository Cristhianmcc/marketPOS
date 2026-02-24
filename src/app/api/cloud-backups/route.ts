/**
 * API: Cloud Backups - List
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * GET /api/cloud-backups?storeId=...&limit=20&status=...
 * 
 * Lista los backups en la nube para una tienda.
 * Solo SUPERADMIN puede usar este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { CloudBackupStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session?.email) {
      return NextResponse.json(
        { code: 'UNAUTHORIZED', message: 'No autenticado' },
        { status: 401 }
      );
    }

    if (!isSuperAdmin(session.email)) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'No tienes permisos' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const limitStr = searchParams.get('limit');
    const statusFilter = searchParams.get('status') as CloudBackupStatus | null;

    const limit = Math.min(parseInt(limitStr || '20', 10), 100);

    // Construir where
    const where: any = {};
    
    if (storeId) {
      where.storeId = storeId;
    }

    if (statusFilter && ['UPLOADING', 'AVAILABLE', 'DELETED', 'FAILED'].includes(statusFilter)) {
      where.status = statusFilter;
    } else {
      // Por defecto mostrar AVAILABLE y UPLOADING
      where.status = { in: ['AVAILABLE', 'UPLOADING'] };
    }

    const backups = await prisma.cloudBackup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        storeId: true,
        createdAt: true,
        exportedAt: true,
        version: true,
        appVersion: true,
        sizeBytes: true,
        sha256: true,
        status: true,
        notes: true,
        store: {
          select: {
            name: true,
          },
        },
      },
    });

    // Formatear respuesta
    const formattedBackups = backups.map((b) => ({
      id: b.id,
      storeId: b.storeId,
      storeName: b.store.name,
      createdAt: b.createdAt.toISOString(),
      exportedAt: b.exportedAt.toISOString(),
      version: b.version,
      appVersion: b.appVersion,
      sizeBytes: b.sizeBytes,
      sizeMb: Math.round(b.sizeBytes / 1024 / 1024 * 100) / 100,
      sha256: b.sha256,
      status: b.status,
      notes: b.notes,
    }));

    return NextResponse.json({
      backups: formattedBackups,
      count: formattedBackups.length,
    });
  } catch (error) {
    console.error('[CloudBackup] Error listing backups:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al listar backups' },
      { status: 500 }
    );
  }
}
