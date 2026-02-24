/**
 * API: Cloud Backups - Request Download
 * 
 * MÓDULO D8: Cloud Backup Sync
 * 
 * POST /api/cloud-backups/request-download
 * 
 * Genera una presigned URL para descargar un backup de S3.
 * Solo SUPERADMIN puede usar este endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';
import { getSession } from '@/lib/session';
import { isSuperAdmin } from '@/lib/superadmin';
import { generatePresignedDownloadUrl, isS3Enabled } from '@/lib/s3Client';
import { logAudit } from '@/lib/auditLog';

interface RequestDownloadBody {
  backupId: string;
}

export async function POST(request: NextRequest) {
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

    // Verificar que S3 está configurado
    if (!isS3Enabled()) {
      return NextResponse.json(
        { code: 'S3_NOT_CONFIGURED', message: 'Almacenamiento en nube no configurado' },
        { status: 503 }
      );
    }

    const body: RequestDownloadBody = await request.json();
    const { backupId } = body;

    if (!backupId) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'backupId es obligatorio' },
        { status: 400 }
      );
    }

    // Buscar el backup
    const backup = await prisma.cloudBackup.findUnique({
      where: { id: backupId },
      select: {
        id: true,
        storeId: true,
        objectKey: true,
        status: true,
        sizeBytes: true,
        sha256: true,
        exportedAt: true,
        store: {
          select: { name: true },
        },
      },
    });

    if (!backup) {
      return NextResponse.json(
        { code: 'BACKUP_NOT_FOUND', message: 'Backup no encontrado' },
        { status: 404 }
      );
    }

    if (backup.status !== 'AVAILABLE') {
      return NextResponse.json(
        { code: 'BACKUP_NOT_AVAILABLE', message: `Backup no disponible (estado: ${backup.status})` },
        { status: 400 }
      );
    }

    // Generar presigned URL para download (válido 10 minutos)
    const downloadUrl = await generatePresignedDownloadUrl(backup.objectKey, 600);

    // Obtener user ID para auditoría
    const user = await prisma.user.findFirst({
      where: { email: session.email },
      select: { id: true },
    });

    // Auditoría
    await logAudit({
      storeId: backup.storeId,
      userId: user?.id,
      action: 'CLOUD_BACKUP_DOWNLOAD_REQUESTED',
      entityType: 'SYSTEM',
      entityId: backupId,
      meta: {
        objectKey: backup.objectKey,
        sizeBytes: backup.sizeBytes,
        storeName: backup.store.name,
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl,
      backup: {
        id: backup.id,
        storeId: backup.storeId,
        storeName: backup.store.name,
        sizeBytes: backup.sizeBytes,
        sha256: backup.sha256,
        exportedAt: backup.exportedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[CloudBackup] Error requesting download:', error);
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al solicitar descarga' },
      { status: 500 }
    );
  }
}
